import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageContainer,
  PageHeader,
  PermissionDenied,
} from '../../../design-system';
import { useApi } from '../../../lib/api';
import { useT } from '../../../lib/i18n';
import { createPartyApi, type PartyListItem } from '../api';
import { CustomersFilters, type CustomerSegment } from '../components/CustomersFilters';
import { CustomersGrid } from '../components/CustomersGrid';
import { HouseholdPanel } from '../components/HouseholdPanel';
import { usePartyBase } from '../partyLabels';
import { useCustomersList, type CustomersListState } from '../useCustomersList';
import { useDebouncedValue } from '../useDebouncedValue';
import '../styles/party-frame.css';
import '../styles/CustomersScreen.css';

function CustomersBody({ list, onSelect }: { list: CustomersListState; onSelect: (item: PartyListItem) => void }) {
  const { t } = useT();

  if (list.error) {
    return <ErrorState error={list.error} onRetry={list.reload} />;
  }
  if (list.loading && list.items.length === 0) {
    return <LoadingSkeleton />;
  }
  if (list.items.length === 0) {
    return <EmptyState title={t('party.customers.empty_title')} body={t('party.customers.empty_description')} />;
  }
  return (
    <>
      <CustomersGrid items={list.items} onRowClick={onSelect} />
      <p className="customers-count" aria-live="polite">
        {t('party.customers.showing', { count: list.items.length })}
      </p>
    </>
  );
}

/** CRM04 customers list. Shown under /crm/customers and, at phone width, under /m/customers (D6). */
export function CustomersScreen() {
  const api = useApi();
  const partyApi = useMemo(() => createPartyApi(api), [api]);
  const { t } = useT();
  const navigate = useNavigate();
  const base = usePartyBase();

  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<CustomerSegment>('all');
  const [tag, setTag] = useState('');
  const [selected, setSelected] = useState<PartyListItem | undefined>();

  const q = useDebouncedValue(search).trim();
  const tagQuery = useDebouncedValue(tag).trim();
  const query = useMemo(
    () => ({
      q: q || undefined,
      tag: segment === 'tags' && tagQuery ? tagQuery : undefined,
      segment: segment === 'with_dues' || segment === 'no_policy' ? segment : undefined,
    }),
    [q, segment, tagQuery],
  );
  const list = useCustomersList(partyApi, query);

  if (list.error?.status === 403) {
    return <PermissionDenied />;
  }

  return (
    <div className="party-screen-frame">
      <PageContainer width="wide">
        <PageHeader title={t('party.customers.title')} subtitle={t('party.customers.shared_number_note')} />
        <div className="customers-layout" data-panel={selected ? 'open' : 'closed'}>
          <div className="customers-main">
            <CustomersFilters
              search={search}
              onSearchChange={setSearch}
              segment={segment}
              onSegmentChange={setSegment}
              tag={tag}
              onTagChange={setTag}
            />
            <CustomersBody list={list} onSelect={setSelected} />
          </div>
          {selected && (
            <HouseholdPanel
              key={selected.id}
              party={selected}
              onClose={() => setSelected(undefined)}
              onOpenRecord={() => navigate(`${base}/customers/${selected.id}`)}
            />
          )}
        </div>
      </PageContainer>
    </div>
  );
}
