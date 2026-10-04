import { useState } from 'react';
import { BottomSheet, Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { CustomFieldDefinition, CustomFieldEnumOption, ReviseCustomFieldInput } from '../api';
import { EnumOptionsEditor, cleanOptions } from './EnumOptionsEditor';
import { describeProblem, ProblemBanner, type ServerProblem } from './DefineFieldSheet';

export interface EditFieldSheetProps {
  definition: CustomFieldDefinition | undefined;
  onClose(): void;
  onRevise(definition: CustomFieldDefinition, patch: ReviseCustomFieldInput): Promise<void>;
}

export function EditFieldSheet({ definition, onClose, onRevise }: EditFieldSheetProps) {
  const { t } = useT();
  return (
    <BottomSheet open={definition !== undefined} title={t('tenancy.cf.edit_title')} onClose={onClose}>
      {definition && <EditForm definition={definition} onClose={onClose} onRevise={onRevise} />}
    </BottomSheet>
  );
}

function EditForm({ definition, onClose, onRevise }: { definition: CustomFieldDefinition } & Omit<EditFieldSheetProps, 'definition'>) {
  const { t } = useT();
  const [labelEn, setLabelEn] = useState(definition.label.en);
  const [labelHi, setLabelHi] = useState(definition.label.hi ?? '');
  const [options, setOptions] = useState<CustomFieldEnumOption[]>(definition.enumOptions ?? []);
  const [required, setRequired] = useState(definition.required);
  const [reportable, setReportable] = useState(definition.reportable);
  const [active, setActive] = useState(definition.active);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<ServerProblem>({});
  const p2 = definition.piiClass === 'P2';

  const submit = async () => {
    setSaving(true);
    setProblem({});
    try {
      await onRevise(definition, {
        label: labelHi ? { en: labelEn, hi: labelHi } : { en: labelEn },
        ...(definition.type === 'enum' ? { enumOptions: cleanOptions(options) } : {}),
        required,
        reportable: p2 ? false : reportable,
        active,
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
      <p className="cf-note">{definition.key}</p>
      <label>
        <span>{t('tenancy.cf.label_en')}</span>
        <input type="text" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
      </label>
      <label>
        <span>{t('tenancy.cf.label_hi')}</span>
        <input type="text" value={labelHi} onChange={(e) => setLabelHi(e.target.value)} />
      </label>
      {definition.type === 'enum' && (
        <EnumOptionsEditor options={options} onChange={setOptions} lockedCount={definition.enumOptions?.length ?? 0} />
      )}
      <label className="cf-check">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        <span>{t('tenancy.cf.required')}</span>
      </label>
      <label className="cf-check">
        <input type="checkbox" checked={p2 ? false : reportable} disabled={p2} onChange={(e) => setReportable(e.target.checked)} />
        <span>{t('tenancy.cf.reportable')}</span>
      </label>
      <label className="cf-check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>{t('tenancy.cf.active')}</span>
      </label>
      <Button type="submit" loading={saving}>
        {t('common.save')}
      </Button>
    </form>
  );
}
