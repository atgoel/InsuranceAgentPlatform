import { Transaction } from '../../../kernel/persistence/unit-of-work';
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

class TenantRows<T> {
  protected readonly rows = new Map<string, Map<string, T>>();

  protected tenant(tx: Transaction): Map<string, T> {
    let rows = this.rows.get(tx.tenantId);
    if (!rows) {
      rows = new Map();
      this.rows.set(tx.tenantId, rows);
    }
    return rows;
  }
}

export class InMemoryPinRepository extends TenantRows<AdapterPin> implements PinRepository {
  async list(tx: Transaction) {
    return structuredClone([...this.tenant(tx).values()]);
  }

  async put(tx: Transaction, pin: AdapterPin) {
    this.tenant(tx).set(pin.adapterId, structuredClone(pin));
  }
}

export class InMemoryCertificationRepository extends TenantRows<Certification> implements CertificationRepository {
  async get(tx: Transaction, adapterId: string, version: string) {
    return structuredClone(this.tenant(tx).get(`${adapterId}:${version}`));
  }

  async save(tx: Transaction, certification: Certification) {
    this.tenant(tx).set(`${certification.adapterId}:${certification.adapterVersion}`, structuredClone(certification));
  }
}

export class InMemorySubmissionRepository extends TenantRows<SubmissionRecord> implements SubmissionRepository {
  async reserve(tx: Transaction, record: SubmissionRecord) {
    const rows = this.tenant(tx);
    const previous = rows.get(record.idempotencyKey);
    if (previous) return { created: false, record: structuredClone(previous) };
    rows.set(record.idempotencyKey, structuredClone(record));
    return { created: true, record: structuredClone(record) };
  }

  async getByKey(tx: Transaction, idempotencyKey: string) {
    return structuredClone(this.tenant(tx).get(idempotencyKey));
  }

  async claimDue(tx: Transaction, now: string, leaseUntil: string, limit: number) {
    const candidates = [...this.tenant(tx).values()].filter((row) => {
      if (row.state === 'SENDING') return !!row.leaseUntil && row.leaseUntil <= now;
      return row.state === 'PENDING' && !!row.nextAttemptAt && row.nextAttemptAt <= now && (!row.leaseUntil || row.leaseUntil <= now);
    });
    candidates.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const claimed = candidates.slice(0, limit);
    for (const row of claimed) {
      row.state = 'PENDING';
      row.leaseUntil = leaseUntil;
      row.updatedAt = now;
    }
    return structuredClone(claimed);
  }

  async save(tx: Transaction, record: SubmissionRecord, expected: { state: SubmissionRecord['state']; leaseUntil?: string }) {
    const previous = this.tenant(tx).get(record.idempotencyKey);
    if (!previous || previous.id !== record.id || previous.state !== expected.state || previous.leaseUntil !== expected.leaseUntil) {
      return false;
    }
    const updated = structuredClone(record);
    if (previous.proposalEnc === undefined) delete updated.proposalEnc;
    else updated.proposalEnc = previous.proposalEnc;
    this.tenant(tx).set(record.idempotencyKey, updated);
    return true;
  }

  async purgeProposalBefore(tx: Transaction, before: string) {
    let count = 0;
    for (const row of this.tenant(tx).values()) {
      if (row.createdAt <= before && row.proposalEnc !== undefined) {
        delete row.proposalEnc;
        count += 1;
      }
    }
    return count;
  }

  async findById(tx: Transaction, id: string) {
    return structuredClone([...this.tenant(tx).values()].find((row) => row.id === id));
  }
}

export class InMemoryDeadLetterRepository extends TenantRows<DeadLetter> implements DeadLetterRepository {
  async get(tx: Transaction, id: string) {
    return structuredClone(this.tenant(tx).get(id));
  }

  async save(tx: Transaction, entry: DeadLetter) {
    const rows = this.tenant(tx);
    const previous = rows.get(entry.id);
    if (previous && previous.status !== 'OPEN') {
      throw new ConflictError('dead_letter_closed', 'Dead letter is already closed');
    }
    if (entry.replayedFromId && [...rows.values()].some((row) => row.replayedFromId === entry.replayedFromId && row.id !== entry.id)) {
      throw new ConflictError('dead_letter_closed', 'Replay already recorded');
    }
    rows.set(entry.id, structuredClone(entry));
  }

  async list(tx: Transaction, query: { status?: DeadLetter['status']; cursor?: string; limit: number }) {
    const cursor = query.cursor ? this.tenant(tx).get(query.cursor) : undefined;
    if (query.cursor && !cursor) return { items: [], nextCursor: undefined };
    const rows = [...this.tenant(tx).values()].filter((row) => {
      if (query.status && row.status !== query.status) return false;
      return !cursor || row.createdAt < cursor.createdAt || (row.createdAt === cursor.createdAt && row.id > cursor.id);
    });
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
    const items = rows.slice(0, query.limit);
    return {
      items: structuredClone(items),
      nextCursor: query.limit < rows.length ? items.at(-1)?.id : undefined,
    };
  }
}

export class InMemoryEncryptedPayloadRepository extends TenantRows<{ payloadEnc: string; expiresAt: string }>
  implements EncryptedPayloadRepository {
  async put(tx: Transaction, value: { id: string; payloadEnc: string; expiresAt: string }) {
    this.tenant(tx).set(value.id, { payloadEnc: value.payloadEnc, expiresAt: value.expiresAt });
  }

  async get(tx: Transaction, id: string) {
    return structuredClone(this.tenant(tx).get(id));
  }

  async purgeBefore(tx: Transaction, before: string) {
    const rows = this.tenant(tx);
    let count = 0;
    for (const [id, row] of rows) {
      if (row.expiresAt <= before) {
        rows.delete(id);
        count += 1;
      }
    }
    return count;
  }
}

