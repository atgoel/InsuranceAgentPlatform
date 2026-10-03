import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { CustomFieldEnumOption } from '../api';

export interface EnumOptionsEditorProps {
  options: CustomFieldEnumOption[];
  onChange(options: CustomFieldEnumOption[]): void;
  /** Values already stored cannot be edited or removed; only relabelled. */
  lockedCount?: number;
}

/** Rows of value / English label / Hindi label for an enum field. */
export function EnumOptionsEditor({ options, onChange, lockedCount = 0 }: EnumOptionsEditorProps) {
  const { t } = useT();
  const update = (index: number, next: CustomFieldEnumOption) => onChange(options.map((o, i) => (i === index ? next : o)));
  return (
    <fieldset className="cf-options">
      <legend>{t('tenancy.cf.options')}</legend>
      {options.map((option, index) => (
        <div className="cf-option-row" key={index}>
          <label>
            <span>{t('tenancy.cf.option_value', { n: index + 1 })}</span>
            <input
              type="text"
              value={option.value}
              disabled={index < lockedCount}
              onChange={(e) => update(index, { ...option, value: e.target.value.toUpperCase() })}
            />
          </label>
          <label>
            <span>{t('tenancy.cf.option_label_en', { n: index + 1 })}</span>
            <input type="text" value={option.label.en} onChange={(e) => update(index, { ...option, label: { ...option.label, en: e.target.value } })} />
          </label>
          <label>
            <span>{t('tenancy.cf.option_label_hi', { n: index + 1 })}</span>
            <input type="text" value={option.label.hi ?? ''} onChange={(e) => update(index, { ...option, label: { ...option.label, hi: e.target.value } })} />
          </label>
        </div>
      ))}
      <Button type="button" variant="secondary" onClick={() => onChange([...options, { value: '', label: { en: '' } }])}>
        {t('tenancy.cf.add_option')}
      </Button>
    </fieldset>
  );
}

/** Drops blank Hindi labels so the request carries only what was entered. */
export function cleanOptions(options: CustomFieldEnumOption[]): CustomFieldEnumOption[] {
  return options.map((o) => ({ value: o.value, label: o.label.hi ? { en: o.label.en, hi: o.label.hi } : { en: o.label.en } }));
}
