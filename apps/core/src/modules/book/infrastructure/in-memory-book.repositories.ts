import { TenantBuckets } from '../../../kernel/persistence/tenant-buckets';
import { ConflictError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { inScope } from '../../crm/application/crm-scope';
import { HeldPolicy, HeldPolicyProps } from '../domain/held-policy';
import { ImportBatch, ImportBatchProps } from '../domain/book-import';
import { ServicingRequest, ServicingRequestProps } from '../domain/servicing';
import {
  AlertLedger,
  HeldPolicyFilter,
  HeldPolicyRepository,
  ImportBatchRepository,
  RecordScope,
  ServicingRepository,
  Transaction,
} from '../application/ports';
export function matchesPolicy(p: Readonly<HeldPolicyProps>, f: HeldPolicyFilter): boolean {
  const equalFields: Array<[string | undefined, string | undefined]> = [
    [f.partyId, p.proposerPartyId],
    [f.line, p.line],
    [f.status, p.status],
    [f.category, p.commercials.category],
    [f.businessType, p.commercials.businessType],
    [f.businessSource, p.commercials.businessSource],
  ];
  const checks = [
    inScope({ ownerMemberId: p.servicingMemberId, orgUnitId: p.orgUnitId }, f.scope),
    equalFields.every(([filter, value]) => !filter || filter === value),
    !f.q || p.policyNumberLast4.includes(f.q),
    !f.bookedFrom || p.commercials.bookedOn >= f.bookedFrom,
    !f.bookedTo || p.commercials.bookedOn <= f.bookedTo,
    !f.referredBy || (p.commercials.referredBy?.name ?? '').toLowerCase().includes(f.referredBy.toLowerCase()),
    Object.entries(f.custom ?? {}).every(([key, value]) => String(p.customFields[key]) === value),
    !f.cursor || p.id > f.cursor,
  ];
  return checks.every(Boolean);
}
function save<
  P extends {
    id: string;
    version: number;
  },
>(bucket: Map<string, P>, props: Readonly<P>): void {
  if (bucket.has(props.id) && bucket.get(props.id)?.version !== props.version) throw new PreconditionFailedError();
  bucket.set(props.id, structuredClone({ ...props, version: props.version + 1 }));
}
export class InMemoryHeldPolicyRepository implements HeldPolicyRepository {
  private readonly rows = new TenantBuckets<Map<string, HeldPolicyProps>>(() => new Map());
  private readonly payments = new TenantBuckets<Set<string>>(() => new Set());
  async get(tx: Transaction, id: string) {
    const p = this.rows.of(tx).get(id);
    return p ? HeldPolicy.restore(structuredClone(p)) : undefined;
  }
  async save(tx: Transaction, policy: HeldPolicy) {
    const p = policy.props;
    for (const existing of this.rows.of(tx).values())
      if (
        existing.id !== p.id &&
        (existing.policyNumberHash === p.policyNumberHash || (p.saleRef && existing.saleRef?.policySaleId === p.saleRef.policySaleId))
      )
        throw new ConflictError('policy_number_taken', 'Policy already exists');
    save(this.rows.of(tx), p);
    policy.markSaved();
  }
  async all(tx: Transaction) {
    return [...this.rows.of(tx).values()].map((p) => HeldPolicy.restore(structuredClone(p)));
  }
  async findByNumberHash(tx: Transaction, hash: string) {
    return (await this.all(tx)).find((p) => p.props.policyNumberHash === hash);
  }
  async findBySaleRef(tx: Transaction, id: string) {
    return (await this.all(tx)).find((p) => p.props.saleRef?.policySaleId === id);
  }
  async list(tx: Transaction, f: HeldPolicyFilter) {
    const matches = (await this.all(tx)).filter((p) => matchesPolicy(p.props, f)).sort((a, b) => a.props.id.localeCompare(b.props.id));
    return { items: matches.slice(0, f.limit), nextCursor: matches.length > f.limit ? matches[f.limit - 1]?.props.id : undefined };
  }
  async forParty(tx: Transaction, id: string) {
    return (await this.all(tx)).filter((p) => p.props.proposerPartyId === id);
  }
  async dueBetween(tx: Transaction, _from: string, _to: string, scope: RecordScope) {
    return (await this.all(tx)).filter((p) => inScope({ ownerMemberId: p.props.servicingMemberId, orgUnitId: p.props.orgUnitId }, scope));
  }
  async renewalsBetween(tx: Transaction, from: string, to: string) {
    return (await this.all(tx)).filter(
      (p) => p.props.line !== 'LIFE' && !!p.props.renewalDate && p.props.renewalDate >= from && p.props.renewalDate <= to,
    );
  }
  async recordPayment(
    tx: Transaction,
    input: {
      policyId: string;
      installmentDue: string;
      paidOn: string;
      id: string;
    },
  ) {
    const key = `${input.policyId}:${input.installmentDue}`;
    if (this.payments.of(tx).has(key)) return false;
    this.payments.of(tx).add(key);
    return true;
  }
  async paymentRecorded(tx: Transaction, policyId: string, installmentDue: string) {
    return this.payments.of(tx).has(`${policyId}:${installmentDue}`);
  }
}
export class InMemoryImportBatchRepository implements ImportBatchRepository {
  private readonly rows = new TenantBuckets<Map<string, ImportBatchProps>>(() => new Map());
  async get(tx: Transaction, id: string) {
    const p = this.rows.of(tx).get(id);
    return p ? ImportBatch.restore(p) : undefined;
  }
  async save(tx: Transaction, batch: ImportBatch) {
    for (const p of this.rows.of(tx).values())
      if (p.id !== batch.props.id && p.fileChecksum === batch.props.fileChecksum)
        throw new ConflictError('import_checksum_taken', 'Import already exists');
    save(this.rows.of(tx), batch.props);
    batch.markSaved();
  }
  async findByChecksum(tx: Transaction, checksum: string) {
    const p = [...this.rows.of(tx).values()].find((r) => r.fileChecksum === checksum);
    return p ? ImportBatch.restore(p) : undefined;
  }
}
export class InMemoryServicingRepository implements ServicingRepository {
  private readonly rows = new TenantBuckets<Map<string, ServicingRequestProps>>(() => new Map());
  async get(tx: Transaction, id: string) {
    const p = this.rows.of(tx).get(id);
    return p ? ServicingRequest.restore(structuredClone(p)) : undefined;
  }
  async save(tx: Transaction, request: ServicingRequest) {
    save(this.rows.of(tx), request.props);
    request.markSaved();
  }
  async all(tx: Transaction) {
    return [...this.rows.of(tx).values()].map((p) => ServicingRequest.restore(structuredClone(p)));
  }
  async forPolicy(tx: Transaction, id: string) {
    return (await this.all(tx)).filter((p) => p.props.heldPolicyId === id);
  }
  async openFollowUpsBefore(tx: Transaction, date: string) {
    return (await this.all(tx)).filter(
      (p) => !['RESOLVED', 'REJECTED'].includes(p.props.status) && !!p.props.followUpOn && p.props.followUpOn <= date,
    );
  }
}
export class InMemoryAlertLedger implements AlertLedger {
  private readonly keys = new TenantBuckets<Set<string>>(() => new Set());
  async emittedKeys(tx: Transaction, keys: string[]) {
    return new Set(keys.filter((k) => this.keys.of(tx).has(k)));
  }
  async record(tx: Transaction, keys: string[]) {
    for (const key of keys) this.keys.of(tx).add(key);
  }
}
