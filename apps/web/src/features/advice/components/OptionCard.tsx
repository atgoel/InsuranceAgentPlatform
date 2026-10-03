import type { ComponentProps } from 'react';
import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { formatDate } from '../../../lib/format';
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
  const { t } = useT();
  const blockedByBi = option.bi.required && !option.bi.acknowledged;
  return (
    <article className="advice-card" aria-label={option.productName}>
      <h3>
        {option.productName} ({option.insurerName})
      </h3>
      {selected && <p role="status">{t('advice.quote.selected')}</p>}
      {option.expired && <p className="advice-error">{t('advice.quote.expired', { date: formatDate(new Date(option.validUntil)) })}</p>}
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
