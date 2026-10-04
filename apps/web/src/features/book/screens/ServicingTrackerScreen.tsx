import { useEffect, useState } from 'react';
import { LoadingSkeleton } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ApiError } from '../../../lib/api/api-error';
import type { ServicingRequest } from '../api';
import { asError, BookError, istToday, useBookApi } from '../shared';
import { ServicingCard } from '../ServicingCard';
import '../book.css';

export function ServicingTrackerScreen() {
  const api = useBookApi();
  const { t } = useT();
  const [before, setBefore] = useState(istToday());
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
        const r = await api.servicing(before);
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
  return (
    <main className="book-screen">
      <h1>{t('book.servicing_title')}</h1>
      <label>
        {t('book.followup_before')}
        <input type="date" value={before} onChange={(e) => setBefore(e.target.value)} />
      </label>
      <BookError error={error} />
      {loading && <LoadingSkeleton />}
      {!loading && !error && items.length === 0 && <p>{t('book.no_requests')}</p>}
      {!loading &&
        !error &&
        [...items]
          .sort((a, b) => (a.followUpOn ?? '').localeCompare(b.followUpOn ?? '') || a.id.localeCompare(b.id))
          .map((r) => (
            <ServicingCard
              key={r.id}
              request={r}
              onUpdated={(updated) => setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))}
            />
          ))}
    </main>
  );
}
