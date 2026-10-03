import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../../lib/api';
import {
  DataGrid,
  Button,
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  PermissionDenied,
  FilterChips,
  type Column,
  type FilterOption,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createPartyApi, PartyListItem } from '../api';
import '../styles/CustomersScreen.css';

interface HouseholdPanel {
  partyId: string;
  displayName: string;
  householdName?: string;
  members?: Array<{ partyId: string; relation: string }>;
  roles?: string[];
}

const SEGMENT_OPTIONS: FilterOption[] = [
  { label: 'All', value: '', count: 0 },
  { label: 'With dues', value: 'with_dues', count: 0 },
  { label: 'No policy', value: 'no_policy', count: 0 },
];

export function CustomersScreen() {
  const api = useApi();
  const partyApi = createPartyApi(api);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [items, setItems] = useState<PartyListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('');
  const [householdPanel, setHouseholdPanel] = useState<HouseholdPanel | undefined>();
  const [nextCursor, setNextCursor] = useState<string | undefined>();

  const loadCustomers = useCallback(
    async (cursor?: string) => {
      try {
        setLoading(true);
        setError(undefined);
        const result = await partyApi.listParties({
          q: searchQuery || undefined,
          tag: selectedSegment || undefined,
          cursor,
        });
        setItems(result.items);
        setNextCursor(result.nextCursor);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 403) {
            setError(err);
          } else {
            setError(err);
          }
        }
      } finally {
        setLoading(false);
      }
    },
    [partyApi, searchQuery, selectedSegment]
  );

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
  };

  const handleSegmentChange = (segment: string) => {
    setSelectedSegment(segment);
  };

  const handleRowClick = (item: PartyListItem) => {
    setHouseholdPanel({
      partyId: item.id,
      displayName: item.displayName,
      householdName: item.householdName,
      roles: item.rolesSummary,
    });
  };

  const handleOpenRecord = () => {
    if (householdPanel) {
      // Navigate to customer record
      window.location.hash = `/crm/customers/${householdPanel.partyId}`;
    }
  };

  const handleClosePanel = () => {
    setHouseholdPanel(undefined);
  };

  const columns: Column[] = [
    {
      key: 'displayName',
      label: t('party.customers.name'),
      sortable: true,
      render: (value) => value,
    },
    {
      key: 'primaryMobileMasked',
      label: t('party.customers.mobile'),
      render: (value) => value || '–',
    },
    {
      key: 'householdName',
      label: t('party.customers.household'),
      render: (value) => value || '–',
    },
    {
      key: 'rolesSummary',
      label: t('party.customers.roles'),
      render: (value: string[]) => value.join(', ') || '–',
    },
    {
      key: 'ownerMemberId',
      label: t('party.customers.owner'),
      render: (value) => value || '–',
    },
    {
      key: 'tags',
      label: t('party.customers.tags'),
      render: (value: string[]) => value.join(', ') || '–',
    },
  ];

  if (loading && items.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} onRetry={() => loadCustomers()} />;
  }

  return (
    <div className="customers-screen">
      <div className="screen-header">
        <div>
          <h1>{t('party.customers.title')}</h1>
          <p className="shared-number-note">{t('party.customers.shared_number_note')}</p>
        </div>
      </div>

      <div className="search-and-filters">
        <input
          type="text"
          className="search-box"
          placeholder={t('party.customers.search_placeholder')}
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          aria-label="Search customers"
        />
        <FilterChips
          options={SEGMENT_OPTIONS}
          selected={selectedSegment}
          onChange={handleSegmentChange}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t('party.customers.empty_title')}
          description={t('party.customers.empty_description')}
          icon="👥"
        />
      ) : (
        <DataGrid
          columns={columns}
          data={items}
          onRowClick={handleRowClick}
          rowKey="id"
          aria-label="Customers grid"
        />
      )}

      {householdPanel && (
        <div className="household-panel" role="complementary" aria-label="Household details">
          <div className="panel-header">
            <h3>{householdPanel.displayName}</h3>
            <button
              className="close-button"
              onClick={handleClosePanel}
              aria-label="Close panel"
            >
              ✕
            </button>
          </div>

          <div className="panel-content">
            {householdPanel.householdName && (
              <div className="panel-section">
                <label>{t('party.customers.household_label')}</label>
                <p>{householdPanel.householdName}</p>
              </div>
            )}

            {householdPanel.roles && householdPanel.roles.length > 0 && (
              <div className="panel-section">
                <label>{t('party.customers.roles_label')}</label>
                <ul>
                  {householdPanel.roles.map((role, idx) => (
                    <li key={idx}>{role}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="panel-actions">
            <Button variant="primary" onClick={handleOpenRecord}>
              {t('party.customers.open_full_record')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
