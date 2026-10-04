import { useEffect, useState } from 'react';
import { LoadingSkeleton } from '../../design-system';
import { useT } from '../../lib/i18n';
import { formatMoney } from '../../lib/format';
import type { ApiError } from '../../lib/api/api-error';
import type { HeldPolicyView } from './api';
import { asError, BookError, SourceBanner, useBookApi } from './shared';
import { HeldPolicyDetail } from './HeldPolicyDetail';
import './book.css';

export function HeldPoliciesPanel({ partyId }: { partyId: string }) {
  const api = useBookApi(); const { t } = useT();
  const [items, setItems] = useState<HeldPolicyView[]>([]); const [error, setError] = useState<ApiError>();
  const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<string>();
  useEffect(() => {
    let live = true;
    async function load() { setLoading(true); setError(undefined); setItems([]); setSelected(undefined); try { const r = await api.policies(partyId); if (live) setItems(r.items); } catch (e) { if (live) setError(asError(e)); } finally { if (live) setLoading(false); } }
    void load();
    return () => { live = false; };
  }, [api, partyId]);
  return <section className="book-screen"><h2>{t('book.policies')}</h2><BookError error={error} />
    {loading && <LoadingSkeleton />}{!loading && !error && items.length === 0 && <p>{t('book.no_policies')}</p>}
    {!loading && !error && <ul className="book-list">{items.map((p) => <li key={p.id}><h3>{p.productName}</h3><p>{p.insurerName} · {p.policyNumber} · {formatMoney(p.premiumPaise)}</p><p>{t(`book.enum.${p.status}`)}</p><SourceBanner {...p} /><button onClick={() => setSelected(p.id)}>{t('book.details')}</button></li>)}</ul>}
    {selected && <HeldPolicyDetail id={selected} onClose={() => setSelected(undefined)} />}
  </section>;
}
