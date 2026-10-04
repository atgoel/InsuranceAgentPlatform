import { StatusChip, formatIstDate } from '../../design-system';
import { useT } from '../../lib/i18n';
import type { DueItem } from './api';
import { Label } from './Label';
import { formatPaise } from './money';
import { statusTone } from './dueGrid';
import { SourceBanner } from './shared';

function DueMeta({ due }: { due: DueItem }) {
  const { t, lang } = useT();
  return (
    <>
      <p className="due-meta">
        {due.productName} · <Label kind="line" code={due.line} />
      </p>
      <p className="due-when">
        <StatusChip tone={statusTone(due.status)}>{t(`book.enum.${due.status}`)}</StatusChip>
        <span>
          {formatIstDate(due.dueDate, lang)}
          {due.graceEndsOn && ` · ${t('book.grace_end')} ${formatIstDate(due.graceEndsOn, lang)}`}
        </span>
      </p>
    </>
  );
}

export function DueCard({ due, canPay, onPay }: { due: DueItem; canPay: boolean; onPay(due: DueItem): void }) {
  const { t } = useT();
  return (
    <li className="due-card">
      <div className="due-card-head">
        <h3>{due.holderName}</h3>
        <strong>{formatPaise(due.amountPaise)}</strong>
      </div>
      <DueMeta due={due} />
      <SourceBanner source={due.source} asOf={due.asOf} confidence={due.confidence} />
      <div className="due-actions">
        {canPay && (
          <button type="button" onClick={() => onPay(due)}>
            {t('book.mark_paid')}
          </button>
        )}
        <button type="button" disabled title={t('book.reminder_later')}>
          {t('book.reminder')}
        </button>
      </div>
    </li>
  );
}
