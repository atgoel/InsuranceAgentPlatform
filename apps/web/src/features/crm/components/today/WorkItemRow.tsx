import { Button } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { MyWorkItem } from '../../api';

interface WorkItemRowProps {
  item: MyWorkItem;
  onOpen(item: MyWorkItem): void;
  onLog(item: MyWorkItem): void;
}

/**
 * One my-work item. Contacts are masked server-side, so Call and WhatsApp open the lead (where the seller calls from
 * the customer card) instead of dialling a number this screen does not have. Log is offered for lead subjects only.
 */
export function WorkItemRow({ item, onOpen, onLog }: WorkItemRowProps) {
  const { t, lang } = useT();
  const isLead = item.subject.type === 'LEAD';
  return (
    <li className="work-item" aria-label={item.title}>
      <div className="item-content">
        <div className="item-title">{item.title}</div>
        {item.dueAt && <div className="item-due">{new Date(item.dueAt).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>}
      </div>
      <div className="item-actions">
        {isLead && item.actions.includes('CALL') && <Button variant="secondary" onClick={() => onOpen(item)}>{t('today.call')}</Button>}
        {isLead && item.actions.includes('WHATSAPP') && <Button variant="secondary" onClick={() => onOpen(item)}>{t('today.whatsapp')}</Button>}
        {isLead && <Button variant="secondary" onClick={() => onLog(item)}>{t('today.log')}</Button>}
        {!isLead && item.actions.includes('OPEN') && <Button variant="secondary" onClick={() => onOpen(item)}>{t('today.open')}</Button>}
      </div>
    </li>
  );
}
