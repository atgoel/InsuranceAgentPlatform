import { useT } from '../../lib/i18n';
import type { ImportBatch, ImportResult, ImportRow } from './api';
import { ImportReview } from './ImportReview';

const FORMATS = ['CSV_TEMPLATE', 'LIC_PORTAL', 'GENERIC_PORTAL', 'OFFICE_SALES_REGISTER'];
const FILTERS = ['all', 'problems', 'duplicates'];

export function ImportUploadStep({
  format,
  asOf,
  file,
  busy,
  csvError,
  onFormat,
  onAsOf,
  onFile,
  onSubmit,
}: {
  format: string;
  asOf: string;
  file: File | undefined;
  busy: boolean;
  csvError: boolean;
  onFormat(value: string): void;
  onAsOf(value: string): void;
  onFile(value: File | undefined): void;
  onSubmit(): void;
}) {
  const { t } = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label>
        {t('book.format')}
        <select value={format} onChange={(e) => onFormat(e.target.value)}>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {t(`book.enum.${f}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('book.as_of')}
        <input required type="date" value={asOf} onChange={(e) => onAsOf(e.target.value)} />
      </label>
      <label>
        {t('book.csv_file')}
        <input required type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {csvError && <p role="alert">{t('book.invalid_csv')}</p>}
      <button disabled={busy || !file}>{t('book.upload')}</button>
    </form>
  );
}

export function ImportReviewStep({
  batch,
  rows,
  allRows,
  filter,
  busy,
  onRefresh,
  onFilter,
  onDecision,
  onReferrer,
  onCommit,
}: {
  batch: ImportBatch;
  rows: ImportRow[];
  allRows: ImportRow[];
  filter: string;
  busy: boolean;
  onRefresh(): void;
  onFilter(value: string): void;
  onDecision(rowNo: number, decision: string): void;
  onReferrer(rowNo: number, link: { memberId?: string; partyId?: string }): void;
  onCommit(): void;
}) {
  const { t } = useT();
  return (
    <section>
      <h2>{t('book.review')}</h2>
      <button disabled={busy} onClick={onRefresh}>
        {t('book.refresh_progress')}
      </button>
      <p>
        {t('book.summary', {
          total: batch.summary.total,
          problems: batch.summary.problems,
          duplicates: batch.summary.duplicates,
          updates: batch.summary.updates,
        })}
      </p>
      <p>
        {t('book.as_of')} {batch.asOf}
      </p>
      {batch.state === 'COMMITTED' ? (
        <>
          <p>{t('book.already_committed')}</p>
          <p>{t('book.rerun')}</p>
        </>
      ) : (
        <>
          <label>
            {t('book.review_filter')}
            <select value={filter} onChange={(e) => onFilter(e.target.value)}>
              {FILTERS.map((f) => (
                <option key={f} value={f}>
                  {t(`book.filter.${f}`)}
                </option>
              ))}
            </select>
          </label>
          <ImportReview
            rows={rows}
            asOf={batch.asOf}
            busy={busy}
            onDecision={onDecision}
            onReferrer={onReferrer}
          />
          <button
            disabled={busy || allRows.some((r) => !r.decision || (r.decision !== 'SKIP' && r.problems.length > 0))}
            onClick={onCommit}
          >
            {t('book.commit')}
          </button>
        </>
      )}
    </section>
  );
}

export function ImportResultStep({ result, onAnother }: { result: ImportResult; onAnother(): void }) {
  const { t } = useT();
  return (
    <section>
      <h2>{t('book.result')}</h2>
      <dl>
        {(['imported', 'updated', 'skipped'] as const).map((k) => (
          <div key={k}>
            <dt>{t(`book.${k}`)}</dt>
            <dd>{result[k]}</dd>
          </div>
        ))}
        <div>
          <dt>{t('book.parties_created')}</dt>
          <dd>{result.parties.created}</dd>
        </div>
        <div>
          <dt>{t('book.parties_linked')}</dt>
          <dd>{result.parties.linked}</dd>
        </div>
      </dl>
      <p>{t('book.rerun')}</p>
      <button onClick={onAnother}>{t('book.import_another')}</button>
    </section>
  );
}
