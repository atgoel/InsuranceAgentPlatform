import { isPgTransaction, PgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { ConflictError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { inScope } from '../../crm/application/crm-scope';
import { HeldPolicy } from '../domain/held-policy';
import { HeldPolicyFilter, HeldPolicyRepository, RecordScope } from '../application/ports';
import { matchesPolicy } from './in-memory-book.repositories';
import { PolicyRow, policyColumns, restorePolicy } from './pg-held-policy.mapper';

export function bookPg(tx: Transaction): PgTransaction {
  if (!isPgTransaction(tx)) throw new Error('Book repository requires a Postgres transaction');
  return tx;
}
export class PgHeldPolicyRepository implements HeldPolicyRepository {
  private async read(tx: Transaction, where: string, args: unknown[]): Promise<HeldPolicy[]> {
    const dates = [
      'booked_on',
      'as_of',
      'status_as_of',
      'commencement_date',
      'next_due_date',
      'renewal_date',
      'maturity_date',
      'expiry_date',
    ];
    const result = await bookPg(tx).query<PolicyRow>(
      `select *, ${dates.map((column) => `${column}::text as ${column}`).join(',')} from held_policy ${where}`,
      args,
    );
    return result.rows.map(restorePolicy);
  }
  async get(tx: Transaction, id: string) {
    return (await this.read(tx, 'where id=$1', [id]))[0];
  }
  async all(tx: Transaction) {
    return this.read(tx, '', []);
  }
  async findByNumberHash(tx: Transaction, hash: string) {
    return (await this.read(tx, 'where policy_number_hash=$1', [hash]))[0];
  }
  async findBySaleRef(tx: Transaction, id: string) {
    return (await this.read(tx, 'where sale_id=$1', [id]))[0];
  }
  async save(tx: Transaction, policy: HeldPolicy): Promise<void> {
    const record = policyColumns(policy.props, tx.tenantId);
    const columns = Object.keys(record);
    const values = Object.values(record).map((value) => value ?? null);
    const updated = columns.filter((column) => !['id', 'tenant_id', 'created_at'].includes(column));
    const sql = `insert into held_policy (${columns.join(',')}) values (${values.map((_, i) => `$${i + 1}`).join(',')})
      on conflict(id) do update set ${updated.map((column) => `${column}=excluded.${column}`).join(',')}
      where held_policy.tenant_id=excluded.tenant_id and held_policy.version=excluded.version-1`;
    try {
      const result = await bookPg(tx).query(sql, values);
      if (!result.rowCount) throw new PreconditionFailedError();
      policy.markSaved();
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505')
        throw new ConflictError('policy_number_taken', 'Policy already exists');
      throw error;
    }
  }
  async list(tx: Transaction, filter: HeldPolicyFilter) {
    const rows = (await this.all(tx)).filter((p) => matchesPolicy(p.props, filter)).sort((a, b) => a.props.id.localeCompare(b.props.id));
    return { items: rows.slice(0, filter.limit), nextCursor: rows.length > filter.limit ? rows[filter.limit - 1]?.props.id : undefined };
  }
  async forParty(tx: Transaction, partyId: string) {
    return this.read(tx, 'where proposer_party_id=$1', [partyId]);
  }
  async dueBetween(tx: Transaction, _from: string, _to: string, scope: RecordScope) {
    return (await this.all(tx)).filter((p) => inScope({ ownerMemberId: p.props.servicingMemberId, orgUnitId: p.props.orgUnitId }, scope));
  }
  async renewalsBetween(tx: Transaction, from: string, to: string) {
    return this.read(tx, "where line<>'LIFE' and renewal_date between $1::date and $2::date", [from, to]);
  }
  async paymentRecorded(tx: Transaction, policyId: string, installmentDue: string): Promise<boolean> {
    const result = await bookPg(tx).query('select 1 from premium_payment where held_policy_id=$1 and installment_due=$2::date', [
      policyId,
      installmentDue,
    ]);
    return result.rowCount === 1;
  }
  async recordPayment(tx: Transaction, input: { policyId: string; installmentDue: string; paidOn: string; id: string }) {
    const result = await bookPg(tx).query(
      'insert into premium_payment (id,tenant_id,held_policy_id,installment_due,paid_on) values ($1,$2,$3,$4,$5) on conflict(tenant_id,held_policy_id,installment_due) do nothing',
      [input.id, tx.tenantId, input.policyId, input.installmentDue, input.paidOn],
    );
    return result.rowCount === 1;
  }
}
