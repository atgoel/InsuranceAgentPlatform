import { CountChips, SearchField } from '../../../design-system';
import { useT } from '../../../lib/i18n';

export type CustomerSegment = 'all' | 'tags';

interface CustomersFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  segment: CustomerSegment;
  onSegmentChange: (segment: CustomerSegment) => void;
  tag: string;
  onTagChange: (value: string) => void;
}

/**
 * Segment chips are All and Tags. With dues and No policy wait for ADR-M03-customer-segments (Proposed), and no chip
 * carries a count because the list response carries none.
 */
export function CustomersFilters({ search, onSearchChange, segment, onSegmentChange, tag, onTagChange }: CustomersFiltersProps) {
  const { t } = useT();

  return (
    <div className="customers-filters">
      <CountChips
        ariaLabel={t('party.customers.segments')}
        selected={segment}
        onChange={(id) => onSegmentChange(id === 'tags' ? 'tags' : 'all')}
        options={[
          { id: 'all', label: t('party.customers.segment_all') },
          { id: 'tags', label: t('party.customers.segment_tags') },
        ]}
      />
      {segment === 'tags' && <SearchField label={t('party.customers.tag_label')} value={tag} onChange={onTagChange} />}
      <SearchField
        label={t('party.customers.search_label')}
        placeholder={t('party.customers.search_placeholder')}
        value={search}
        onChange={onSearchChange}
      />
    </div>
  );
}
