import { useT } from '../../../lib/i18n';
import { BookError } from '../shared';
import { ImportMapping } from '../ImportMapping';
import { ImportResultStep, ImportReviewStep, ImportUploadStep } from '../ImportSteps';
import { useBookImport } from '../useBookImport';
import '../book.css';

export function BookImportScreen() {
  const { t } = useT();
  const s = useBookImport();
  const { batch, result } = s;
  return (
    <main className="book-screen">
      <h1>{t('book.import_title')}</h1>
      <ol>
        <li>{t('book.upload')}</li>
        <li>{t('book.mapping')}</li>
        <li>{t('book.review')}</li>
        <li>{t('book.result')}</li>
      </ol>
      <BookError error={s.error} />
      {!batch && (
        <ImportUploadStep
          format={s.format}
          asOf={s.asOf}
          file={s.file}
          busy={s.busy}
          csvError={s.csvError}
          onFormat={s.setFormat}
          onAsOf={s.setAsOf}
          onFile={s.setFile}
          onSubmit={() => void s.upload()}
        />
      )}
      {batch && !s.mapped && (
        <ImportMapping
          headers={s.headers}
          rows={s.raw}
          initial={batch.suggestedMapping}
          busy={s.busy}
          onConfirm={s.confirmMapping}
        />
      )}
      {batch && s.mapped && !result && (
        <ImportReviewStep
          batch={batch}
          rows={s.rows}
          allRows={s.allRows}
          filter={s.filter}
          busy={s.busy}
          onRefresh={s.refresh}
          onFilter={s.changeFilter}
          onDecision={s.decide}
          onReferrer={s.referrer}
          onCommit={s.commit}
        />
      )}
      {result && <ImportResultStep result={result} onAnother={s.reset} />}
    </main>
  );
}
