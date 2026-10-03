import { DataGrid, type Column } from '../../../design-system';
import { PartyListItem } from '../api';
import { useT } from '../../../lib/i18n';

interface CustomersGridProps {
  items: PartyListItem[];
  onRowClick: (item: PartyListItem) => void;
}

export function CustomersGrid({ items, onRowClick }: CustomersGridProps) {
  const { t } = useT();

  const columns: Column<PartyListItem>[] = [
    {
      key: 'displayName',
      header: t('party.customers.name'),
      render: (item) => item.displayName,
    },
    {
      key: 'primaryMobileMasked',
      header: t('party.customers.mobile'),
      render: (item) => item.primaryMobileMasked || '–',
    },
    {
      key: 'householdName',
      header: t('party.customers.household'),
      render: (item) => item.householdName || '–',
    },
    {
      key: 'rolesSummary',
      header: t('party.customers.roles'),
      render: (item) => item.rolesSummary.join(', ') || '–',
    },
    {
      key: 'ownerMemberId',
      header: t('party.customers.owner'),
      render: (item) => item.ownerMemberId || '–',
    },
    {
      key: 'tags',
      header: t('party.customers.tags'),
      render: (item) => item.tags.join(', ') || '–',
    },
  ];

  return (
    <DataGrid<PartyListItem>
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      onRowClick={onRowClick}
      caption="Customers list"
    />
  );
}
