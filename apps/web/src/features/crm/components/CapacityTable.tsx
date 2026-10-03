import { useT } from '../../../lib/i18n';
import { type CapacityRow } from '../api';

interface CapacityTableProps {
  rows: CapacityRow[];
}

export function CapacityTable({ rows }: CapacityTableProps) {
  const { t } = useT();

  if (rows.length === 0) {
    return <p>{t('crm.routing.no_capacity_data')}</p>;
  }

  return (
    <table className="capacity-table">
      <thead>
        <tr>
          <th>{t('crm.routing.col_name')}</th>
          <th>{t('crm.routing.col_type')}</th>
          <th>{t('crm.routing.col_open_today')}</th>
          <th>{t('crm.routing.col_capacity')}</th>
          <th>{t('crm.routing.col_status')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.memberId} className={row.available ? 'available' : 'at-capacity'}>
            <td>{row.displayName}</td>
            <td>{row.salespersonType}</td>
            <td>{row.openLeadsToday}</td>
            <td>{row.capacityPerDay}</td>
            <td>
              {row.available ? (
                <span className="badge badge-success">{t('crm.routing.status_available')}</span>
              ) : (
                <span className="badge badge-warning">{row.reason ?? t('crm.routing.status_at_capacity')}</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
