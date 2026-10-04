import { useT } from '../../../lib/i18n';
import { type LeadListItem } from '../api';
import { LeadRow } from './LeadRow';

interface LeadsGridProps {
  items: LeadListItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function LeadsGrid({ items, selectedIds, onSelectionChange }: LeadsGridProps) {
  const { t } = useT();
  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const toggleAll = (checked: boolean) => {
    onSelectionChange(checked ? items.map((i) => i.id) : []);
  };

  const toggleItem = (id: string, checked: boolean) => {
    onSelectionChange(checked ? [...selectedIds, id] : selectedIds.filter((sid) => sid !== id));
  };

  return (
    <div className="leads-grid">
      <table aria-label={t('crm.leads.grid_label')}>
        <thead>
          <tr>
            <th>
              <input type="checkbox" checked={allSelected} onChange={(e) => toggleAll(e.target.checked)} aria-label={t('crm.leads.select_all')} />
            </th>
            <th>{t('crm.leads.name')}</th>
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
            <LeadRow key={item.id} item={item} selected={selectedIds.includes(item.id)} onToggle={(checked) => toggleItem(item.id, checked)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
