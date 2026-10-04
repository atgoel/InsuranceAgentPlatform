import { Transaction } from '../../src/kernel/persistence/unit-of-work';
import { AesGcmFieldCipher } from '../../src/kernel/crypto/aes-gcm-field-cipher';
import { FixedClock } from '../../src/kernel/domain/clock';
import { StoredAuditEvent } from '../../src/kernel/audit/audit-log';
import {
  SubmissionRepository, CallbackRepository, IntegrationCallbackReader, IntegrationReconciliationReader,
  DeadLetterRepository, EncryptedPayloadRepository, PinRepository, CertificationRepository,
  IntegrationHealthRepository, IntegrationCallLog, SubmissionRecord, CanonicalCallback,
} from '../../src/modules/integration/application/ports';

export const repositoryClock = new FixedClock(new Date('2026-10-04T00:00:00.000Z'));
export const repositoryCipher = new AesGcmFieldCipher(Buffer.alloc(32, 8));

interface Repositories {
  submissions: SubmissionRepository;
  callbacks: CallbackRepository;
  callbackReader: IntegrationCallbackReader;
  reconciliationReader: IntegrationReconciliationReader;
  deadLetters: DeadLetterRepository;
  payloads: EncryptedPayloadRepository;
  pins: PinRepository;
  certifications: CertificationRepository;
  health: IntegrationHealthRepository;
  calls: IntegrationCallLog;
  auditEvents: StoredAuditEvent[];
  tenantA: string;
  tenantB: string;
  run<T>(tenant: string, work: (tx: Transaction) => Promise<T>): Promise<T>;
}

function record(key: string): SubmissionRecord {
  return {
    id: `submission_${key}`, adapterId: 'insurer', adapterVersion: '1.0.0', idempotencyKey: key, inputHash: 'hash',
    statusRequest: { schemaVersion: 'v1', insurerId: 'insurer', line: 'LIFE' },
    state: 'SENDING', attempts: 0, leaseUntil: '2026-10-04T00:01:00.000Z',
    createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z',
  };
}

async function callback(tenant: string, id: string, occurredAt: string, status: 'NOT_FOUND' | 'DECLINED' = 'NOT_FOUND') {
  const canonical: CanonicalCallback = {
    schemaVersion: 'v1', eventId: id, occurredAt, kind: 'POLICY_STATUS', idempotencyKey: 'callback-business',
    status: status === 'NOT_FOUND' ? { schemaVersion: 'v1', status, checkedAt: occurredAt }
      : { schemaVersion: 'v1', status, checkedAt: occurredAt, insurerRef: 'ins-ref' },
  };
  return {
    callbackId: id, adapterId: 'insurer', adapterVersion: '1.0.0', eventId: id,
    idempotencyKey: canonical.idempotencyKey, occurredAt, rawBodyHash: `hash-${id}`,
    rawPayloadEnc: await repositoryCipher.encrypt(tenant, 'canary-policy-number'),
    canonicalPayloadEnc: await repositoryCipher.encrypt(tenant, JSON.stringify(canonical)),
    receivedAt: '2026-10-04T00:00:00.000Z', expiresAt: '2027-04-02T00:00:00.000Z',
  };
}

