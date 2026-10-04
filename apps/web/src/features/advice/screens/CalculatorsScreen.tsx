import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { PageContainer, PageHeader, Tabs } from '../../../design-system';
import { ApiError, type FieldError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createAdviceApi, type CalcOutput, type CalculatorId } from '../api';
import { CALCULATOR_IDS, buildInput, type FormValues } from '../calculators';
import { CalculatorForm } from '../components/CalculatorForm';
import { CalculatorResult } from '../components/CalculatorResult';
import { InlineError } from '../components/InlineError';
import '../styles/advice.css';

export function CalculatorsScreen() {
  const api = useApi();
  const adviceApi = useMemo(() => createAdviceApi(api), [api]);
  const { t } = useT();
  const [params] = useSearchParams();
  const partyId = params.get('partyId') ?? undefined;

  const [calculator, setCalculator] = useState<CalculatorId>(CALCULATOR_IDS[0]);
  const [values, setValues] = useState<Record<string, FormValues>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<CalcOutput | undefined>();
  const [lastInput, setLastInput] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const switchTab = useCallback((id: string) => {
    setCalculator(id as CalculatorId);
    setOutput(undefined);
    setFieldErrors([]);
    setError(undefined);
    setSaved(false);
  }, []);

  const run = async () => {
    const input = buildInput(calculator, values[calculator] ?? {});
    setRunning(true);
    setError(undefined);
    setFieldErrors([]);
    setSaved(false);
    try {
      setOutput(await adviceApi.runCalculator(calculator, input));
      setLastInput(input);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setFieldErrors(err.errors ?? []);
      setError(err.errors?.length ? undefined : err.title);
    } finally {
      setRunning(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await adviceApi.runCalculator(calculator, lastInput, partyId);
      setSaved(true);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setError(err.title);
    } finally {
      setSaving(false);
    }
  };

  const onChange = (name: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [calculator]: { ...prev[calculator], [name]: value } }));

  return (
    <PageContainer>
      <PageHeader title={t('advice.calc.title')} subtitle={t('advice.calc.subtitle')} />
      <Tabs tabs={CALCULATOR_IDS.map((id) => ({ id, label: t(`advice.calc.tab.${id}`) }))} value={calculator} onChange={switchTab} />
      <InlineError message={error} />
      <CalculatorForm
        calculator={calculator}
        values={values[calculator] ?? {}}
        fieldErrors={fieldErrors}
        running={running}
        onChange={onChange}
        onSubmit={run}
      />
      {output && <CalculatorResult calculator={calculator} output={output} canSave={Boolean(partyId)} saved={saved} saving={saving} onSave={save} />}
    </PageContainer>
  );
}
