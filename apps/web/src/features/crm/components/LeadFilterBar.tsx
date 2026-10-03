import { FilterChips, type FilterOption } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ProductLine } from '../api';

const PRODUCT_LINES: ProductLine[] = ['TERM_LIFE', 'SAVINGS_LIFE', 'HEALTH', 'HEALTH_FLOATER', 'CHILD', 'RETIREMENT', 'MOTOR', 'OTHER'];

interface LeadFilterBarProps {
  views: FilterOption[];
  selectedView: string;
  onViewChange: (view: string) => void;
  product?: ProductLine;
  onProductChange: (product?: ProductLine) => void;
}

/** Saved views (chips) and the product filter for the leads workspace (CRM01). */
export function LeadFilterBar({ views, selectedView, onViewChange, product, onProductChange }: LeadFilterBarProps) {
  const { t } = useT();
  return (
    <div className="view-selector">
      <FilterChips options={views} selected={[selectedView]} onChange={(ids) => onViewChange(ids[0] || 'all_open')} />
      <label className="product-filter">
        {t('crm.leads.product')}
        <select value={product ?? ''} onChange={(e) => onProductChange(e.target.value ? (e.target.value as ProductLine) : undefined)}>
          <option value="">{t('crm.leads.all_products')}</option>
          {PRODUCT_LINES.map((p) => (
            <option key={p} value={p}>
              {p.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
