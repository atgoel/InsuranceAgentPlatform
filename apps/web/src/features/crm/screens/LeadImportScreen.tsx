import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageContainer, PageHeader, Stepper, type StepDef } from '../../../design-system';
import { useApi } from '../../../lib/api';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi } from '../api';
import { autoMap, ColumnMapping, toImportRows } from '../import/mapping';
import { UploadStep } from '../components/ImportSteps/UploadStep';
import { MapStep } from '../components/ImportSteps/MapStep';
import { ImportPreview, ValidateStep } from '../components/ImportSteps/ValidateStep';
import { CommitOptions, ImportStep } from '../components/ImportSteps/ImportStep';
import { ResultStep } from '../components/ImportSteps/ResultStep';
import '../styles/crm-frame.css';
import '../styles/LeadImportScreen.css';

type Step = 'upload' | 'map' | 'validate' | 'import' | 'result';
const STEPS: Step[] = ['upload', 'map', 'validate', 'import'];
interface ParsedFile { checksum: string; headers: string[]; rows: string[][] }
type ImportResult = Parameters<typeof ResultStep>[0]['result'];

/** The four steps of CRM08; the result screen belongs to the last one, so every step reads as done there. */
function stepState(index: number, at: number): StepDef['state'] {
  if (index < at) return 'done';
  return index === at ? 'current' : 'todo';
}

function stepStates(current: Step, label: (step: Step) => string): StepDef[] {
  const at = current === 'result' ? STEPS.length : STEPS.indexOf(current);
  return STEPS.map((id, index) => ({ id, label: label(id), state: stepState(index, at) }));
}

/** CRM08 lead import (AC-M04-30): upload → map → server preview → commit with source and consent basis → result. */
export function LeadImportScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const navigate = useNavigate();
  const { t } = useT();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<ParsedFile | undefined>();
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [preview, setPreview] = useState<ImportPreview | undefined>();
  const [result, setResult] = useState<ImportResult | undefined>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  /** API failures stay on the current step with the file and mapping intact. */
  const call = async <T,>(work: () => Promise<T>, then: (value: T) => void) => {
    setBusy(true);
    setFailure(undefined);
    try {
      then(await work());
    } catch (err) {
      setFailure(err instanceof ApiError && err.status === 403 ? t('error.forbidden') : err instanceof ApiError ? err.title : t('common.error'));
    } finally {
      setBusy(false);
    }
  };
  const rows = () => (file ? toImportRows(file.headers, file.rows, mapping) : []);

  return (
    <div className="crm-screen-frame">
      <PageContainer>
        <PageHeader title={t('crm.import.page_title')} subtitle={t('crm.import.subtitle')} />
        <nav className="import-tabs" aria-label={t('crm.import.tabs')}>
          <span aria-current="page">{t('crm.import.tab_import')}</span>
          <Link to="/crm/import/duplicates">{t('crm.import.duplicates_tab')}</Link>
        </nav>
        <Stepper steps={stepStates(step, (id) => t(`crm.import.step_${id}`))} />
        {failure && (
          <p role="alert" className="error-banner">
            {t('crm.import.request_failed', { reason: failure })}
          </p>
        )}
        <div className="import-content">{renderStep()}</div>
      </PageContainer>
    </div>
  );

  function renderStep() {
    return (
    <>
      {step === 'upload' && (
        <UploadStep onNext={(_text, checksum, headers, fileRows) => {
          setFile({ checksum, headers, rows: fileRows });
          setMapping(autoMap(headers));
          setStep('map');
        }} />
      )}
      {step === 'map' && file && (
        <MapStep headers={file.headers} mapping={mapping} onMapping={setMapping} busy={busy} onBack={() => setStep('upload')}
          onValidate={() => call(() => crmApi.previewLeadImport({ fileChecksum: file.checksum, sourceTag: 'preview', consentBasis: 'NONE', rows: rows() }), (p) => {
            setPreview(p);
            setStep('validate');
          })} />
      )}
      {step === 'validate' && file && preview && (
        <ValidateStep preview={preview} headers={file.headers} rows={file.rows} onNext={() => setStep('import')} onBack={() => setStep('map')} />
      )}
      {step === 'import' && file && preview && (
        <ImportStep valid={preview.valid} busy={busy} onBack={() => setStep('validate')}
          onCommit={(options: CommitOptions) => call(() => crmApi.commitLeadImport({ fileChecksum: file.checksum, ...options, rows: rows() }), (r) => {
            setResult(r);
            setStep('result');
          })} />
      )}
      {step === 'result' && result && (
        <ResultStep result={result} onViewDuplicates={() => navigate('/crm/import/duplicates')} onClose={() => navigate('/crm/leads')} />
      )}
    </>
    );
  }
}
