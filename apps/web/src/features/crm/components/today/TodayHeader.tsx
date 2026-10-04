import { Link } from 'react-router-dom';
import { KpiRow, KpiTile, PageHeader, SearchField, formatIstDate } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { MyWorkCounts } from '../../offline/use-my-work';
import { greetingPeriod } from './today-greeting';

interface TodayHeaderProps {
  now: Date;
  name?: string;
  counts: MyWorkCounts;
  search: string;
  onSearch(value: string): void;
}

/** Date line, greeting with the seller's first name, KPI tiles, search and quick actions (wireframe `Main`). */
export function TodayHeader({ now, name, counts, search, onSearch }: TodayHeaderProps) {
  const { t, lang } = useT();
  const period = greetingPeriod(now);
  const title = name ? t(`today.greeting_${period}_named`, { name }) : t(`today.greeting_${period}`);
  return (
    <>
      <PageHeader title={title} subtitle={formatIstDate(now.toISOString(), lang)} />
      <KpiRow>
        <KpiTile label={t('today.overdue')} value={counts.overdue} tone={counts.overdue > 0 ? 'bad' : 'neutral'} />
        <KpiTile label={t('today.today')} value={counts.today} />
        <KpiTile label={t('today.hotLeads')} value={counts.hotLeads} tone={counts.hotLeads > 0 ? 'warn' : 'neutral'} />
      </KpiRow>
      <SearchField label={t('today.search_label')} placeholder={t('today.search_placeholder')} value={search} onChange={onSearch} />
      <nav className="quick-actions" aria-label={t('today.quick_actions')}>
        <Link className="quick-action" to="/m/leads?new=1">{t('today.qa_new_lead')}</Link>
        <Link className="quick-action" to="/m/calculators">{t('today.qa_needs')}</Link>
        <Link className="quick-action" to="/m/tasks">{t('today.qa_tasks')}</Link>
      </nav>
    </>
  );
}
