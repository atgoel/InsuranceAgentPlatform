import { formatIstDate } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { formatMoney } from '../../../lib/format';
import type { QuoteView } from '../api';

const PAISE_ROWS = new Set(['premium_total', 'sum_assured']);

function cell(key: string, value: string | number | null, t: (k: string) => string, lang: 'en' | 'hi'): string {
  if (value === null) return t('advice.quote.not_available');
  if (typeof value === 'number' && PAISE_ROWS.has(key)) return formatMoney(value);
  if (key === 'valid_until' && typeof value === 'string') return formatIstDate(value, lang);
  if (key === 'premium_frequency') return t(`advice.freq.${value}`);
  return String(value);
}

export function ComparisonGrid({ quote }: { quote: QuoteView }) {
  const { t, lang } = useT();
  if (quote.options.length === 0) return <p>{t('advice.quote.no_options')}</p>;
  return (
    <div className="advice-grid-wrap">
      <table className="advice-grid" aria-label={t('advice.quote.comparison')}>
        <thead>
          <tr>
            <th scope="col">{t('advice.quote.comparison')}</th>
            {quote.options.map((o) => (
              <th key={o.id} scope="col">
                {o.productName} ({o.insurerName})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {quote.comparison.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {row.values.map((v, i) => (
                <td key={quote.options[i]?.id ?? i}>{cell(row.key, v, t, lang)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
