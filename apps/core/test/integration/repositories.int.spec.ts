import { Pool } from 'pg';
import { runMigrations, MIGRATIONS_DIR } from '../../src/kernel/db/migrate';
import { PgUnitOfWork } from '../../src/kernel/persistence/pg-unit-of-work';
import { Tracer } from '../../src/kernel/observability/tracer';
import { MetricsRegistry } from '../../src/kernel/observability/metrics';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { SequentialIdGenerator } from '../../src/kernel/domain/id-generator';
import { Redactor } from '../../src/kernel/observability/redactor';
import { PgOutbox } from '../../src/kernel/outbox/pg-outbox';
import { DomainEventFactory } from '../../src/kernel/domain/domain-event';
import {
  PgSubmissionRepository, PgCallbackRepository, PgIntegrationCallbackReader,
  PgIntegrationReconciliationReader, PgDeadLetterRepository, PgEncryptedPayloadRepository,
  PgPinRepository, PgCertificationRepository, PgIntegrationHealthRepository, PgIntegrationCallLog,
} from '../../src/modules/integration/infrastructure/pg-integration.repositories';
import { integrationRepositoryContract, repositoryCipher, repositoryClock } from './repositories.contract';

const run = process.env.DATABASE_URL ? describe : describe.skip;
run('AC-M08-10 Postgres integration repositories', () => {
  const owner = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL });
  const app = new Pool({ connectionString: process.env.DATABASE_URL });
  const suffix = `integration_${Date.now()}`;
  const tenantA = `${suffix}_a`;
  const tenantB = `${suffix}_b`;
  const uow = new PgUnitOfWork(app, new Tracer(repositoryClock, new MetricsRegistry()));
  const auditLog = new InMemoryAuditLog(repositoryClock, new SequentialIdGenerator(), new Redactor());
  integrationRepositoryContract('postgres', async () => {
    await runMigrations(owner, MIGRATIONS_DIR);
    for (const tenant of [tenantA, tenantB]) {
      await owner.query(
        "insert into tenant(id,slug,display_name,kind,status,plan_code,deployment_mode,crm_mode) values($1,$1,$1,'ORGANISATION','active','TEAM','pooled','solo_lite')",
        [tenant],
      );
    }
    return {
      submissions: new PgSubmissionRepository(), callbacks: new PgCallbackRepository(repositoryCipher),
      callbackReader: new PgIntegrationCallbackReader({ cipher: repositoryCipher, clock: repositoryClock, auditLog }),
      reconciliationReader: new PgIntegrationReconciliationReader({ cipher: repositoryCipher, auditLog }),
      deadLetters: new PgDeadLetterRepository(), payloads: new PgEncryptedPayloadRepository(),
      pins: new PgPinRepository(), certifications: new PgCertificationRepository(),
      health: new PgIntegrationHealthRepository(), calls: new PgIntegrationCallLog(),
      auditEvents: auditLog.events,
      tenantA, tenantB, run: (tenant, work) => uow.run(tenant, work),
    };
  });
  afterAll(async () => {
    await owner.end();
    await app.end();
  });

  it('AC-M08-10 enforces app-role forced RLS and preserves encrypted barriers after repository recreation', async () => {
    const role = await app.query<{ current_user: string }>('select current_user');
    expect(role.rows[0].current_user).toBe('iap_app');
    const tables = ['integration_pin', 'integration_certification', 'integration_submission', 'dead_letter',
      'integration_payload', 'integration_call_log', 'callback_raw', 'integration_callback_cursor', 'integration_health'];
    const flags = await owner.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      'select relname,relrowsecurity,relforcerowsecurity from pg_class where relname=any($1::text[])', [tables],
    );
    expect(flags.rows).toHaveLength(tables.length);
    expect(flags.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const restarted = await uow.run(tenantA, (tx) => new PgSubmissionRepository().getByKey(tx, 'retained'));
    expect(restarted?.state).toBe('COMPLETED');
    expect(restarted?.resultKind).toBe('RECONCILED');
    expect(restarted?.proposalEnc).toBeUndefined();
    expect(restarted?.resultEnc).not.toContain('NOT_FOUND');
    await uow.run(tenantA, async (tx) => {
      const raw = await tx.query<{ raw_payload_enc: string | null; canonical_payload_enc: string | null }>(
        'select raw_payload_enc,canonical_payload_enc from callback_raw',
      );
      expect(raw.rows).toHaveLength(3);
      expect(JSON.stringify(raw.rows)).not.toContain('canary-policy-number');
    });
    await uow.run(tenantB, async (tx) => {
      if (tx.kind !== 'pg') throw new Error('Postgres fixture expected');
      const pgTx = tx as import('../../src/kernel/persistence/unit-of-work').PgTransaction;
      for (const table of tables.filter((table) => table !== 'integration_call_log')) {
        expect((await pgTx.query(`select * from ${table} where tenant_id=$1`, [tenantA])).rows).toEqual([]);
      }
    });
  });

  it('AC-M08-07 rolls back callback dedup and safe outbox reference together after a handler failure', async () => {
    const canonical = { schemaVersion: 'v1', eventId: 'rollback-event', occurredAt: '2026-10-04T00:00:00.000Z',
      kind: 'POLICY_STATUS', idempotencyKey: 'rollback-key',
      status: { schemaVersion: 'v1', status: 'NOT_FOUND', checkedAt: '2026-10-04T00:00:00.000Z' } };
    const input = { callbackId: 'rollback-callback', adapterId: 'insurer', adapterVersion: '1.0.0',
      eventId: canonical.eventId, idempotencyKey: canonical.idempotencyKey, occurredAt: canonical.occurredAt,
      receivedAt: canonical.occurredAt, expiresAt: '2027-04-02T00:00:00.000Z', rawBodyHash: 'hash-rollback',
      rawPayloadEnc: await repositoryCipher.encrypt(tenantA, 'canary-secret'),
      canonicalPayloadEnc: await repositoryCipher.encrypt(tenantA, JSON.stringify(canonical)) };
    const callbacks = new PgCallbackRepository(repositoryCipher);
    const outbox = new PgOutbox(owner);
    const ids = new SequentialIdGenerator();
    const events = new DomainEventFactory(repositoryClock, { next: (prefix) => `${suffix}_${ids.next(prefix)}` });
    await expect(uow.run(tenantA, async (tx) => {
      expect(await callbacks.accept(tx, input)).toEqual({ kind: 'ACCEPTED', callbackId: input.callbackId });
      await outbox.add(tx, events.create({ type: 'integration.callback.received', source: 'integration',
        subject: input.callbackId, tenantId: tenantA, data: { callbackId: input.callbackId } }));
      throw new Error('forced handler failure');
    })).rejects.toThrow('forced handler failure');
    await uow.run(tenantA, async (tx) => {
      expect((await tx.query('select callback_id from callback_raw where callback_id=$1', [input.callbackId])).rows).toEqual([]);
      expect((await tx.query('select id from outbox_event where subject=$1', [input.callbackId])).rows).toEqual([]);
    });
    await uow.run(tenantA, async (tx) => {
      expect(await callbacks.accept(tx, input)).toEqual({ kind: 'ACCEPTED', callbackId: input.callbackId });
      await outbox.add(tx, events.create({ type: 'integration.callback.received', source: 'integration',
        subject: input.callbackId, tenantId: tenantA, data: { callbackId: input.callbackId } }));
    });
    expect(await uow.run(tenantA, (tx) => new PgCallbackRepository(repositoryCipher).accept(tx, input)))
      .toEqual({ kind: 'DUPLICATE', callbackId: input.callbackId });
    expect(await uow.run(tenantA, (tx) => new PgCallbackRepository(repositoryCipher).accept(tx,
      { ...input, rawBodyHash: 'changed-after-restart' }))).toEqual({ kind: 'CONFLICT' });
    await uow.run(tenantA, async (tx) => {
      const committed = await tx.query<{ data: Record<string, unknown> }>('select data from outbox_event where subject=$1',
        [input.callbackId]);
      expect(committed.rows).toEqual([{ data: { callbackId: input.callbackId } }]);
      expect(JSON.stringify(committed.rows)).not.toContain('canary-secret');
    });
  });
});
