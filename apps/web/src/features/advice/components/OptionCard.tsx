import type { ComponentProps } from 'react';
import { Button, StatusChip, formatIstDate } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import type { QuoteOption } from '../api';
import { BiPanel } from './BiPanel';

interface Props {
  option: QuoteOption;
  selected: boolean;
  busy: boolean;
  onSelect(optionId: string): void;
  onRemove(optionId: string): void;
  onAttach: ComponentProps<typeof BiPanel>['onAttach'];
  onAcknowledge: ComponentProps<typeof BiPanel>['onAcknowledge'];
}

export function OptionCard({ option, selected, busy, onSelect, onRemove, onAttach, onAcknowledge }: Props) {
  const { t, lang } = useT();
  const category = useLabel('productCategory', option.category);
  const blockedByBi = option.bi.required && !option.bi.acknowledged;
  return (
    <article className="advice-card" aria-label={option.productName}>
      <h3>
        {option.productName} ({option.insurerName})
      </h3>
      <p className="advice-row">
        <StatusChip tone="neutral">{category}</StatusChip>
        <span className="advice-hint">{t('advice.quote.valid_on', { date: formatIstDate(option.validUntil, lang) })}</span>
      </p>
      {selected && <p role="status">{t('advice.quote.selected')}</p>}
      {option.expired && <p className="advice-error">{t('advice.quote.expired', { date: formatIstDate(option.validUntil, lang) })}</p>}
      <div className="advice-row">
        <Button disabled={blockedByBi || selected} loading={busy} onClick={() => onSelect(option.id)} aria-label={t('advice.quote.select_option', { product: option.productName })}>
          {t('advice.quote.select')}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => onRemove(option.id)} aria-label={t('advice.quote.remove_option', { product: option.productName })}>
          {t('advice.quote.remove')}
        </Button>
      </div>
      <BiPanel option={option} busy={busy} onAttach={onAttach} onAcknowledge={onAcknowledge} />
    </article>
  );
}
