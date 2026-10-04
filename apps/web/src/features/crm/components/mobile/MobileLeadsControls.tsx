import { CountChips, SearchField, Select } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { LeadStats, ProductLine } from '../../api';

const PRODUCT_LINES: ProductLine[] = ['TERM_LIFE', 'SAVINGS_LIFE', 'HEALTH', 'HEALTH_FLOATER', 'CHILD', 'RETIREMENT', 'MOTOR', 'OTHER'];
const VIEWS = ['all_open', 'unassigned', 'sla_breached', 'mine'] as const;

interface MobileLeadsControlsProps {
  stats?: LeadStats;
  view: string;
  onView(view: string): void;
  search: string;
  onSearch(value: string): void;
  product?: ProductLine;
  onProduct(product?: ProductLine): void;
}

/** Only All open and Unassigned have a count (`/leads/stats`); SLA breached and Mine show none (M04 §frontend, 2026-10-04). */
function countFor(view: string, stats?: LeadStats): number | undefined {
  if (!stats) return undefined;
  if (view === 'all_open') return stats.open;
  if (view === 'unassigned') return stats.unassigned;
  return undefined;
}

/** Search, saved-view chips with counts, and the product filter. All stay mounted while the list loads. */
export function MobileLeadsControls({ stats, view, onView, search, onSearch, product, onProduct }: MobileLeadsControlsProps) {
  const { t } = useT();
  const options = VIEWS.map((id) => ({ id, label: t(`crm.leads.view.${id}`), count: countFor(id, stats) }));
  const products = [
    { value: '', label: t('crm.leads.all_products') },
    ...PRODUCT_LINES.map((p) => ({ value: p, label: t(`labels.line.${p}`) })),
  ];
  return (
    <>
      <SearchField label={t('crm.mobile.search_label')} placeholder={t('crm.mobile.search_label')} value={search} onChange={onSearch} />
      <CountChips ariaLabel={t('crm.mobile.views')} options={options} selected={view} onChange={onView} />
      <Select
        label={t('crm.leads.product')}
        value={product ?? ''}
        options={products}
        onChange={(value) => onProduct(value ? (value as ProductLine) : undefined)}
      />
    </>
  );
}
