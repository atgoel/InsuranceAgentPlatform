import { CountChips, SearchField } from '../../../design-system';
import { useT } from '../../../lib/i18n';

export type CustomerSegment = 'all' | 'with_dues' | 'no_policy' | 'tags';

const SEGMENTS: readonly CustomerSegment[] = ['all', 'with_dues', 'no_policy', 'tags'];

function toSegment(id: string): CustomerSegment {
  return SEGMENTS.find((segment) => segment === id) ?? 'all';
}

interface CustomersFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  segment: CustomerSegment;
  onSegmentChange: (segment: CustomerSegment) => void;
  tag: string;
  onTagChange: (value: string) => void;
}

/** Segment chips: All, With dues, No policy and Tags (ADR-M03-customer-segments). No chip carries a count. */
export function CustomersFilters({ search, onSearchChange, segment, onSegmentChange, tag, onTagChange }: CustomersFiltersProps) {
  const { t } = useT();

  return (
    <div className="customers-filters">
      <CountChips
        ariaLabel={t('party.customers.segments')}
        selected={segment}
        onChange={(id) => onSegmentChange(toSegment(id))}
        options={[
          { id: 'all', label: t('party.customers.segment_all') },
          { id: 'with_dues', label: t('party.customers.segment_with_dues') },
          { id: 'no_policy', label: t('party.customers.segment_no_policy') },
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
