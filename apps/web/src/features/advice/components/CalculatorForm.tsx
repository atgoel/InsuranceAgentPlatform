import { Button } from '../../../design-system';
import type { FieldError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { CALCULATORS, pathMatches, type FieldDef, type FormValues } from '../calculators';
import type { CalculatorId } from '../api';
import { FieldRow } from './FieldRow';

interface Props {
  calculator: CalculatorId;
  values: FormValues;
  fieldErrors: FieldError[];
  running: boolean;
  onChange(name: string, value: string | boolean): void;
  onSubmit(): void;
}

interface AriaProps {
  id: string;
  'aria-invalid': boolean;
  'aria-describedby'?: string;
}

interface ControlProps {
  field: FieldDef;
  value: string | boolean | undefined;
  aria: AriaProps;
  onChange(value: string | boolean): void;
}

function Control({ field, value, aria, onChange }: ControlProps) {
  const { t } = useT();
  if (field.kind === 'select') {
    return (
      <select {...aria} value={String(value ?? field.options?.[0] ?? '')} onChange={(e) => onChange(e.target.value)}>
        {field.options?.map((o) => (
          <option key={o} value={o}>
            {field.name === 'goal' ? t(`advice.calc.goal.${o}`) : t('advice.calc.tier', { tier: o })}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === 'bool') {
    return <input {...aria} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />;
  }
  return <input {...aria} type="text" inputMode="decimal" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
}

function hintFor(field: FieldDef, t: (key: string) => string): string | undefined {
  if (field.kind === 'ages' || field.kind === 'members') return t('advice.calc.ages_hint');
  if (field.kind === 'money') return t('advice.calc.rupees_hint');
  return undefined;
}

export function CalculatorForm({ calculator, values, fieldErrors, running, onChange, onSubmit }: Props) {
  const { t } = useT();
  return (
    <form
      className="advice-form advice-form-card"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {CALCULATORS[calculator].map((field) => {
        const error = fieldErrors.find((e) => pathMatches(e.path, field.name))?.message;
        return (
          <FieldRow key={`${calculator}-${field.name}`} id={`calc-${field.name}`} label={t(`advice.calc.field.${field.name}`)} error={error} hint={hintFor(field, t)}>
            {(aria) => <Control field={field} value={values[field.name]} aria={aria} onChange={(v) => onChange(field.name, v)} />}
          </FieldRow>
        );
      })}
      <Button type="submit" loading={running}>
        {t('advice.calc.run')}
      </Button>
    </form>
  );
}
