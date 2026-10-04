import { Button } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { MyWorkItem } from '../../api';
import { enumLabel } from '../../../book/display';
import { LabelText } from '../LabelText';
import { formatDueWhen } from '../format-due';

interface WorkItemRowProps {
  item: MyWorkItem;
  onOpen(item: MyWorkItem): void;
  onLog(item: MyWorkItem): void;
}

const SERVICING_PREFIX = /^Servicing — /;

function isDateOnly(item: MyWorkItem): boolean {
  return item.kind === 'DUE' || item.subject.type === 'SERVICING_REQUEST';
}

function ItemTitle({ item }: { item: MyWorkItem }) {
  const { t } = useT();
  if (item.subject.type !== 'SERVICING_REQUEST') return <>{item.title}</>;
  const code = item.title.replace(SERVICING_PREFIX, '');
  return (
    <>
      {t('book.servicing_title')} · <LabelText kind="servicingType" code={code} />
    </>
  );
}

function ItemActions({ item, onOpen, onLog }: WorkItemRowProps) {
  const { t } = useT();
  const has = (action: MyWorkItem['actions'][number]) => item.actions.includes(action);
  if (item.subject.type === 'LEAD') {
    return (
      <>
        {has('CALL') && <Button variant="secondary" onClick={() => onOpen(item)}>{t('today.call')}</Button>}
        {has('WHATSAPP') && <Button variant="secondary" onClick={() => onOpen(item)}>{t('today.whatsapp')}</Button>}
        <Button variant="secondary" onClick={() => onLog(item)}>{t('today.log')}</Button>
      </>
    );
  }
  return (
    <>
      {has('CALL') && <Button variant="secondary" onClick={() => onOpen(item)}>{t('today.call')}</Button>}
      {has('WHATSAPP') && <Button variant="secondary" onClick={() => onOpen(item)}>{t('today.whatsapp')}</Button>}
      {has('OPEN') && <Button variant="secondary" onClick={() => onOpen(item)}>{t('today.open')}</Button>}
    </>
  );
}

/**
 * One my-work item. Contacts are masked server-side, so Call and WhatsApp open the record (where the seller calls from
 * the customer card) instead of dialling a number this screen does not have. Log is offered for lead subjects only.
 */
export function WorkItemRow({ item, onOpen, onLog }: WorkItemRowProps) {
  const { t, lang } = useT();
  const label = item.subject.type === 'SERVICING_REQUEST' ? t('book.servicing_title') : item.title;
  return (
    <li className="work-item" aria-label={label}>
      <div className="item-content">
        <div className="item-title">
          <ItemTitle item={item} />
        </div>
        {item.kind === 'DUE' && item.subtitle && <p className="item-sub">{enumLabel(item.subtitle, t)}</p>}
        {item.dueAt && <div className="item-due">{formatDueWhen(item.dueAt, lang, isDateOnly(item))}</div>}
      </div>
      <div className="item-actions">
        <ItemActions item={item} onOpen={onOpen} onLog={onLog} />
      </div>
    </li>
  );
}
