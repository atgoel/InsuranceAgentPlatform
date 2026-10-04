import { useMemo } from 'react';
import { CountChips, SearchField, Select, type CountChipOption, type SelectOption } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { LeadStats, ProductLine } from '../api';

const PRODUCT_LINES: ProductLine[] = ['TERM_LIFE', 'SAVINGS_LIFE', 'HEALTH', 'HEALTH_FLOATER', 'CHILD', 'RETIREMENT', 'MOTOR', 'OTHER'];

interface LeadsWorkspaceFiltersProps {
  stats?: LeadStats;
  selectedView: string;
  onViewChange: (view: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  product?: ProductLine;
  onProductChange: (product?: ProductLine) => void;
  owner: string;
  onOwnerChange: (owner: string) => void;
  /** Owners seen so far, member id to display name. */
  owners: Record<string, string>;
}

/** Counts exist only for the views the stats endpoint can answer: All open and Unassigned. */
function viewChips(t: (key: string) => string, stats?: LeadStats): CountChipOption[] {
  return [
    { id: 'all_open', label: t('crm.leads.view.all_open'), count: stats?.open },
    { id: 'unassigned', label: t('crm.leads.view.unassigned'), count: stats?.unassigned },
    { id: 'sla_breached', label: t('crm.leads.view.sla_breached') },
    { id: 'mine', label: t('crm.leads.view.mine') },
  ];
}

/** Saved views, search, owner and product filters for the leads workspace (CRM01). */
export function LeadsWorkspaceFilters(props: LeadsWorkspaceFiltersProps) {
  const { t } = useT();
  const { stats, owners } = props;
  const chips = useMemo(() => viewChips(t, stats), [t, stats]);
  const ownerOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('crm.leads.all_owners') },
      { value: 'unassigned', label: t('crm.leads.owner_unassigned') },
      ...Object.entries(owners).map(([id, name]) => ({ value: id, label: name })),
    ],
    [t, owners],
  );
  const productOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('crm.leads.all_products') },
      ...PRODUCT_LINES.map((p) => ({ value: p, label: t(`labels.line.${p}`) })),
    ],
    [t],
  );

  return (
    <div className="lead-filters">
      <CountChips options={chips} selected={props.selectedView} onChange={props.onViewChange} ariaLabel={t('crm.leads.views_label')} />
      <div className="lead-filter-fields">
        <SearchField
          label={t('crm.leads.search_label')}
          value={props.search}
          onChange={props.onSearchChange}
          placeholder={t('crm.leads.search_placeholder')}
        />
        <Select label={t('crm.leads.owner_filter')} value={props.owner} options={ownerOptions} onChange={props.onOwnerChange} />
        <Select
          label={t('crm.leads.product')}
          value={props.product ?? ''}
          options={productOptions}
          onChange={(value) => props.onProductChange(value ? (value as ProductLine) : undefined)}
        />
      </div>
    </div>
  );
}