export class InMemoryIntegrationCallLog extends TenantRows<IntegrationCallEntry> implements IntegrationCallLog {
  async record(tx: Transaction, entry: IntegrationCallEntry) {
    this.tenant(tx).set(entry.id, structuredClone(entry));
  }

  async purgeBefore(tx: Transaction, before: string) {
    const rows = this.tenant(tx);
    let count = 0;
    for (const [id, row] of rows) {
      if (row.at <= before) {
        rows.delete(id);
        count += 1;
      }
    }
    return count;
  }
}

export class InMemoryBreakerStateStore implements BreakerStateStore {
  private readonly rows = new Map<string, BreakerSnapshot>();

  async get(adapterId: string, adapterVersion: string, operation: BreakerSnapshot['operation']) {
    return structuredClone(this.rows.get(`${adapterId}:${adapterVersion}:${operation}`));
  }

  async save(value: BreakerSnapshot) {
    this.rows.set(`${value.adapterId}:${value.adapterVersion}:${value.operation}`, structuredClone(value));
  }
}

export class InMemoryIntegrationHealthRepository extends TenantRows<IntegrationHealthRecord> implements IntegrationHealthRepository {
  async get(tx: Transaction, adapterId: string, version: string) {
    return structuredClone(this.tenant(tx).get(`${adapterId}:${version}`));
  }

  async recordProbe(tx: Transaction, adapterId: string, version: string, probe: IntegrationHealthRecord['probes'][number]) {
    const rows = this.tenant(tx);
    const previous = rows.get(`${adapterId}:${version}`) ?? { adapterId, adapterVersion: version, probes: [] };
    previous.probes = [...previous.probes, structuredClone(probe)].slice(-20);
    if (probe.outcome === 'success') previous.lastOkAt = probe.at;
    rows.set(`${adapterId}:${version}`, previous);
  }
}

type CallbackInput = Parameters<CallbackRepository['accept']>[1];

export class InMemoryCallbackRepository extends TenantRows<CallbackInput> implements CallbackRepository {
  private readonly cursors = new Map<string, { occurredAt: string; statusHash: string }>();

  constructor(private readonly cipher: FieldCipher) {
    super();
  }

  async accept(tx: Transaction, input: CallbackInput) {
    const canonical = JSON.parse(await this.cipher.decrypt(tx.tenantId, input.canonicalPayloadEnc)) as CanonicalCallback;
    const rows = this.tenant(tx);
    const dedupKey = `${input.adapterId}:${input.eventId}`;
    const previous = rows.get(dedupKey);
    if (previous) {
      if (previous.rawBodyHash !== input.rawBodyHash) return { kind: 'CONFLICT' as const };
      return { kind: 'DUPLICATE' as const, callbackId: previous.callbackId };
    }
    const cursorKey = `${tx.tenantId}:${input.adapterId}:${input.idempotencyKey}`;
    const cursor = this.cursors.get(cursorKey);
    const statusHash = sha256Hex(canonicalJson(canonical.status));
    if (cursor && (input.occurredAt < cursor.occurredAt || (input.occurredAt === cursor.occurredAt && statusHash !== cursor.statusHash))) {
      return { kind: 'STALE' as const };
    }
    rows.set(dedupKey, structuredClone(input));
    this.cursors.set(cursorKey, { occurredAt: input.occurredAt, statusHash });
    return { kind: 'ACCEPTED' as const, callbackId: input.callbackId };
  }

  async purgeExpired(tx: Transaction, now: string) {
    let count = 0;
    for (const row of this.tenant(tx).values()) {
      if (row.expiresAt <= now && row.canonicalPayloadEnc) {
        row.canonicalPayloadEnc = '';
        row.rawPayloadEnc = '';
        count += 1;
      }
    }
    return count;
  }

  async findById(tx: Transaction, id: string) {
    return structuredClone([...this.tenant(tx).values()].find((row) => row.callbackId === id));
  }
}

export class InMemoryIntegrationCallbackReader implements IntegrationCallbackReader {
  constructor(private readonly deps: { callbacks: InMemoryCallbackRepository; cipher: FieldCipher; clock: Clock; auditLog: AuditLog }) {}

  async get(tx: Transaction, callbackId: string) {
    const row = await this.deps.callbacks.findById(tx, callbackId);
    if (!row || !row.canonicalPayloadEnc || row.expiresAt <= this.deps.clock.now().toISOString()) return undefined;
    const canonical = JSON.parse(await this.deps.cipher.decrypt(tx.tenantId, row.canonicalPayloadEnc)) as CanonicalCallback;
    await this.deps.auditLog.append(tx, { action: 'integration.callback.read', entityType: 'IntegrationCallback', entityId: callbackId });
    return canonical;
  }
}

export class InMemoryIntegrationReconciliationReader implements IntegrationReconciliationReader {
  constructor(private readonly deps: { submissions: InMemorySubmissionRepository; cipher: FieldCipher; auditLog: AuditLog }) {}

  async get(tx: Transaction, reconciliationId: string) {
    const row = await this.deps.submissions.findById(tx, reconciliationId);
    if (!row?.resultEnc || row.resultKind !== 'RECONCILED') return undefined;
    const result = JSON.parse(await this.deps.cipher.decrypt(tx.tenantId, row.resultEnc)) as GatewaySubmissionResult;
    if (result.kind !== 'RECONCILED') return undefined;
    await this.deps.auditLog.append(tx, { action: 'integration.reconciliation.read', entityType: 'IntegrationSubmission', entityId: reconciliationId });
    return result.status;
  }
}
