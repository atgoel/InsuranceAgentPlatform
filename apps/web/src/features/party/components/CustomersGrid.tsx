import { DataGrid, type Column } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { PartyListItem } from '../api';
import { roleSummaryText } from '../partyLabels';

interface CustomersGridProps {
  items: PartyListItem[];
  onRowClick: (item: PartyListItem) => void;
}

const NONE = '–';

/** Customers list (CRM04). The grid scrolls inside its own container at phone width. */
export function CustomersGrid({ items, onRowClick }: CustomersGridProps) {
  const { t } = useT();

  const columns: Column<PartyListItem>[] = [
    {
      key: 'displayName',
      header: t('party.customers.name'),
      render: (item) => (
        <button type="button" className="customer-link" onClick={() => onRowClick(item)}>
          {item.displayName}
        </button>
      ),
    },
    { key: 'primaryMobileMasked', header: t('party.customers.mobile'), render: (item) => item.primaryMobileMasked || NONE },
    { key: 'householdName', header: t('party.customers.household'), render: (item) => item.householdName || NONE },
    {
      key: 'rolesSummary',
      header: t('party.customers.roles'),
      render: (item) => item.rolesSummary.map((role) => roleSummaryText(t, role)).join(', ') || NONE,
    },
    {
      key: 'ownerName',
      header: t('party.customers.owner'),
      render: (item) => <span className="customer-owner">{item.ownerName || NONE}</span>,
    },
    { key: 'tags', header: t('party.customers.tags'), render: (item) => item.tags.join(', ') || NONE },
  ];

  return (
    <div className="customers-grid">
      <DataGrid<PartyListItem>
        columns={columns}
        rows={items}
        rowKey={(item) => item.id}
        onRowClick={onRowClick}
        caption={t('party.customers.grid_caption')}
      />
    </div>
  );
}
