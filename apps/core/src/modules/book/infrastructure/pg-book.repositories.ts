import { isPgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { PreconditionFailedError } from '../../../kernel/errors/domain-errors';

import { ImportBatch, ImportBatchProps, ImportRow } from '../domain/book-import';

import { AlertLedger, ImportBatchRepository } from '../application/ports';
export { PgHeldPolicyRepository } from './pg-held-policy.repository';
export { PgServicingRepository } from './pg-servicing.repository';
function pg(tx: Transaction) {
  if (!isPgTransaction(tx)) throw new Error('Book repository requires a Postgres transaction');
  return tx;
}
const json = (v: unknown) => JSON.stringify(v);
interface Stored<P> {
  props: P;
  version: number;
}
export class PgImportBatchRepository implements ImportBatchRepository {
  private async restore(tx: Transaction, row: Stored<ImportBatchProps> | undefined) {
    if (!row) return undefined;
    const rows = await pg(tx).query<{ props: ImportRow; raw: Record<string, string> }>(
      'select props,raw from book_import_row where batch_id=$1 order by row_no',
      [row.props.id],
    );
    return ImportBatch.restore({ ...row.props, version: row.version, rows: rows.rows.map((r) => ({ ...r.props, raw: r.raw })) });
  }
  async get(tx: Transaction, id: string) {
    const result = await pg(tx).query<Stored<ImportBatchProps>>('select props,version from book_import_batch where id=$1', [id]);
    return this.restore(tx, result.rows[0]);
  }
  async findByChecksum(tx: Transaction, checksum: string) {
    const result = await pg(tx).query<Stored<ImportBatchProps>>('select props,version from book_import_batch where file_checksum=$1', [
      checksum,
    ]);
    return this.restore(tx, result.rows[0]);
  }
  async save(tx: Transaction, batch: ImportBatch) {
    const { rows, ...props } = batch.props;
    const result = await pg(tx).query(
      'insert into book_import_batch(id,tenant_id,file_checksum,state,props,version) values($1,$2,$3,$4,$5::jsonb,$6) on conflict(id) do update set state=excluded.state,props=excluded.props,version=excluded.version where book_import_batch.tenant_id=excluded.tenant_id and book_import_batch.version=excluded.version-1',
      [props.id, tx.tenantId, props.fileChecksum, props.state, json({ ...props, version: props.version + 1 }), props.version + 1],
    );
    if (!result.rowCount) throw new PreconditionFailedError();
    await pg(tx).query('delete from book_import_row where batch_id=$1', [props.id]);
    for (const row of rows) {
      const { raw, ...safe } = row;
      await pg(tx).query('insert into book_import_row(tenant_id,batch_id,row_no,raw,props) values($1,$2,$3,$4::jsonb,$5::jsonb)', [
        tx.tenantId,
        props.id,
        row.rowNo,
        json(raw),
        json(safe),
      ]);
    }
    batch.markSaved();
  }
}
export class PgAlertLedger implements AlertLedger {
  async emittedKeys(tx: Transaction, keys: string[]) {
    const result = await pg(tx).query<{ key: string }>('select key from lifecycle_alert_ledger where key=any($1::text[])', [keys]);
    return new Set(result.rows.map((r) => r.key));
  }
  async record(tx: Transaction, keys: string[]) {
    for (const key of keys)
      await pg(tx).query('insert into lifecycle_alert_ledger(tenant_id,key) values($1,$2) on conflict(tenant_id,key) do nothing', [
        tx.tenantId,
        key,
      ]);
  }
}
