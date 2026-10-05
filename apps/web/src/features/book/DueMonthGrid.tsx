import { useT } from '../../lib/i18n';
import { formatIstDate } from '../../design-system';
import { leadingBlanks, weekdayHeadings, type DayCell } from './dueGrid';
import { compactPaise, formatPaise } from './money';
import './dueCalendar.css';

function cellName(cell: DayCell, lang: 'en' | 'hi', dueCount: string): string {
  const date = formatIstDate(cell.date, lang);
  return cell.count === 0 ? date : `${date}, ${dueCount}, ${formatPaise(cell.totalPaise)}`;
}

function DayButton({ cell, selected, onPick }: { cell: DayCell; selected: boolean; onPick(date: string): void }) {
  const { t, lang } = useT();
  return (
    <button
      type="button"
      className="due-day"
      data-tone={cell.tone ?? 'none'}
      aria-pressed={selected}
      aria-label={cellName(cell, lang, t('book.dues_count', { count: cell.count }))}
      onClick={() => onPick(cell.date)}
    >
      <span className="due-day-number">{cell.dayOfMonth}</span>
      <span className="due-day-dot" aria-hidden="true" />
      <span className="due-day-amount" aria-hidden="true">
        {cell.count > 0 ? compactPaise(cell.totalPaise) : ''}
      </span>
    </button>
  );
}

function Legend() {
  const { t } = useT();
  const items: Array<[string, string]> = [
    ['bad', t('book.legend_lapsed')],
    ['warn', t('book.legend_grace')],
    ['neutral', t('book.legend_due')],
    ['ok', t('book.legend_paid')],
  ];
  return (
    <ul className="due-legend" aria-label={t('book.legend')}>
      {items.map(([tone, label]) => (
        <li key={tone}>
          <span className="due-legend-dot" data-tone={tone} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

export function DueMonthGrid({
  month,
  cells,
  selected,
  onPick,
}: {
  month: string;
  cells: DayCell[];
  selected: string;
  onPick(date: string): void;
}) {
  const { t, lang } = useT();
  const blanks = Array.from({ length: leadingBlanks(month) }, (_, i) => i);
  return (
    <section className="due-month" aria-label={t('book.calendar_days')}>
      <div className="due-weekdays" aria-hidden="true">
        {weekdayHeadings(lang).map((label, i) => (
          <span key={`${label}${i}`}>{label}</span>
        ))}
      </div>
      <div className="due-grid" role="group" aria-label={t('book.calendar_days')}>
        {blanks.map((i) => (
          <span key={`blank-${i}`} className="due-blank" />
        ))}
        {cells.map((cell) => (
          <DayButton key={cell.date} cell={cell} selected={cell.date === selected} onPick={onPick} />
        ))}
      </div>
      <Legend />
    </section>
  );
}
