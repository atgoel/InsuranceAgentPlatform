import { useState } from 'react';
import { BottomSheet, Button } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { formatMoney } from '../../../lib/format';
import { useT } from '../../../lib/i18n';
import type { CustomFieldDefinition, CustomFieldValue, CustomFieldValues } from '../../tenancy/api';
import { paiseToRupeesText, rupeesToPaiseExact } from '../customFieldMoney';
import { CustomFieldInput, fieldLabel } from './CustomFieldInput';
import '../styles/CustomFieldsSection.css';

export interface CustomFieldsSectionProps {
  entity: 'party' | 'lead';
  definitions: CustomFieldDefinition[];
  values: CustomFieldValues;
  version: number;
  /** Whether the user may edit (party.write / crm.lead.write); the Edit action is hidden otherwise. */
  canEdit: boolean;
  /** Saves the full value set with the record version (sent as If-Match); rejects with ApiError on failure. */
  onSave(values: CustomFieldValues, version: number): Promise<void>;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function displayValue(def: CustomFieldDefinition, value: CustomFieldValue | undefined, t: Translate, lang: 'en' | 'hi'): string {
  if (value === undefined) return '—';
  if (def.type === 'money' && typeof value === 'number') return formatMoney(value);
  if (def.type === 'boolean') return value === true ? t('party.cf.yes') : t('party.cf.no');
  if (def.type === 'enum') {
    const option = def.enumOptions?.find((o) => o.value === value);
    return option ? option.label[lang] || option.label.en : String(value);
  }
  return String(value);
}

function toDraft(defs: CustomFieldDefinition[], values: CustomFieldValues): Record<string, string> {
  const draft: Record<string, string> = {};
  for (const def of defs) {
    const v = values[def.key];
    if (v === undefined) draft[def.key] = def.type === 'boolean' ? 'false' : '';
    else draft[def.key] = def.type === 'money' && typeof v === 'number' ? paiseToRupeesText(v) : String(v);
  }
  return draft;
}

/** Converts the text draft to typed values; money becomes integer paise. Empty entries are omitted. */
function fromDraft(defs: CustomFieldDefinition[], draft: Record<string, string>, t: Translate): { values: CustomFieldValues; errors: Record<string, string> } {
  const values: CustomFieldValues = {};
  const errors: Record<string, string> = {};
  for (const def of defs) {
    const text = (draft[def.key] ?? '').trim();
    if (def.type === 'boolean') values[def.key] = text === 'true';
    else if (text === '') continue;
    else if (def.type === 'money') {
      const paise = rupeesToPaiseExact(text);
      if (paise === undefined) errors[def.key] = t('party.cf.error.invalid_money');
      else values[def.key] = paise;
    } else if (def.type === 'number') {
      const n = Number(text);
      if (Number.isFinite(n)) values[def.key] = n;
      else errors[def.key] = t('party.cf.error.invalid_type');
    } else values[def.key] = text;
  }
  return { values, errors };
}

/** Field errors from a 400 invalid_custom_fields problem, keyed by field key. */
function serverFieldErrors(err: ApiError, t: Translate): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of err.errors ?? []) {
    const key = e.path.replace(/^customFields\./, '');
    const known = `party.cf.error.${e.code}`;
    const text = t(known);
    out[key] = text === known ? e.message || t('party.cf.error.generic') : text;
  }
  return out;
}

export function CustomFieldsSection({ entity, definitions, values, version, canEdit, onSave }: CustomFieldsSectionProps) {
  const { t, lang } = useT();
  const [editing, setEditing] = useState(false);
  const active = definitions.filter((d) => d.active && d.entity === entity);
  if (active.length === 0) return null;
  return (
    <section className="custom-fields-section" aria-labelledby="cf-section-title">
      <div className="cf-section-head">
        <h2 id="cf-section-title">{t('party.cf.title')}</h2>
        {canEdit && <Button variant="secondary" onClick={() => setEditing(true)}>{t('party.cf.edit')}</Button>}
      </div>
      <dl className="cf-values">
        {active.map((d) => (
          <div key={d.key} className="cf-value-row">
            <dt>{fieldLabel(d, lang)}</dt>
            <dd>{displayValue(d, values[d.key], t, lang)}</dd>
          </div>
        ))}
      </dl>
      <BottomSheet open={editing} title={t('party.cf.edit_title')} onClose={() => setEditing(false)}>
        <EditForm definitions={active} values={values} version={version} onSave={onSave} onClose={() => setEditing(false)} />
      </BottomSheet>
    </section>
  );
}

interface EditFormProps {
  definitions: CustomFieldDefinition[];
  values: CustomFieldValues;
  version: number;
  onSave(values: CustomFieldValues, version: number): Promise<void>;
  onClose(): void;
}

function EditForm({ definitions, values, version, onSave, onClose }: EditFormProps) {
  const { t } = useT();
  const [draft, setDraft] = useState(() => toDraft(definitions, values));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const parsed = fromDraft(definitions, draft, t);
    setErrors(parsed.errors);
    setGeneral(undefined);
    if (Object.keys(parsed.errors).length > 0) return;
    setSaving(true);
    try {
      await onSave(parsed.values, version);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'invalid_custom_fields') {
        setErrors(serverFieldErrors(err, t));
      } else setGeneral(err instanceof ApiError ? err.title : t('party.cf.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="cf-edit-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {general && <p role="alert" className="cf-field-error">{general}</p>}
      {definitions.map((d) => (
        <CustomFieldInput key={d.key} definition={d} value={draft[d.key] ?? ''} error={errors[d.key]} onChange={(v) => setDraft((prev) => ({ ...prev, [d.key]: v }))} />
      ))}
      <Button type="submit" loading={saving}>{t('common.save')}</Button>
    </form>
  );
}
