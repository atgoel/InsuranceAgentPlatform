import { Link } from 'react-router-dom';
import { Button, KpiRow, KpiTile } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { formatMoney } from '../../../lib/format';
import type { CalcOutput, CalculatorId } from '../api';
import { NEXT_STEP } from '../calculators';

interface Props {
  calculator: CalculatorId;
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

export function CalculatorResult({ calculator, output, canSave, saved, saving, onSave }: Props) {
  const { t } = useT();
  const next = NEXT_STEP[calculator];
  return (
    <section className="advice-card" aria-label={t('advice.calc.result')}>
      <h2>{t('advice.calc.result')}</h2>
      <KpiRow>
        {Object.entries(output.result).map(([key, value]) => (
          <KpiTile key={key} label={t(`advice.calc.result.${key}`)} value={formatValue(key, value, t)} />
        ))}
      </KpiRow>
      <h3>{t('advice.calc.workings')}</h3>
      <ul className="advice-workings">
        {output.workings.map((w) => (
          <li key={w.label}>
            {w.label}: {w.value}
          </li>
        ))}
      </ul>
      <p className="advice-hint">{t('advice.calc.assumptions', { version: output.assumptionsVersion })}</p>
      <p className="advice-hint">{t('advice.calc.educational')}</p>
      <div className="advice-row">
        {canSave && !saved && (
          <Button variant="secondary" loading={saving} onClick={onSave}>
            {t('advice.calc.save')}
          </Button>
        )}
        {next && (
          <Link className="advice-link" to={next}>
            {t(`advice.calc.next.${calculator}`)}
          </Link>
        )}
      </div>
      {saved && <p role="status">{t('advice.calc.saved')}</p>}
    </section>
  );
}
