import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CountChips, formatIstDate, LoadingSkeleton, MonthInput, PageContainer, PageHeader, type CountChipOption } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import { usePermissions } from '../../../lib/auth/me';
import type { ApiError } from '../../../lib/api/api-error';
import type { DueItem } from '../api';
import { buildCells, countByLine, matchesLine, monthBounds, monthHeading, type DueDay } from '../dueGrid';
import { DueCard } from '../DueCalendarCard';
import { DueMonthGrid } from '../DueMonthGrid';
import { formatPaise } from '../money';
import { MarkPaidSheet } from '../MarkPaidSheet';
import { asError, BookError, istToday, useBookApi } from '../shared';
import '../book.css';
import '../dueCalendar.css';

function useMonthDues(month: string, revision: number) {
  const api = useBookApi();
  const [days, setDays] = useState<DueDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError>();
  useEffect(() => {
    let live = true;
    const { from, to } = monthBounds(month);
    async function load() {
      setLoading(true);
      setError(undefined);
      try {
        const r = await api.dues(from, to);
        if (live) setDays(r.days);
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
  }, [api, month, revision]);
  return { days, loading, error };
}

function useLineOptions(days: DueDay[]): CountChipOption[] {
  const { t } = useT();
  const life = useLabel('line', 'LIFE');
  const health = useLabel('line', 'HEALTH');
  const general = useLabel('line', 'GENERAL');
  return [
    { id: '', label: t('book.all'), count: countByLine(days, '') },
    { id: 'LIFE', label: life, count: countByLine(days, 'LIFE') },
    { id: 'HEALTH', label: health, count: countByLine(days, 'HEALTH') },
    { id: 'GENERAL', label: general, count: countByLine(days, 'GENERAL') },
  ];
}

function monthSummary(days: DueDay[], line: string, label: string): string {
  const dues = days.flatMap((d) => d.dues).filter((due) => matchesLine(due, line));
  const total = dues.reduce((sum, due) => sum + due.amountPaise, 0);
  return `${formatPaise(total)} · ${dues.length} ${label}`;
}

function DayList({ dues, day, canPay, onPay }: { dues: DueItem[]; day: string; canPay: boolean; onPay(due: DueItem): void }) {
  const { t, lang } = useT();
  return (
    <>
      <h2 className="due-heading">{`${t('book.dues_on')} ${formatIstDate(day, lang)}`}</h2>
      {dues.length === 0 && <p className="due-subheading">{t('book.no_dues')}</p>}
      <ul className="book-list">
        {dues.map((due) => (
          <DueCard key={`${due.policyId}:${due.dueDate}`} due={due} canPay={canPay} onPay={onPay} />
        ))}
      </ul>
    </>
  );
}

export function DueCalendarScreen({ today }: { today?: string }) {
  const { t, lang } = useT();
  const start = useMemo(() => today ?? istToday(), [today]);
  const [params] = useSearchParams();
  const { can } = usePermissions();
  const [month, setMonth] = useState(start.slice(0, 7));
  const [day, setDay] = useState(start);
  const [line, setLine] = useState('');
  const [payment, setPayment] = useState<DueItem>();
  const [revision, setRevision] = useState(0);
  const { days, loading, error } = useMonthDues(month, revision);
  const options = useLineOptions(days);
  const policyId = params.get('policyId');
  const dues = days
    .flatMap((d) => d.dues)
    .filter((d) => matchesLine(d, line) && (policyId ? d.policyId === policyId : d.dueDate === day));
  return (
    <PageContainer>
      <div className="book-screen">
        <PageHeader
          title={t('book.dues_title')}
          subtitle={loading || error ? undefined : monthSummary(days, line, t('book.policies_tracked'))}
          actions={<Link className="book-import-link" to="/m/book/import">{t('book.import_title')}</Link>}
        />
        <MonthInput
          label={t('book.month')}
          value={month}
          onChange={(value) => {
            setMonth(value);
            setDay(`${value}-01`);
          }}
        />
        <CountChips ariaLabel={t('book.line')} options={options} selected={line} onChange={setLine} />
        <BookError error={error} />
        {loading && <LoadingSkeleton />}
        {!loading && !error && (
          <>
            <h2 className="due-heading">{monthHeading(month, lang)}</h2>
            <DueMonthGrid month={month} cells={buildCells(month, days, line)} selected={day} onPick={setDay} />
            <DayList dues={dues} day={day} canPay={can('book.write')} onPay={setPayment} />
          </>
        )}
        {payment && <MarkPaidSheet due={payment} onClose={() => setPayment(undefined)} onSaved={() => setRevision((r) => r + 1)} />}
      </div>
    </PageContainer>
  );
}
