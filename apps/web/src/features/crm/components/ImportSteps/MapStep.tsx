import { Button } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import { ColumnMapping, IMPORT_FIELDS, ImportField, mappingProblems } from '../../import/mapping';

interface MapStepProps {
  headers: string[];
  mapping: ColumnMapping;
  onMapping(mapping: ColumnMapping): void;
  onValidate(): void;
  onBack(): void;
  busy: boolean;
}

/** Controlled column mapping: the suggested mapping arrives from the parent and every change goes back to it. */
export function MapStep({ headers, mapping, onMapping, onValidate, onBack, busy }: MapStepProps) {
  const { t } = useT();
  const problems = mappingProblems(mapping);
  const set = (header: string, field: string) => {
    const next = { ...mapping };
    if (field) next[header] = field as ImportField;
    else delete next[header];
    onMapping(next);
  };
  return (
    <section className="import-step" aria-label={t('crm.import.step_map')}>
      <p>{t('crm.import.map_instruction')}</p>
      <table className="mapping-table">
        <thead><tr><th>{t('crm.import.col_file_header')}</th><th>{t('crm.import.col_maps_to')}</th></tr></thead>
        <tbody>
          {headers.map((header) => (
            <tr key={header}>
              <td>{header}</td>
              <td>
                <select aria-label={t('crm.import.maps_to_for', { header })} value={mapping[header] ?? ''} onChange={(e) => set(header, e.target.value)}>
                  <option value="">{t('crm.import.not_mapped')}</option>
                  {IMPORT_FIELDS.map((f) => <option key={f} value={f}>{t(`crm.import.field_${f}`)}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {problems.map((p) => <p key={p} className="hint">{t(`crm.import.problem_${p}`)}</p>)}
      <div className="form-actions">
        <Button onClick={onValidate} disabled={problems.length > 0 || busy}>{t('crm.import.validate_button')}</Button>
        <Button variant="secondary" onClick={onBack}>{t('common.back')}</Button>
      </div>
    </section>
  );
}
