import { StatusChip } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { CustomFieldDefinition } from '../api';

export interface CustomFieldsTableProps {
  items: CustomFieldDefinition[];
  canWrite: boolean;
  busyId?: string;
  onEdit(definition: CustomFieldDefinition): void;
  onToggleActive(definition: CustomFieldDefinition): void;
}

export function CustomFieldsTable({ items, canWrite, busyId, onEdit, onToggleActive }: CustomFieldsTableProps) {
  const { t, lang } = useT();
  const yesNo = (v: boolean) => (v ? t('tenancy.cf.yes') : t('tenancy.cf.no'));
  return (
    <table className="cf-table">
      <thead>
        <tr>
          <th scope="col">{t('tenancy.cf.key')}</th>
          <th scope="col">{t('tenancy.cf.label')}</th>
          <th scope="col">{t('tenancy.cf.type')}</th>
          <th scope="col">{t('tenancy.cf.pii')}</th>
          <th scope="col">{t('tenancy.cf.required')}</th>
          <th scope="col">{t('tenancy.cf.reportable')}</th>
          <th scope="col">{t('tenancy.cf.active')}</th>
          {canWrite && <th scope="col"><span className="cf-visually-hidden">{t('tenancy.cf.actions')}</span></th>}
        </tr>
      </thead>
      <tbody>
        {items.map((d) => {
          const name = d.label[lang] ?? d.label.en;
          return (
            <tr key={d.id}>
              <td>{d.key}</td>
              <td>{name}</td>
              <td>{t(`tenancy.cf.type.${d.type}`)}</td>
              <td><StatusChip tone="neutral">{d.piiClass}</StatusChip></td>
              <td>{yesNo(d.required)}</td>
              <td>{yesNo(d.reportable)}</td>
              <td>
                {canWrite ? (
                  <button type="button" role="switch" aria-checked={d.active} aria-label={t('tenancy.cf.active_switch', { name })} disabled={busyId === d.id} onClick={() => onToggleActive(d)}>
                    {yesNo(d.active)}
                  </button>
                ) : yesNo(d.active)}
              </td>
              {canWrite && (
                <td>
                  <button type="button" onClick={() => onEdit(d)} aria-label={t('tenancy.cf.edit_field', { name })}>{t('common.edit')}</button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
