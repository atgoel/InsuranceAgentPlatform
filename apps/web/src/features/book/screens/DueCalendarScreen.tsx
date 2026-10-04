import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LoadingSkeleton } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { formatMoney } from '../../../lib/format';
import { usePermissions } from '../../../lib/auth/me';
import type { ApiError } from '../../../lib/api/api-error';
import type { DueItem } from '../api';
import { asError, BookError, istToday, SourceBanner, useBookApi } from '../shared';
import { MarkPaidSheet } from '../MarkPaidSheet';
import '../book.css';

export function DueCalendarScreen() {
  const api = useBookApi(); const { t, lang, setLang } = useT(); const [params] = useSearchParams(); const { can } = usePermissions();
  const [month, setMonth] = useState(istToday().slice(0, 7)); const [day, setDay] = useState(istToday());
  const [line, setLine] = useState(''); const [days, setDays] = useState<Array<{ date: string; dues: DueItem[] }>>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<ApiError>();
  const [payment, setPayment] = useState<DueItem>(); const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    const [year, m] = month.split('-').map(Number); const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
    async function load() { setLoading(true); setError(undefined); try { const r = await api.dues(`${month}-01`, `${month}-${last}`); if (live) setDays(r.days); } catch (e) { if (live) setError(asError(e)); } finally { if (live) setLoading(false); } }
    void load();
    return () => { live = false; };
  }, [api, month, revision]);
  const dues = days.flatMap((d) => d.dues).filter((d) => (!line || d.line === line) && (params.get('policyId') ? d.policyId === params.get('policyId') : d.dueDate === day));
  const [year, m] = month.split('-').map(Number); const count = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return <main className="book-screen"><header><h1>{t('book.dues_title')}</h1><Link to="/m/book/import">{t('book.import_title')}</Link><button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}>{t('book.language')}</button></header>
    <label>{t('book.month')}<input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setDay(`${e.target.value}-01`); }} /></label>
    <label>{t('book.line')}<select value={line} onChange={(e) => setLine(e.target.value)}>{['', 'LIFE', 'HEALTH', 'GENERAL'].map((v) => <option key={v} value={v}>{v ? t(`book.enum.${v}`) : t('book.all')}</option>)}</select></label>
    <BookError error={error} />{loading && <LoadingSkeleton />}
    {!loading && !error && <><div className="book-calendar" role="group" aria-label={t('book.calendar_days')}>
      {Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`).map((date) => <button key={date} aria-pressed={date === day} onClick={() => setDay(date)}>{Number(date.slice(-2))}<small>{days.find((d) => d.date === date)?.dues.filter((d) => !line || d.line === line).length ?? 0}</small></button>)}
    </div><h2>{day}</h2>{dues.length === 0 && <p>{t('book.no_dues')}</p>}
      <ul className="book-list">{dues.map((due) => <li key={`${due.policyId}:${due.dueDate}`}><h3>{due.holderName}</h3><p>{due.productName} · {formatMoney(due.amountPaise)}</p><p>{t(`book.enum.${due.status}`)}{due.graceEndsOn && ` · ${t('book.grace_end')} ${due.graceEndsOn}`}</p>
        <SourceBanner {...due} />
        {can('book.write') && <button onClick={() => setPayment(due)}>{t('book.mark_paid')}</button>}<button disabled title={t('book.reminder_later')}>{t('book.reminder')}</button></li>)}</ul></>}
    {payment && <MarkPaidSheet due={payment} onClose={() => setPayment(undefined)} onSaved={() => setRevision((r) => r + 1)} />}
  </main>;
}
