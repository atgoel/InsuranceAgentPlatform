import { Pool } from 'pg';
import { isPgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { ConflictError } from '../../../kernel/errors/domain-errors';
import { FieldCipher } from '../../../kernel/crypto/aes-gcm-field-cipher';
import { Clock } from '../../../kernel/domain/clock';
import { AuditLog } from '../../../kernel/audit/audit-log';
import { canonicalJson, sha256Hex } from '../../../kernel/domain/canonical-json';
import {
  AdapterPin, PinRepository, Certification, CertificationRepository, SubmissionRecord, SubmissionRepository,
  DeadLetter, DeadLetterRepository, EncryptedPayloadRepository, IntegrationCallEntry, IntegrationCallLog,
  BreakerSnapshot, BreakerStateStore, IntegrationHealthRecord, IntegrationHealthRepository,
  CallbackRepository, CanonicalCallback, IntegrationCallbackReader, IntegrationReconciliationReader, GatewaySubmissionResult,
} from '../application/ports';

function pg(tx: Transaction) {
  if (!isPgTransaction(tx)) throw new Error('Integration repository requires a Postgres transaction');
  return tx;
}

export class PgPinRepository implements PinRepository {
  async list(tx: Transaction) {
    const result = await pg(tx).query<{ props: AdapterPin }>('select props from integration_pin order by adapter_id');
    return result.rows.map((row) => row.props);
  }

  async put(tx: Transaction, pin: AdapterPin) {
    await pg(tx).query(
      'insert into integration_pin(tenant_id,adapter_id,props) values($1,$2,$3::jsonb) on conflict(tenant_id,adapter_id) do update set props=excluded.props',
      [tx.tenantId, pin.adapterId, JSON.stringify(pin)],
    );
  }
}

export class PgCertificationRepository implements CertificationRepository {
  async get(tx: Transaction, adapterId: string, version: string) {
    const result = await pg(tx).query<{ props: Certification }>(
      'select props from integration_certification where adapter_id=$1 and adapter_version=$2', [adapterId, version],
    );
    return result.rows[0]?.props;
  }

  async save(tx: Transaction, value: Certification) {
    await pg(tx).query(
      'insert into integration_certification(tenant_id,adapter_id,adapter_version,status,props) values($1,$2,$3,$4,$5::jsonb) on conflict(tenant_id,adapter_id,adapter_version) do update set status=excluded.status,props=excluded.props',
      [tx.tenantId, value.adapterId, value.adapterVersion, value.status, JSON.stringify(value)],
    );
  }
}

export class PgSubmissionRepository implements SubmissionRepository {
  async reserve(tx: Transaction, record: SubmissionRecord) {
    const result = await pg(tx).query(
      'insert into integration_submission(tenant_id,id,idempotency_key,state,attempts,next_attempt_at,lease_until,created_at,props) values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) on conflict do nothing',
      [tx.tenantId, record.id, record.idempotencyKey, record.state, record.attempts,
        record.nextAttemptAt ?? null, record.leaseUntil ?? null, record.createdAt, JSON.stringify(record)],
    );
    const stored = await this.getByKey(tx, record.idempotencyKey);
    if (!stored) throw new Error('Reserved submission missing');
    return { created: result.rowCount === 1, record: stored };
  }

  async getByKey(tx: Transaction, idempotencyKey: string) {
    const result = await pg(tx).query<{ props: SubmissionRecord }>(
      'select props from integration_submission where idempotency_key=$1', [idempotencyKey],
    );
    return result.rows[0]?.props;
  }

  async claimDue(tx: Transaction, now: string, leaseUntil: string, limit: number) {
    const result = await pg(tx).query<{ props: SubmissionRecord }>(
      `with due as (
        select tenant_id,id from integration_submission
        where (state='SENDING' and lease_until <= $1::timestamptz)
          or (state='PENDING' and next_attempt_at <= $1::timestamptz and (lease_until is null or lease_until <= $1::timestamptz))
        order by created_at,id for update skip locked limit $3
      ) update integration_submission s set state='PENDING',lease_until=$2::timestamptz,
        props=s.props || jsonb_build_object('state','PENDING','leaseUntil',$2::text,'updatedAt',$1::text)
      from due where s.tenant_id=due.tenant_id and s.id=due.id returning s.props`, [now, leaseUntil, limit],
    );
    return result.rows.map((row) => row.props);
  }

  async save(tx: Transaction, record: SubmissionRecord, expected: { state: SubmissionRecord['state']; leaseUntil?: string }) {
    const result = await pg(tx).query(
      `update integration_submission set state=$3,attempts=$4,next_attempt_at=$5,lease_until=$6,
       props=($7::jsonb-'proposalEnc') || case when props ? 'proposalEnc'
         then jsonb_build_object('proposalEnc',props->>'proposalEnc') else '{}'::jsonb end
       where id=$1 and idempotency_key=$2 and state=$8 and lease_until is not distinct from $9::timestamptz`,
      [record.id, record.idempotencyKey, record.state, record.attempts, record.nextAttemptAt ?? null,
        record.leaseUntil ?? null, JSON.stringify(record), expected.state, expected.leaseUntil ?? null],
    );
    return result.rowCount === 1;
  }

  async purgeProposalBefore(tx: Transaction, before: string) {
    const result = await pg(tx).query(
      "update integration_submission set props=props-'proposalEnc' where created_at <= $1::timestamptz and props ? 'proposalEnc'", [before],
    );
    return result.rowCount;
  }
}

export class PgDeadLetterRepository implements DeadLetterRepository {
  async get(tx: Transaction, id: string) {
    const result = await pg(tx).query<{ props: DeadLetter }>('select props from dead_letter where id=$1', [id]);
    return result.rows[0]?.props;
  }

  async save(tx: Transaction, value: DeadLetter) {
    const result = await pg(tx).query(
      `insert into dead_letter(tenant_id,id,status,attempts,created_at,replayed_from_id,props)
       values($1,$2,$3,$4,$5,$6,$7::jsonb) on conflict(tenant_id,id) do update
       set status=excluded.status,attempts=excluded.attempts,props=excluded.props where dead_letter.status='OPEN'`,
      [tx.tenantId, value.id, value.status, value.attempts, value.createdAt, value.replayedFromId ?? null, JSON.stringify(value)],
    );
    if (!result.rowCount) throw new ConflictError('dead_letter_closed', 'Dead letter is already closed');
  }

  async list(tx: Transaction, query: { status?: DeadLetter['status']; cursor?: string; limit: number }) {
    const result = await pg(tx).query<{ props: DeadLetter }>(
      `select props from dead_letter where ($1::text is null or status=$1)
       and ($2::text is null or created_at < (select created_at from dead_letter where id=$2)
         or (created_at=(select created_at from dead_letter where id=$2) and id>$2))
       order by created_at desc,id limit $3`, [query.status ?? null, query.cursor ?? null, query.limit + 1],
    );
    const items = result.rows.slice(0, query.limit).map((row) => row.props);
    return { items, nextCursor: result.rows.length > query.limit ? items.at(-1)?.id : undefined };
  }
}

export class PgEncryptedPayloadRepository implements EncryptedPayloadRepository {
  async put(tx: Transaction, value: { id: string; payloadEnc: string; expiresAt: string }) {
    await pg(tx).query(
      'insert into integration_payload(tenant_id,id,payload_enc,expires_at) values($1,$2,$3,$4) on conflict(tenant_id,id) do update set payload_enc=excluded.payload_enc,expires_at=excluded.expires_at',
      [tx.tenantId, value.id, value.payloadEnc, value.expiresAt],
    );
  }

  async get(tx: Transaction, id: string) {
    const result = await pg(tx).query<{ payloadEnc: string; expiresAt: Date }>(
      'select payload_enc as "payloadEnc",expires_at as "expiresAt" from integration_payload where id=$1', [id],
    );
    const row = result.rows[0];
    return row ? { payloadEnc: row.payloadEnc, expiresAt: row.expiresAt.toISOString() } : undefined;
  }

  async purgeBefore(tx: Transaction, before: string) {
    return (await pg(tx).query('delete from integration_payload where expires_at <= $1::timestamptz', [before])).rowCount;
  }
}

export class PgIntegrationCallLog implements IntegrationCallLog {
  async record(tx: Transaction, entry: IntegrationCallEntry) {
    await pg(tx).query('insert into integration_call_log(tenant_id,id,at,outcome,props) values($1,$2,$3,$4,$5::jsonb)',
      [tx.tenantId, entry.id, entry.at, entry.outcome, JSON.stringify(entry)]);
  }

  async purgeBefore(tx: Transaction, before: string) {
    return (await pg(tx).query('delete from integration_call_log where at <= $1::timestamptz', [before])).rowCount;
  }
}

export class PgBreakerStateStore implements BreakerStateStore {
  constructor(private readonly pool: Pool) {}

  async get(adapterId: string, adapterVersion: string, operation: BreakerSnapshot['operation']) {
    const result = await this.pool.query<{ props: BreakerSnapshot }>(
      'select props from integration_breaker_state where adapter_id=$1 and adapter_version=$2 and operation=$3',
      [adapterId, adapterVersion, operation],
    );
    return result.rows[0]?.props;
  }

  async save(value: BreakerSnapshot) {
    await this.pool.query(
      'insert into integration_breaker_state(adapter_id,adapter_version,operation,state,props) values($1,$2,$3,$4,$5::jsonb) on conflict(adapter_id,adapter_version,operation) do update set state=excluded.state,props=excluded.props',
      [value.adapterId, value.adapterVersion, value.operation, value.state, JSON.stringify(value)],
    );
  }
}

export class PgIntegrationHealthRepository implements IntegrationHealthRepository {
  async get(tx: Transaction, adapterId: string, version: string) {
    const result = await pg(tx).query<{ props: IntegrationHealthRecord }>(
      'select props from integration_health where adapter_id=$1 and adapter_version=$2', [adapterId, version],
    );
    return result.rows[0]?.props;
  }

  async recordProbe(tx: Transaction, adapterId: string, version: string, probe: IntegrationHealthRecord['probes'][number]) {
    await pg(tx).query(
      `insert into integration_health(tenant_id,adapter_id,adapter_version,props) values($1,$2,$3,$4::jsonb)
       on conflict(tenant_id,adapter_id,adapter_version) do update set props=
       jsonb_build_object('adapterId',$2::text,'adapterVersion',$3::text,'probes',
         (select jsonb_agg(p.value order by p.ordinality) from jsonb_array_elements(
           integration_health.props->'probes' || $5::jsonb) with ordinality p(value,ordinality)
          where p.ordinality > greatest(0,jsonb_array_length(integration_health.props->'probes')+1-20)))
       || case when $6::text is not null then jsonb_build_object('lastOkAt',$6::text)
         when integration_health.props ? 'lastOkAt' then jsonb_build_object('lastOkAt',integration_health.props->>'lastOkAt')
         else '{}'::jsonb end`,
      [tx.tenantId, adapterId, version, JSON.stringify({ adapterId, adapterVersion: version, probes: [probe],
        ...(probe.outcome === 'success' ? { lastOkAt: probe.at } : {}) }), JSON.stringify([probe]),
        probe.outcome === 'success' ? probe.at : null],
    );
  }
}

type CallbackInput = Parameters<CallbackRepository['accept']>[1];
type StoredCallback = { callbackId: string; rawBodyHash: string; canonicalPayloadEnc: string | null; expiresAt: Date };

export class PgCallbackRepository implements CallbackRepository {
  constructor(private readonly cipher: FieldCipher) {}

  async accept(tx: Transaction, input: CallbackInput) {
    const canonical = JSON.parse(await this.cipher.decrypt(tx.tenantId, input.canonicalPayloadEnc)) as CanonicalCallback;
    await this.lockCursor(tx, input);
    const previous = await pg(tx).query<StoredCallback>(
      'select callback_id as "callbackId",raw_body_hash as "rawBodyHash" from callback_raw where adapter_id=$1 and event_id=$2',
      [input.adapterId, input.eventId],
    );
    if (previous.rows[0]) {
      if (previous.rows[0].rawBodyHash !== input.rawBodyHash) return { kind: 'CONFLICT' as const };
      return { kind: 'DUPLICATE' as const, callbackId: previous.rows[0].callbackId };
    }
    const statusHash = sha256Hex(canonicalJson(canonical.status));
    if (await this.isStale(tx, input, statusHash)) return { kind: 'STALE' as const };
    const accepted = await this.insert(tx, input);
    if (!accepted) {
      const concurrent = await pg(tx).query<StoredCallback>(
        'select callback_id as "callbackId",raw_body_hash as "rawBodyHash" from callback_raw where adapter_id=$1 and event_id=$2',
        [input.adapterId, input.eventId],
      );
      const row = concurrent.rows[0];
      if (!row || row.rawBodyHash !== input.rawBodyHash) return { kind: 'CONFLICT' as const };
      return { kind: 'DUPLICATE' as const, callbackId: row.callbackId };
    }
    await pg(tx).query(
      'update integration_callback_cursor set occurred_at=$3,status_hash=$4 where adapter_id=$1 and idempotency_key=$2',
      [input.adapterId, input.idempotencyKey, input.occurredAt, statusHash],
    );
    return { kind: 'ACCEPTED' as const, callbackId: input.callbackId };
  }

  private async lockCursor(tx: Transaction, input: CallbackInput) {
    await pg(tx).query(
      'insert into integration_callback_cursor(tenant_id,adapter_id,idempotency_key) values($1,$2,$3) on conflict do nothing',
      [tx.tenantId, input.adapterId, input.idempotencyKey],
    );
    await pg(tx).query('select 1 from integration_callback_cursor where adapter_id=$1 and idempotency_key=$2 for update',
      [input.adapterId, input.idempotencyKey]);
  }

  private async isStale(tx: Transaction, input: CallbackInput, statusHash: string) {
    const result = await pg(tx).query<{ occurredAt: Date | null; statusHash: string | null }>(
      'select occurred_at as "occurredAt",status_hash as "statusHash" from integration_callback_cursor where adapter_id=$1 and idempotency_key=$2',
      [input.adapterId, input.idempotencyKey],
    );
    const cursor = result.rows[0];
    if (!cursor?.occurredAt) return false;
    const incomingAt = Date.parse(input.occurredAt);
    return incomingAt < cursor.occurredAt.getTime() || (incomingAt === cursor.occurredAt.getTime() && cursor.statusHash !== statusHash);
  }

  private async insert(tx: Transaction, input: CallbackInput) {
    const result = await pg(tx).query(
      `insert into callback_raw(tenant_id,callback_id,adapter_id,adapter_version,event_id,idempotency_key,
        occurred_at,received_at,expires_at,raw_body_hash,raw_payload_enc,canonical_payload_enc)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) on conflict(tenant_id,adapter_id,event_id) do nothing`,
      [tx.tenantId, input.callbackId, input.adapterId, input.adapterVersion, input.eventId, input.idempotencyKey,
        input.occurredAt, input.receivedAt, input.expiresAt, input.rawBodyHash, input.rawPayloadEnc, input.canonicalPayloadEnc],
    );
    return result.rowCount === 1;
  }

  async purgeExpired(tx: Transaction, now: string) {
    return (await pg(tx).query(
      'update callback_raw set raw_payload_enc=null,canonical_payload_enc=null where expires_at <= $1::timestamptz and canonical_payload_enc is not null',
      [now],
    )).rowCount;
  }
}

export class PgIntegrationCallbackReader implements IntegrationCallbackReader {
  constructor(private readonly deps: { cipher: FieldCipher; clock: Clock; auditLog: AuditLog }) {}

  async get(tx: Transaction, callbackId: string) {
    const result = await pg(tx).query<StoredCallback>(
      'select canonical_payload_enc as "canonicalPayloadEnc",expires_at as "expiresAt" from callback_raw where callback_id=$1',
      [callbackId],
    );
    const row = result.rows[0];
    if (!row?.canonicalPayloadEnc || row.expiresAt.getTime() <= this.deps.clock.now().getTime()) return undefined;
    const canonical = JSON.parse(await this.deps.cipher.decrypt(tx.tenantId, row.canonicalPayloadEnc)) as CanonicalCallback;
    await this.deps.auditLog.append(tx, { action: 'integration.callback.read', entityType: 'IntegrationCallback', entityId: callbackId });
    return canonical;
  }
}

export class PgIntegrationReconciliationReader implements IntegrationReconciliationReader {
  constructor(private readonly deps: { cipher: FieldCipher; auditLog: AuditLog }) {}

  async get(tx: Transaction, reconciliationId: string) {
    const result = await pg(tx).query<{ props: SubmissionRecord }>('select props from integration_submission where id=$1', [reconciliationId]);
    const row = result.rows[0]?.props;
    if (!row?.resultEnc || row.resultKind !== 'RECONCILED') return undefined;
    const reconciled = JSON.parse(await this.deps.cipher.decrypt(tx.tenantId, row.resultEnc)) as GatewaySubmissionResult;
    if (reconciled.kind !== 'RECONCILED') return undefined;
    await this.deps.auditLog.append(tx, { action: 'integration.reconciliation.read', entityType: 'IntegrationSubmission', entityId: reconciliationId });
    return reconciled.status;
  }
}
