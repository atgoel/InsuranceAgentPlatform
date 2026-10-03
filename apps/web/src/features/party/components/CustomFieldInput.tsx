import { useT } from '../../../lib/i18n';
import type { CustomFieldDefinition } from '../../tenancy/api';

export function fieldLabel(def: CustomFieldDefinition, lang: 'en' | 'hi'): string {
  return def.label[lang] || def.label.en;
}

export interface CustomFieldInputProps {
  definition: CustomFieldDefinition;
  /** Text form of the draft value ('true' / 'false' for booleans). */
  value: string;
  error?: string;
  onChange(value: string): void;
}

/** One labelled control for a custom field, chosen by its type. */
export function CustomFieldInput({ definition, value, error, onChange }: CustomFieldInputProps) {
  const { t, lang } = useT();
  const name = fieldLabel(definition, lang);
  const errorId = `cf-err-${definition.key}`;
  const common = { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? errorId : undefined } as const;
  const labelText = definition.required ? `${name} *` : name;

  let control;
  if (definition.type === 'boolean') {
    control = <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(e.target.checked ? 'true' : 'false')} {...common} />;
  } else if (definition.type === 'enum') {
    control = (
      <select value={value} onChange={(e) => onChange(e.target.value)} {...common}>
        <option value="">{t('party.cf.choose')}</option>
        {(definition.enumOptions ?? []).map((o) => <option key={o.value} value={o.value}>{o.label[lang] || o.label.en}</option>)}
      </select>
    );
  } else if (definition.type === 'date') {
    control = <input type="date" value={value} onChange={(e) => onChange(e.target.value)} {...common} />;
  } else {
    const inputMode = definition.type === 'text' ? undefined : 'decimal';
    control = <input type="text" inputMode={inputMode} value={value} onChange={(e) => onChange(e.target.value)} {...common} />;
  }

  return (
    <label className={definition.type === 'boolean' ? 'cf-field cf-field-check' : 'cf-field'}>
      <span>{labelText}{definition.type === 'money' ? ` (${t('party.cf.rupees')})` : ''}</span>
      {control}
      {error && <span id={errorId} role="alert" className="cf-field-error">{error}</span>}
    </label>
  );
}
