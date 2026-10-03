import { Button } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import { rowsToCSVBlob } from '../../import/csv';

export interface ImportPreview { valid: number; duplicates: number; rejected: Array<{ row: number; reasons: string[] }> }

interface ValidateStepProps {
  preview: ImportPreview;
  headers: string[];
  rows: string[][];
  onNext(): void;
  onBack(): void;
  /** Injected in tests; saves a Blob as a file in the browser. */
  save?: (blob: Blob, name: string) => void;
}

function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Server-side preview counts and reasons; rejected rows (original cells + reasons) can be downloaded and fixed. */
export function ValidateStep({ preview, headers, rows, onNext, onBack, save = saveBlob }: ValidateStepProps) {
  const { t } = useT();
  const download = () => {
    const rejected = preview.rejected.map((r) => [...(rows[r.row - 1] ?? []), r.reasons.join('; ')]); // server rows are 1-based
    save(rowsToCSVBlob([...headers, t('crm.import.reasons')], rejected), 'rejected-rows.csv');
  };
  return (
    <section className="import-step" aria-label={t('crm.import.step_validate')}>
      <dl className="validation-summary">
        <dt>{t('crm.import.valid_count')}</dt><dd>{preview.valid}</dd>
        <dt>{t('crm.import.duplicate_count')}</dt><dd>{preview.duplicates}</dd>
        <dt>{t('crm.import.rejected_count')}</dt><dd>{preview.rejected.length}</dd>
      </dl>
      {preview.rejected.length > 0 && (
        <>
          <table className="rejected-table" aria-label={t('crm.import.rejected_rows')}>
            <thead><tr><th>{t('crm.import.row_number')}</th><th>{t('crm.import.reasons')}</th></tr></thead>
            <tbody>
              {preview.rejected.slice(0, 10).map((r) => <tr key={r.row}><td>{r.row}</td><td>{r.reasons.join(', ')}</td></tr>)}
            </tbody>
          </table>
          {preview.rejected.length > 10 && <p>{t('crm.import.showing_first_10', { total: preview.rejected.length })}</p>}
          <Button variant="secondary" onClick={download}>{t('crm.import.download_rejected')}</Button>
        </>
      )}
      <div className="form-actions">
        <Button onClick={onNext} disabled={preview.valid === 0}>{t('crm.import.next')}</Button>
        <Button variant="secondary" onClick={onBack}>{t('common.back')}</Button>
      </div>
    </section>
  );
}
