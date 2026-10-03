import { useState } from 'react';
import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { formatMoney } from '../../../lib/format';
import type { OptionInput } from '../api';
import { rupeesToPaise } from '../money';
import { FieldRow } from './FieldRow';
import { ProductSelect, type ProductChoice } from './ProductSelect';

interface Props {
  products: ProductChoice[];
  busy: boolean;
  onAdd(option: OptionInput): Promise<boolean>;
}

const FREQUENCIES = ['ANNUAL', 'HALF_YEARLY', 'QUARTERLY', 'MONTHLY', 'SINGLE'] as const;

interface Form {
  versionId: string;
  quoteRef: string;
  sumAssured: string;
  term: string;
  base: string;
  riders: string;
  tax: string;
  total: string;
  frequency: string;
  validUntil: string;
  coverage: string;
  exclusions: string;
}

const EMPTY: Form = { versionId: '', quoteRef: '', sumAssured: '', term: '', base: '', riders: '', tax: '', total: '', frequency: 'ANNUAL', validUntil: '', coverage: '', exclusions: '' };

function lines(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => l !== '');
}

function parseCoverage(text: string): Array<{ label: string; value: string }> {
  return lines(text).map((l) => {
    const i = l.indexOf(':');
    return i < 0 ? { label: l, value: '' } : { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() };
  });
}

/** base + riders + tax in paise, or undefined while base is blank. */
export function expectedTotal(form: Pick<Form, 'base' | 'riders' | 'tax'>): number | undefined {
  const base = rupeesToPaise(form.base);
  if (base === undefined) return undefined;
  return base + (rupeesToPaise(form.riders) ?? 0) + (rupeesToPaise(form.tax) ?? 0);
}

function toOption(form: Form): OptionInput | undefined {
  const sumAssuredPaise = rupeesToPaise(form.sumAssured);
  const basePaise = rupeesToPaise(form.base);
  const totalPaise = rupeesToPaise(form.total);
  if (!form.versionId || sumAssuredPaise === undefined || basePaise === undefined || totalPaise === undefined || !form.validUntil) return undefined;
  return {
    versionId: form.versionId,
    source: 'MANUAL_PORTAL',
    ...(form.quoteRef.trim() ? { insurerQuoteRef: form.quoteRef.trim() } : {}),
    sumAssuredPaise,
    ...(form.term.trim() ? { policyTermYears: Number(form.term) } : {}),
    premium: { basePaise, ridersPaise: rupeesToPaise(form.riders) ?? 0, taxPaise: rupeesToPaise(form.tax) ?? 0, totalPaise, frequency: form.frequency },
    coverage: parseCoverage(form.coverage),
    exclusions: lines(form.exclusions),
    waitingPeriods: [],
    assumptions: {},
    validUntil: form.validUntil,
  };
}

export function AddOptionForm({ products, busy, onAdd }: Props) {
  const { t } = useT();
  const [form, setForm] = useState<Form>(EMPTY);
  const set = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));
  const expected = expectedTotal(form);
  const total = rupeesToPaise(form.total);
  const mismatch = expected !== undefined && total !== undefined && expected !== total;
  const option = toOption(form);

  const text = (key: keyof Form, label: string, hint?: string) => (
    <FieldRow id={`opt-${key}`} label={label} hint={hint}>
      {(aria) => <input {...aria} type="text" value={form[key]} onChange={(e) => set(key)(e.target.value)} />}
    </FieldRow>
  );

  return (
    <form
      className="advice-form"
      aria-label={t('advice.quote.add_option')}
      onSubmit={async (e) => {
        e.preventDefault();
        if (option && !mismatch && (await onAdd(option))) setForm(EMPTY);
      }}
    >
      <h2>{t('advice.quote.add_option')}</h2>
      <ProductSelect id="opt-product" label={t('advice.quote.product')} products={products} value={form.versionId} onChange={set('versionId')} />
      {text('quoteRef', t('advice.quote.insurer_ref'))}
      {text('sumAssured', t('advice.quote.sum_assured'), t('advice.calc.rupees_hint'))}
      {text('term', t('advice.quote.term'))}
      {text('base', t('advice.quote.premium_base'))}
      {text('riders', t('advice.quote.premium_riders'))}
      {text('tax', t('advice.quote.premium_tax'))}
      {text('total', t('advice.quote.premium_total'))}
      {mismatch && (
        <p className="advice-error" role="alert">
          {t('advice.quote.mismatch', { expected: formatMoney(expected ?? 0) })}
        </p>
      )}
      <FieldRow id="opt-frequency" label={t('advice.quote.frequency')}>
        {(aria) => (
          <select {...aria} value={form.frequency} onChange={(e) => set('frequency')(e.target.value)}>
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {t(`advice.freq.${f}`)}
              </option>
            ))}
          </select>
        )}
      </FieldRow>
      <FieldRow id="opt-validUntil" label={t('advice.quote.valid_until')}>
        {(aria) => <input {...aria} type="date" value={form.validUntil} onChange={(e) => set('validUntil')(e.target.value)} />}
      </FieldRow>
      <FieldRow id="opt-coverage" label={t('advice.quote.coverage')} hint={t('advice.quote.coverage_hint')}>
        {(aria) => <textarea {...aria} value={form.coverage} onChange={(e) => set('coverage')(e.target.value)} />}
      </FieldRow>
      <FieldRow id="opt-exclusions" label={t('advice.quote.exclusions')} hint={t('advice.quote.lines_hint')}>
        {(aria) => <textarea {...aria} value={form.exclusions} onChange={(e) => set('exclusions')(e.target.value)} />}
      </FieldRow>
      <Button type="submit" disabled={!option || mismatch} loading={busy}>
        {t('advice.quote.add_option_submit')}
      </Button>
    </form>
  );
}
