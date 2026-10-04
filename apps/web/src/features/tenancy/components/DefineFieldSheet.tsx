import { useState } from 'react';
import { BottomSheet, Button } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import type { CustomFieldEntity, CustomFieldEnumOption, CustomFieldType, DefineCustomFieldInput, PiiClass } from '../api';
import { EnumOptionsEditor, cleanOptions } from './EnumOptionsEditor';

export const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'money', 'date', 'enum', 'boolean'];
/** P3 (highly sensitive) is deliberately not offered. */
export const PII_CLASSES: PiiClass[] = ['P0', 'P1', 'P2'];

export interface ServerProblem {
  keyError?: string;
  banner?: string;
  general?: string;
}

/** Maps a failed define/revise call to where it is shown. */
export function describeProblem(err: unknown, t: (k: string, p?: Record<string, string | number>) => string): ServerProblem {
  if (!(err instanceof ApiError)) return { general: t('tenancy.cf.save_failed') };
  if (err.code === 'custom_field_exists') return { keyError: err.title };
  if (err.code === 'custom_field_limit_reached') {
    const limit = typeof err.details?.limit === 'number' ? err.details.limit : undefined;
    return { banner: limit === undefined ? err.title : t('tenancy.cf.limit_reached', { limit }) };
  }
  return { general: err.title };
}

export function ProblemBanner({ problem }: { problem: ServerProblem }) {
  return (
    <>
      {problem.banner && (
        <p role="alert" className="cf-banner">
          {problem.banner}
        </p>
      )}
      {problem.general && (
        <p role="alert" className="cf-error">
          {problem.general}
        </p>
      )}
    </>
  );
}

export interface DefineFieldSheetProps {
  open: boolean;
  entity: CustomFieldEntity;
  onClose(): void;
  onCreate(input: DefineCustomFieldInput): Promise<void>;
}

export function DefineFieldSheet({ open, entity, onClose, onCreate }: DefineFieldSheetProps) {
  const { t } = useT();
  return (
    <BottomSheet open={open} title={t('tenancy.cf.add_title')} onClose={onClose}>
      <DefineForm entity={entity} onClose={onClose} onCreate={onCreate} />
    </BottomSheet>
  );
}

function DefineForm({ entity, onClose, onCreate }: Omit<DefineFieldSheetProps, 'open'>) {
  const { t } = useT();
  const [key, setKey] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [labelHi, setLabelHi] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [options, setOptions] = useState<CustomFieldEnumOption[]>([{ value: '', label: { en: '' } }]);
  const [piiClass, setPiiClass] = useState<PiiClass>('P0');
  const [required, setRequired] = useState(false);
  const [reportable, setReportable] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<ServerProblem>({});

  const submit = async () => {
    setSaving(true);
    setProblem({});
    try {
      await onCreate({
        entity,
        key,
        label: labelHi ? { en: labelEn, hi: labelHi } : { en: labelEn },
        type,
        ...(type === 'enum' ? { enumOptions: cleanOptions(options) } : {}),
        required,
        piiClass,
        reportable: piiClass === 'P2' ? false : reportable,
      });
      onClose();
    } catch (err) {
      setProblem(describeProblem(err, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="cf-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <ProblemBanner problem={problem} />
      <label>
        <span>{t('tenancy.cf.key')}</span>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-invalid={problem.keyError ? true : undefined}
          aria-describedby={problem.keyError ? 'cf-key-error' : undefined}
        />
        {problem.keyError && (
          <span id="cf-key-error" role="alert" className="cf-error">
            {problem.keyError}
          </span>
        )}
      </label>
      <label>
        <span>{t('tenancy.cf.label_en')}</span>
        <input type="text" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
      </label>
      <label>
        <span>{t('tenancy.cf.label_hi')}</span>
        <input type="text" value={labelHi} onChange={(e) => setLabelHi(e.target.value)} />
      </label>
      <label>
        <span>{t('tenancy.cf.type')}</span>
        <select value={type} onChange={(e) => setType(e.target.value as CustomFieldType)}>
          {FIELD_TYPES.map((v) => (
            <option key={v} value={v}>
              {t(`tenancy.cf.type.${v}`)}
            </option>
          ))}
        </select>
      </label>
      {type === 'enum' && <EnumOptionsEditor options={options} onChange={setOptions} />}
      <label>
        <span>{t('tenancy.cf.pii')}</span>
        <select value={piiClass} onChange={(e) => setPiiClass(e.target.value as PiiClass)}>
          {PII_CLASSES.map((v) => (
            <option key={v} value={v}>
              {t(`tenancy.cf.pii.${v}`)}
            </option>
          ))}
        </select>
      </label>
      <p className="cf-note">{t('tenancy.cf.p3_note')}</p>
      <label className="cf-check">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        <span>{t('tenancy.cf.required')}</span>
      </label>
      <label className="cf-check">
        <input
          type="checkbox"
          checked={piiClass === 'P2' ? false : reportable}
          disabled={piiClass === 'P2'}
          onChange={(e) => setReportable(e.target.checked)}
        />
        <span>{t('tenancy.cf.reportable')}</span>
      </label>
      <Button type="submit" loading={saving}>
        {t('tenancy.cf.add_submit')}
      </Button>
    </form>
  );
}
