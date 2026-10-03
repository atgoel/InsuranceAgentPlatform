import { useState, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import {
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  PermissionDenied,
  FilterChips,
  type FilterOption,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createPartyApi, PartyListItem } from '../api';
import { CustomersGrid } from '../components/CustomersGrid';
import { HouseholdPanel } from '../components/HouseholdPanel';
import '../styles/CustomersScreen.css';

interface SelectedParty {
  id: string;
  displayName: string;
  householdName?: string;
  roles?: string[];
}

const SEGMENT_OPTIONS: FilterOption[] = [
  { id: '', label: 'All', count: 0 },
  { id: 'with_dues', label: 'With dues', count: 0 },
  { id: 'no_policy', label: 'No policy', count: 0 },
];

export function CustomersScreen() {
  const api = useApi();
  const partyApi = createPartyApi(api);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [items, setItems] = useState<PartyListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedParty, setSelectedParty] = useState<SelectedParty | undefined>();

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const result = await partyApi.listParties({
          q: searchQuery || undefined,
          tag: selectedSegments.length > 0 ? selectedSegments[0] : undefined,
        });
        setItems(result.items);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    loadCustomers();
  }, [partyApi, searchQuery, selectedSegments]);

  const handleRowClick = (item: PartyListItem) => {
    setSelectedParty({
      id: item.id,
      displayName: item.displayName,
      householdName: item.householdName,
      roles: item.rolesSummary,
    });
  };

  const handleOpenRecord = () => {
    if (selectedParty) {
      window.location.hash = `/crm/customers/${selectedParty.id}`;
    }
  };

  if (loading && items.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
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
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Search customers"
        />
        <FilterChips
          options={SEGMENT_OPTIONS}
          selected={selectedSegments}
          onChange={setSelectedSegments}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={t('party.customers.empty_title')}
          body={t('party.customers.empty_description')}
        />
      ) : (
        <CustomersGrid items={items} onRowClick={handleRowClick} />
      )}

      {selectedParty && (
        <HouseholdPanel
          displayName={selectedParty.displayName}
          householdName={selectedParty.householdName}
          roles={selectedParty.roles}
          onClose={() => setSelectedParty(undefined)}
          onOpenRecord={handleOpenRecord}
        />
      )}
    </div>
  );
}