export function integrationRepositoryContract(name: string, factory: () => Promise<Repositories>) {
  describe(`M08 repository contract (${name})`, () => {
    let repos: Repositories;
    beforeAll(async () => {
      repos = await factory();
    });

    it('AC-M08-05 reserves one tenant business key and preserves original binding across duplicate callers', async () => {
      for (let round = 0; round < 8; round += 1) {
        const first = record(`reserve-${round}`);
        const results = await Promise.all([
          repos.run(repos.tenantA, (tx) => repos.submissions.reserve(tx, first)),
          repos.run(repos.tenantA, (tx) => repos.submissions.reserve(tx, { ...first, adapterVersion: '2.0.0' })),
        ]);
        expect(results.map((result) => result.created).sort()).toEqual([false, true]);
        expect(results[0].record.adapterVersion).toBe(results[1].record.adapterVersion);
        expect(await repos.run(repos.tenantB, (tx) => repos.submissions.getByKey(tx, first.idempotencyKey))).toBeUndefined();
        await repos.run(repos.tenantA, (tx) => repos.submissions.save(tx,
          { ...results[0].record, state: 'COMPLETED' }, { state: 'SENDING', leaseUntil: first.leaseUntil }));
      }
    });

    it('AC-M08-05 claims expired send leases once and rejects a late direct response', async () => {
      const original = record('lease');
      await repos.run(repos.tenantA, (tx) => repos.submissions.reserve(tx, original));
      expect(await repos.run(repos.tenantA, (tx) => repos.submissions.claimDue(tx,
        '2026-10-04T00:00:59.999Z', '2026-10-04T00:02:00.000Z', 100))).toEqual([]);
      const claims = await Promise.all([1, 2].map(() => repos.run(repos.tenantA, (tx) => repos.submissions.claimDue(tx,
        '2026-10-04T00:01:00.000Z', '2026-10-04T00:02:00.000Z', 100))));
      expect(claims.flat().map((row) => row.id)).toEqual([original.id]);
      expect(claims.flat()[0].state).toBe('PENDING');
      expect(await repos.run(repos.tenantA, (tx) => repos.submissions.save(tx,
        { ...original, state: 'COMPLETED' }, { state: 'SENDING', leaseUntil: original.leaseUntil }))).toBe(false);
      const claimed = claims.flat()[0];
      expect(await repos.run(repos.tenantA, (tx) => repos.submissions.save(tx,
        { ...claimed, state: 'COMPLETED', leaseUntil: undefined }, { state: 'PENDING', leaseUntil: claimed.leaseUntil }))).toBe(true);
    });

    it('AC-M08-05 excludes future, completed and dead-letter work and recovers an expired pending lease', async () => {
      const states = [
        { ...record('future'), state: 'PENDING' as const, leaseUntil: undefined, nextAttemptAt: '2026-11-04T00:00:00.000Z' },
        { ...record('completed'), state: 'COMPLETED' as const, leaseUntil: undefined, nextAttemptAt: '2026-10-04T00:00:00.000Z' },
        { ...record('dead'), state: 'DEAD_LETTER' as const, leaseUntil: undefined, nextAttemptAt: '2026-10-04T00:00:00.000Z' },
        { ...record('pending'), state: 'PENDING' as const, nextAttemptAt: '2026-10-04T00:00:00.000Z' },
      ];
      for (const row of states) await repos.run(repos.tenantA, (tx) => repos.submissions.reserve(tx, row));
      const claimed = await repos.run(repos.tenantA, (tx) => repos.submissions.claimDue(tx,
        '2026-10-04T00:02:00.000Z', '2026-10-04T00:03:00.000Z', 100));
      expect(claimed.map((row) => row.id)).toEqual(['submission_pending']);
    });

    it('AC-M08-05 retains completed encrypted results and barriers while purging proposal content at the boundary', async () => {
      const terminal = { ...record('retained'), proposalEnc: await repositoryCipher.encrypt(repos.tenantA, 'canary-proposal') };
      const status = { schemaVersion: 'v1' as const, status: 'NOT_FOUND' as const, checkedAt: terminal.createdAt };
      const resultEnc = await repositoryCipher.encrypt(repos.tenantA, JSON.stringify({
        kind: 'RECONCILED', route: 'API', adapterId: 'insurer', adapterVersion: '1.0.0', reconciliationId: terminal.id, status,
      }));
      await repos.run(repos.tenantA, (tx) => repos.submissions.reserve(tx, terminal));
      await repos.run(repos.tenantA, (tx) => repos.submissions.save(tx,
        { ...terminal, state: 'COMPLETED', resultKind: 'RECONCILED', resultEnc },
        { state: 'SENDING', leaseUntil: terminal.leaseUntil }));
      expect(await repos.run(repos.tenantA, (tx) => repos.submissions.purgeProposalBefore(tx,
        '2026-10-03T23:59:59.999Z'))).toBe(0);
      expect(await repos.run(repos.tenantA, (tx) => repos.submissions.purgeProposalBefore(tx, terminal.createdAt))).toBe(1);
      const remaining = await repos.run(repos.tenantA, (tx) => repos.submissions.getByKey(tx, 'retained'));
      expect(remaining?.proposalEnc).toBeUndefined();
      expect(remaining?.resultEnc).toBe(resultEnc);
      expect(await repos.run(repos.tenantA, (tx) => repos.reconciliationReader.get(tx, terminal.id))).toEqual(status);
      expect(await repos.run(repos.tenantB, (tx) => repos.reconciliationReader.get(tx, terminal.id))).toBeUndefined();
      expect(repos.auditEvents.at(-1)).toMatchObject({
        tenantId: repos.tenantA, action: 'integration.reconciliation.read', entityId: terminal.id,
      });
    });

    it('AC-M08-05 cannot restore proposal ciphertext when retention runs during a leased status call', async () => {
      const original = { ...record('retention-race'), proposalEnc: await repositoryCipher.encrypt(repos.tenantA, 'old-proposal') };
      await repos.run(repos.tenantA, (tx) => repos.submissions.reserve(tx, original));
      const claimed = await repos.run(repos.tenantA, (tx) => repos.submissions.claimDue(tx,
        '2026-10-04T00:01:00.000Z', '2026-10-04T00:02:00.000Z', 100));
      expect(claimed.map((row) => row.id)).toEqual([original.id]);
      expect(claimed[0].proposalEnc).toBe(original.proposalEnc);
      expect(await repos.run(repos.tenantA, (tx) => repos.submissions.purgeProposalBefore(tx, original.createdAt))).toBe(1);
      expect(await repos.run(repos.tenantA, (tx) => repos.submissions.save(tx,
        { ...claimed[0], state: 'COMPLETED', leaseUntil: undefined },
        { state: 'PENDING', leaseUntil: claimed[0].leaseUntil }))).toBe(true);
      expect((await repos.run(repos.tenantA, (tx) => repos.submissions.getByKey(tx, original.idempotencyKey)))?.proposalEnc)
        .toBeUndefined();
    });

    it('AC-M08-06 closes dead letters once, excludes terminal entries from OPEN and encrypts/purges payloads exactly at expiry', async () => {
      const expiresAt = '2026-10-04T00:00:00.000Z';
      const entry = { id: 'dlq', adapterId: 'insurer', adapterVersion: '1.0.0', operation: 'GET_STATUS' as const,
        idempotencyKey: 'dead', payloadRef: 'payload', lastError: 'timeout', attempts: 3,
        ownerTeam: 'INTEGRATION_OPS' as const, status: 'OPEN' as const, createdAt: expiresAt, payloadExpiresAt: expiresAt };
      await repos.run(repos.tenantA, (tx) => repos.deadLetters.save(tx, entry));
      const closings = await Promise.allSettled([1, 2].map(() => repos.run(repos.tenantA,
        (tx) => repos.deadLetters.save(tx, { ...entry, status: 'REPLAYED' }))));
      expect(closings.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
      const rejection = closings.find((result) => result.status === 'rejected') as PromiseRejectedResult;
      expect(rejection.reason.code).toBe('dead_letter_closed');
      expect(await repos.run(repos.tenantA, (tx) => repos.deadLetters.list(tx, { status: 'OPEN', limit: 25 }))).toEqual({
        items: [], nextCursor: undefined,
      });
      expect(await repos.run(repos.tenantB, (tx) => repos.deadLetters.get(tx, entry.id))).toBeUndefined();
      const ciphertext = await repositoryCipher.encrypt(repos.tenantA, 'canary-replay');
      await repos.run(repos.tenantA, (tx) => repos.payloads.put(tx, { id: 'payload', payloadEnc: ciphertext, expiresAt }));
      expect(ciphertext).not.toContain('canary-replay');
      expect(await repos.run(repos.tenantB, (tx) => repos.payloads.get(tx, 'payload'))).toBeUndefined();
      expect(await repos.run(repos.tenantA, (tx) => repos.payloads.purgeBefore(tx, '2026-10-03T23:59:59.999Z'))).toBe(0);
      expect(await repos.run(repos.tenantA, (tx) => repos.payloads.purgeBefore(tx, expiresAt))).toBe(1);
      expect(await repos.run(repos.tenantA, (tx) => repos.payloads.get(tx, 'payload'))).toBeUndefined();
    });

    it('AC-M08-06 lists newest first with stable ID pagination and filters status', async () => {
      for (const id of ['page-a', 'page-b', 'page-c']) {
        await repos.run(repos.tenantA, (tx) => repos.deadLetters.save(tx, {
          id, adapterId: 'insurer', adapterVersion: '1.0.0', operation: 'QUOTE', idempotencyKey: id,
          payloadRef: id, lastError: 'network', attempts: 1, ownerTeam: 'INTEGRATION_OPS', status: 'OPEN',
          createdAt: '2026-10-05T00:00:00.000Z', payloadExpiresAt: '2027-04-03T00:00:00.000Z',
        }));
      }
      const first = await repos.run(repos.tenantA, (tx) => repos.deadLetters.list(tx, { status: 'OPEN', limit: 2 }));
      expect(first.items.map((row) => row.id)).toEqual(['page-a', 'page-b']);
      expect(first.nextCursor).toBe('page-b');
      const second = await repos.run(repos.tenantA, (tx) => repos.deadLetters.list(tx,
        { status: 'OPEN', limit: 2, cursor: first.nextCursor }));
      expect(second.items.map((row) => row.id)).toEqual(['page-c']);
      expect(second.nextCursor).toBeUndefined();
    });

    it('AC-M08-07 accepts once under concurrency, rejects changed duplicate bodies and older/equal conflicting status', async () => {
      const input = await callback(repos.tenantA, 'callback-1', '2026-10-03T23:59:00.000Z');
      const results = await Promise.all([1, 2].map(() => repos.run(repos.tenantA, (tx) => repos.callbacks.accept(tx, input))));
      expect(results.map((result) => result.kind).sort()).toEqual(['ACCEPTED', 'DUPLICATE']);
      expect(await repos.run(repos.tenantA, (tx) => repos.callbacks.accept(tx,
        { ...input, rawBodyHash: 'changed-body' }))).toEqual({ kind: 'CONFLICT' });
      const older = await callback(repos.tenantA, 'callback-older', '2026-10-03T23:58:00.000Z');
      expect(await repos.run(repos.tenantA, (tx) => repos.callbacks.accept(tx, older))).toEqual({ kind: 'STALE' });
      const conflicting = await callback(repos.tenantA, 'callback-conflicting', input.occurredAt, 'DECLINED');
      expect(await repos.run(repos.tenantA, (tx) => repos.callbacks.accept(tx, conflicting))).toEqual({ kind: 'STALE' });
      const later = await callback(repos.tenantA, 'callback-later', '2026-10-03T23:59:30.000Z', 'DECLINED');
      expect(await repos.run(repos.tenantA, (tx) => repos.callbacks.accept(tx, later))).toEqual({ kind: 'ACCEPTED', callbackId: later.callbackId });
    });

    it('AC-M08-07 scopes callback reads and expires content without losing duplicate protection', async () => {
      const input = await callback(repos.tenantA, 'callback-expiry', '2026-10-04T00:00:00.000Z');
      input.expiresAt = '2026-10-04T00:00:00.001Z';
      await repos.run(repos.tenantA, (tx) => repos.callbacks.accept(tx, input));
      const readsBefore = repos.auditEvents.length;
      expect((await repos.run(repos.tenantA, (tx) => repos.callbackReader.get(tx, input.callbackId)))?.eventId).toBe(input.eventId);
      expect(await repos.run(repos.tenantB, (tx) => repos.callbackReader.get(tx, input.callbackId))).toBeUndefined();
      expect(repos.auditEvents).toHaveLength(readsBefore + 1);
      expect(repos.auditEvents.at(-1)).toMatchObject({
        tenantId: repos.tenantA, action: 'integration.callback.read', entityId: input.callbackId,
      });
      repositoryClock.set(new Date(input.expiresAt));
      expect(await repos.run(repos.tenantA, (tx) => repos.callbackReader.get(tx, input.callbackId))).toBeUndefined();
      repositoryClock.set(new Date('2026-10-04T00:00:00.000Z'));
      expect(await repos.run(repos.tenantA, (tx) => repos.callbacks.purgeExpired(tx, '2026-10-04T00:00:00.000Z'))).toBe(0);
      expect(await repos.run(repos.tenantA, (tx) => repos.callbacks.purgeExpired(tx, input.expiresAt))).toBe(1);
      expect(await repos.run(repos.tenantA, (tx) => repos.callbackReader.get(tx, input.callbackId))).toBeUndefined();
      expect(await repos.run(repos.tenantA, (tx) => repos.callbacks.accept(tx, input))).toEqual({ kind: 'DUPLICATE', callbackId: input.callbackId });
    });

    it('AC-M08-08 scopes pins and exact-version certification', async () => {
      await repos.run(repos.tenantA, (tx) => repos.pins.put(tx, { adapterId: 'insurer', version: '1.0.0', updatedAt: '2026-10-04T00:00:00.000Z' }));
      await repos.run(repos.tenantA, (tx) => repos.certifications.save(tx, {
        adapterId: 'insurer', adapterVersion: '1.0.0', status: 'PASSED', checkedAt: '2026-10-04T00:00:00.000Z', checks: [],
      }));
      expect(await repos.run(repos.tenantB, (tx) => repos.pins.list(tx))).toEqual([]);
      expect(await repos.run(repos.tenantA, (tx) => repos.certifications.get(tx, 'insurer', '2.0.0'))).toBeUndefined();
      expect(await repos.run(repos.tenantB, (tx) => repos.certifications.get(tx, 'insurer', '1.0.0'))).toBeUndefined();
      expect((await repos.run(repos.tenantA, (tx) => repos.certifications.get(tx, 'insurer', '1.0.0')))?.status).toBe('PASSED');
    });

    it('AC-M08-08 atomically keeps last twenty probes and preserves the last successful probe', async () => {
      await repos.run(repos.tenantA, (tx) => repos.health.recordProbe(tx, 'insurer', '1.0.0',
        { at: '2026-10-03T00:00:00.000Z', outcome: 'success', latencyMs: 1 }));
      for (let index = 1; index <= 21; index += 1) {
        await repos.run(repos.tenantA, (tx) => repos.health.recordProbe(tx, 'insurer', '1.0.0',
          { at: '2026-10-04T00:00:00.000Z', outcome: 'failure', latencyMs: index }));
      }
      const health = await repos.run(repos.tenantA, (tx) => repos.health.get(tx, 'insurer', '1.0.0'));
      expect(health?.probes.map((probe) => probe.latencyMs)).toEqual(Array.from({ length: 20 }, (_, index) => index + 2));
      expect(health?.lastOkAt).toBe('2026-10-03T00:00:00.000Z');
      expect(await repos.run(repos.tenantB, (tx) => repos.health.get(tx, 'insurer', '1.0.0'))).toBeUndefined();
      await Promise.all([22, 23].map((latencyMs) => repos.run(repos.tenantA, (tx) => repos.health.recordProbe(tx,
        'insurer', '1.0.0', { at: '2026-10-04T00:00:00.000Z', outcome: 'unknown', latencyMs }))));
      const concurrent = await repos.run(repos.tenantA, (tx) => repos.health.get(tx, 'insurer', '1.0.0'));
      expect(concurrent?.probes.map((probe) => probe.latencyMs).sort((a, b) => a - b))
        .toEqual(Array.from({ length: 20 }, (_, index) => index + 4));
    });

    it('AC-M08-10 prunes call logs at the exact 90-day cutoff without touching another tenant', async () => {
      const entry = { id: 'call', adapterId: 'insurer', adapterVersion: '1.0.0', operation: 'QUOTE' as const, route: 'API' as const,
        idempotencyKey: 'call', outcome: 'success' as const, latencyMs: 10, at: '2026-07-06T00:00:00.000Z' };
      await repos.run(repos.tenantA, (tx) => repos.calls.record(tx, entry));
      await repos.run(repos.tenantB, (tx) => repos.calls.record(tx, entry));
      expect(await repos.run(repos.tenantA, (tx) => repos.calls.purgeBefore(tx, '2026-07-05T23:59:59.999Z'))).toBe(0);
      expect(await repos.run(repos.tenantA, (tx) => repos.calls.purgeBefore(tx, entry.at))).toBe(1);
      expect(await repos.run(repos.tenantA, (tx) => repos.calls.purgeBefore(tx, entry.at))).toBe(0);
      expect(await repos.run(repos.tenantB, (tx) => repos.calls.purgeBefore(tx, entry.at))).toBe(1);
    });
  });
}
