import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { formatMoney } from '../../../lib/format';
import type { CalcOutput } from '../api';

interface Props {
  output: CalcOutput;
  canSave: boolean;
  saved: boolean;
  saving: boolean;
  onSave(): void;
}

function formatValue(key: string, value: unknown, t: (k: string) => string): string {
  if (typeof value === 'number' && key.endsWith('Paise')) return formatMoney(value);
  if (key === 'recommendation') return t(`advice.calc.rec.${String(value)}`);
  return String(value);
}

export function CalculatorResult({ output, canSave, saved, saving, onSave }: Props) {
  const { t } = useT();
  return (
    <section className="advice-card" aria-label={t('advice.calc.result')}>
      <h2>{t('advice.calc.result')}</h2>
      <dl className="advice-result">
        {Object.entries(output.result).map(([key, value]) => (
          <div key={key}>
            <dt>{t(`advice.calc.result.${key}`)}</dt>
            <dd>{formatValue(key, value, t)}</dd>
          </div>
        ))}
      </dl>
      <h3>{t('advice.calc.workings')}</h3>
      <ul className="advice-workings">
        {output.workings.map((w) => (
          <li key={w.label}>
            {w.label}: {w.value}
          </li>
        ))}
      </ul>
      <p className="advice-hint">{t('advice.calc.assumptions', { version: output.assumptionsVersion })}</p>
      {canSave && !saved && (
        <Button variant="secondary" loading={saving} onClick={onSave}>
          {t('advice.calc.save')}
        </Button>
      )}
      {saved && <p role="status">{t('advice.calc.saved')}</p>}
    </section>
  );
}
