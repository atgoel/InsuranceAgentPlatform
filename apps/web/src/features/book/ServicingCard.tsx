import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { usePermissions } from '../../lib/auth/me';
import type { ApiError } from '../../lib/api/api-error';
import type { ServicingRequest } from './api';
import { asError, BookError, useBookApi } from './shared';

const transitions: Record<string, string[]> = { OPEN: ['SUBMITTED_TO_INSURER'], SUBMITTED_TO_INSURER: ['AWAITING_CUSTOMER', 'RESOLVED', 'REJECTED'], AWAITING_CUSTOMER: ['SUBMITTED_TO_INSURER', 'RESOLVED', 'REJECTED'], RESOLVED: [], REJECTED: [] };
export function ServicingCard({ request, onUpdated }: { request: ServicingRequest; onUpdated(r: ServicingRequest): void }) {
  const api = useBookApi(); const { t } = useT(); const { can } = usePermissions(); const [text, setText] = useState(''); const [error, setError] = useState<ApiError>(); const [busy, setBusy] = useState(false);
  async function action(run: () => Promise<ServicingRequest>) { setBusy(true); setError(undefined); try { onUpdated(await run()); setText(''); } catch (e) { setError(asError(e)); } finally { setBusy(false); } }
  return <article className="book-card"><h3>{t(`book.enum.${request.kind}`)}</h3><p>{t(`book.enum.${request.status}`)} · {request.followUpOn ?? t('book.no_followup')}</p>{request.insurerRef && <p>{t('book.insurer_ref')} {request.insurerRef}</p>}
    {request.portalUrl?.startsWith('https://') && <a href={request.portalUrl} target="_blank" rel="noopener noreferrer">{t('book.portal')}</a>}<BookError error={error} />
    {can('book.servicing') && (transitions[request.status] ?? []).map((status) => <button key={status} disabled={busy} onClick={() => void action(() => api.transition(request, status))}>{t(`book.enum.${status}`)}</button>)}
    <ul>{request.notes.map((n, i) => <li key={`${n.at}:${i}`}>{n.at} · {n.text}</li>)}</ul>
    {can('book.servicing') && <form onSubmit={(e) => { e.preventDefault(); void action(() => api.note(request.id, text)); }}><label>{t('book.note')}<textarea required value={text} onChange={(e) => setText(e.target.value)} /></label><button disabled={busy || !text.trim()}>{t('book.add_note')}</button></form>}
  </article>;
}
export function NewServicingForm({ policyId, onCreated }: { policyId: string; onCreated(r: ServicingRequest): void }) {
  const api = useBookApi(); const { t } = useT(); const [kind, setKind] = useState('ADDRESS_CHANGE'); const [insurerRef, setRef] = useState(''); const [followUpOn, setFollowup] = useState(''); const [portalUrl, setPortal] = useState(''); const [error, setError] = useState<ApiError>(); const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); setError(undefined); try { onCreated(await api.createRequest(policyId, { kind, insurerRef: insurerRef || undefined, followUpOn: followUpOn || undefined, portalUrl: portalUrl || undefined })); } catch (e) { setError(asError(e)); } finally { setBusy(false); } }
  return <form onSubmit={(e) => { e.preventDefault(); void save(); }}><h3>{t('book.new_request')}</h3><BookError error={error} />
    <label>{t('book.request_kind')}<select value={kind} onChange={(e) => setKind(e.target.value)}>{['ADDRESS_CHANGE', 'NOMINEE_CHANGE', 'BANK_MANDATE', 'SURRENDER', 'LOAN', 'CLAIM', 'DUPLICATE_POLICY', 'OTHER'].map((k) => <option key={k} value={k}>{t(`book.enum.${k}`)}</option>)}</select></label>
    <label>{t('book.insurer_ref')}<input value={insurerRef} onChange={(e) => setRef(e.target.value)} /></label><label>{t('book.followup')}<input type="date" value={followUpOn} onChange={(e) => setFollowup(e.target.value)} /></label><label>{t('book.portal')}<input type="url" pattern="https://.*" value={portalUrl} onChange={(e) => setPortal(e.target.value)} /></label><button disabled={busy}>{t('book.new_request')}</button>
  </form>;
}
