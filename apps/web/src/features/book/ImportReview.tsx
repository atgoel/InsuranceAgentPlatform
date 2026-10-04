import { useT } from '../../lib/i18n';
import type { ImportRow } from './api';
import { reasonLabel } from './display';
import { SourceBanner } from './shared';

function ReferrerCell({ row, busy, onConfirm }: { row: ImportRow; busy: boolean; onConfirm(rowNo: number, link: { memberId?: string; partyId?: string }): void }) {
  const { t } = useT(); const referrer = record(record(row.parsed?.commercials).referredBy);
  const confirmed = Boolean(referrer.memberId || referrer.partyId);
  const name = String(referrer.name ?? '');
  return <>{name && <p>{name}</p>}{confirmed ? <p>{t('book.referrer_confirmed')}</p> : <>{row.referrerSuggestions?.map((s, i) => <button key={i} disabled={busy} onClick={() => onConfirm(row.rowNo, { memberId: s.memberId, partyId: s.partyId })}>{t('book.confirm_referrer')} {s.name ?? s.memberId ?? s.partyId}</button>)}<p>{t('book.name_only')}</p></>}</>;
}
function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }

export function ImportReview({ rows, asOf, busy, onDecision, onReferrer }: { rows: ImportRow[]; asOf: string; busy: boolean; onDecision(rowNo: number, decision: string): void; onReferrer(rowNo: number, link: { memberId?: string; partyId?: string }): void }) {
  const { t } = useT();
  return <div className="book-table-wrap"><table><thead><tr><th>{t('book.row')}</th><th>{t('book.policy_preview')}</th><th>{t('book.review_result')}</th><th>{t('book.problems')}</th><th>{t('book.decision')}</th><th>{t('book.referrer')}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.rowNo}><td>{row.rowNo}</td><td>{row.parsed && <><p>{String(row.parsed.holderName ?? '')} · {String(row.parsed.policyNumber ?? '')}</p><p>{String(row.parsed.insurerName ?? '')} · {String(row.parsed.productName ?? '')}</p><SourceBanner source="IMPORT" asOf={asOf} confidence="MEDIUM" /></>}</td><td>{row.match ? t(`book.enum.${row.match.kind}`) : '—'}</td><td>{row.problems.map((p) => <p key={p}>{reasonLabel(p, t)}</p>)}{row.warnings?.map((w) => <p key={w}>{reasonLabel(w, t)}</p>)}</td><td><select disabled={busy} aria-label={`${t('book.decision')} ${row.rowNo}`} value={row.decision ?? ''} onChange={(e) => onDecision(row.rowNo, e.target.value)}><option value="">{t('book.choose')}</option>{['IMPORT', 'UPDATE', 'SKIP'].map((d) => <option key={d} value={d} disabled={d !== 'SKIP' && row.problems.length > 0}>{t(`book.decision.${d}`)}</option>)}</select></td><td><ReferrerCell row={row} busy={busy} onConfirm={onReferrer} /></td></tr>)}</tbody></table>{rows.length === 0 && <p>{t('book.no_review_rows')}</p>}</div>;
}
