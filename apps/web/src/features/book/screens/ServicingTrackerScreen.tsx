import { useEffect, useState } from 'react';
import { DateInput, LoadingSkeleton, PageContainer, PageHeader, PermissionDenied } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ApiError } from '../../../lib/api/api-error';
import type { ServicingRequest } from '../api';
import { asError, BookError, useBookApi } from '../shared';
import { ServicingCard } from '../ServicingCard';
import '../book.css';

function byFollowUp(a: ServicingRequest, b: ServicingRequest): number {
  return (a.followUpOn ?? '').localeCompare(b.followUpOn ?? '') || a.id.localeCompare(b.id);
}

function useServicing(before: string) {
  const api = useBookApi();
  const [items, setItems] = useState<ServicingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError>();
  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      setError(undefined);
      setItems([]);
      try {
        const r = await api.servicing(before || undefined);
        if (live) setItems(r.items);
      } catch (e) {
        if (live) setError(asError(e));
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [api, before]);
  return { items, setItems, loading, error };
}

export function ServicingTrackerScreen() {
  const { t } = useT();
  // The M07 LLD only narrows by follow-up date when asked to, so the default is every open request.
  const [before, setBefore] = useState('');
  const { items, setItems, loading, error } = useServicing(before);
  if (error?.status === 403) {
    return (
      <PageContainer>
        <PageHeader title={t('book.servicing_title')} />
        <PermissionDenied />
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <div className="book-screen">
        <PageHeader title={t('book.servicing_title')} />
        <DateInput label={t('book.followup_before')} value={before} onChange={setBefore} />
        {before && (
          <button type="button" onClick={() => setBefore('')}>
            {t('book.clear_filter')}
          </button>
        )}
        <BookError error={error} />
        {loading && <LoadingSkeleton />}
        {!loading && !error && items.length === 0 && <p>{t('book.no_requests')}</p>}
        {!loading &&
          !error &&
          [...items].sort(byFollowUp).map((r) => (
            <ServicingCard
              key={r.id}
              request={r}
              onUpdated={(updated) => setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))}
            />
          ))}
      </div>
    </PageContainer>
  );
}
