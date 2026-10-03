import { useT } from '../../../lib/i18n';
import { type LeadListItem } from '../api';

interface LeadsGridProps {
  items: LeadListItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function LeadsGrid({ items, selectedIds, onSelectionChange }: LeadsGridProps) {
  const { t } = useT();

  const handleToggleAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(items.map((i) => i.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleToggleItem = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedIds, id]);
    } else {
      onSelectionChange(selectedIds.filter((sid) => sid !== id));
    }
  };

  return (
    <div className="leads-grid">
      <table role="grid" aria-label={t('crm.leads.grid_label')}>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={selectedIds.length === items.length && items.length > 0}
                onChange={(e) => handleToggleAll(e.target.checked)}
                aria-label={t('crm.leads.select_all')}
              />
            </th>
            <th>{t('crm.leads.name')}</th>
            <th>{t('crm.leads.mobile')}</th>
            <th>{t('crm.leads.product')}</th>
            <th>{t('crm.leads.source')}</th>
            <th>{t('crm.leads.owner')}</th>
            <th>{t('crm.leads.stage')}</th>
            <th>{t('crm.leads.sla')}</th>
            <th>{t('crm.leads.consent')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="lead-row">
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={(e) => handleToggleItem(item.id, e.target.checked)}
                  aria-label={t('crm.leads.select_item')}
                />
              </td>
              <td>
                <a href={`#/crm/leads/${item.id}`}>{item.name}</a>
              </td>
              <td>{item.mobileMasked || '—'}</td>
              <td>{item.productInterest}</td>
              <td>{item.source}</td>
              <td>{item.ownerName || '—'}</td>
              <td>
                <span className={`stage-badge stage-${item.stage}`}>{item.stage}</span>
              </td>
              <td>
                <span className={`sla-badge sla-${item.slaState}`}>{item.slaState}</span>
              </td>
              <td>
                <span className={`consent-badge consent-${item.consent}`}>{item.consent}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
