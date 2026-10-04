import { PageContainer, PageHeader, Stepper, type StepDef } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { BookError } from '../shared';
import { ImportMapping } from '../ImportMapping';
import { ImportResultStep, ImportReviewStep, ImportUploadStep } from '../ImportSteps';
import { useBookImport } from '../useBookImport';
import '../book.css';

const STEP_KEYS = ['book.upload', 'book.mapping', 'book.review', 'book.result'];

function importSteps(t: (key: string) => string, current: number): StepDef[] {
  return STEP_KEYS.map((key, index) => ({
    id: key,
    label: t(key),
    state: index < current ? 'done' : index === current ? 'current' : 'todo',
  }));
}

export function BookImportScreen() {
  const { t } = useT();
  const s = useBookImport();
  const { batch, result } = s;
  const step = !batch ? 0 : !s.mapped ? 1 : !result ? 2 : 3;
  return (
    <PageContainer>
      <div className="book-screen">
        <PageHeader title={t('book.import_title')} back={{ to: '/m/dues', label: t('book.back_to_dues') }} />
        <Stepper steps={importSteps(t, step)} />
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
      </div>
    </PageContainer>
  );
}
