import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { ServicingRequest, ServicingRequestProps } from '../domain/servicing';
import { ServicingRepository } from '../application/ports';
import { bookPg } from './pg-held-policy.repository';

interface ServiceRow {
  id: string;
  held_policy_id: string;
  kind: ServicingRequestProps['kind'];
  status: ServicingRequestProps['status'];
  insurer_ref: string | null;
  follow_up_on: string | Date | null;
  portal_url: string | null;
  version: number;
}
interface NoteRow {
  request_id: string;
  at: string | Date;
  by_member: string;
  text: string;
}
export class PgServicingRepository implements ServicingRepository {
  private async read(tx: Transaction, where = '', args: unknown[] = []): Promise<ServicingRequest[]> {
    const result = await bookPg(tx).query<ServiceRow>(`select *,follow_up_on::text as follow_up_on from servicing_request ${where}`, args);
    const notes = await bookPg(tx).query<NoteRow>(
      'select * from servicing_note where request_id=any($1::text[]) order by request_id,position',
      [result.rows.map((row) => row.id)],
    );
    return result.rows.map((row) =>
      ServicingRequest.restore({
        id: row.id,
        heldPolicyId: row.held_policy_id,
        kind: row.kind,
        status: row.status,
        insurerRef: row.insurer_ref ?? undefined,
        portalUrl: row.portal_url ?? undefined,
        followUpOn: row.follow_up_on === null ? undefined : new Date(row.follow_up_on).toISOString().slice(0, 10),
        version: row.version,
        notes: notes.rows
          .filter((note) => note.request_id === row.id)
          .map((note) => ({ at: new Date(note.at).toISOString(), by: note.by_member, text: note.text })),
      }),
    );
  }
  async get(tx: Transaction, id: string) {
    return (await this.read(tx, 'where id=$1', [id]))[0];
  }
  async all(tx: Transaction) {
    return this.read(tx);
  }
  async save(tx: Transaction, request: ServicingRequest): Promise<void> {
    const p = request.props;
    const result = await bookPg(tx).query(
      `insert into servicing_request(id,tenant_id,held_policy_id,kind,status,insurer_ref,follow_up_on,portal_url,version)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(id) do update set status=excluded.status,insurer_ref=excluded.insurer_ref,
      follow_up_on=excluded.follow_up_on,portal_url=excluded.portal_url,version=excluded.version,updated_at=now()
      where servicing_request.tenant_id=excluded.tenant_id and servicing_request.version=excluded.version-1`,
      [p.id, tx.tenantId, p.heldPolicyId, p.kind, p.status, p.insurerRef ?? null, p.followUpOn ?? null, p.portalUrl ?? null, p.version + 1],
    );
    if (!result.rowCount) throw new PreconditionFailedError();
    for (const [position, note] of p.notes.entries()) {
      await bookPg(tx).query(
        'insert into servicing_note(tenant_id,request_id,position,at,by_member,text) values($1,$2,$3,$4,$5,$6) on conflict(tenant_id,request_id,position) do nothing',
        [tx.tenantId, p.id, position, note.at, note.by, note.text],
      );
    }
    request.markSaved();
  }
  async forPolicy(tx: Transaction, id: string) {
    return this.read(tx, 'where held_policy_id=$1', [id]);
  }
  async openFollowUpsBefore(tx: Transaction, date: string, memberId?: string) {
    const owner = memberId ? ' and held_policy_id in (select id from held_policy where servicing_member_id=$2)' : '';
    return this.read(
      tx,
      `where status not in ('RESOLVED','REJECTED') and follow_up_on <= $1::date${owner}`,
      memberId ? [date, memberId] : [date],
    );
  }
}
