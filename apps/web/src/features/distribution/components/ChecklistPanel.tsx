import { Card, StatusChip, Button, formatIstDate } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ChecklistItem, ChecklistItemKey, MemberDetail } from '../api';

interface ChecklistPanelProps {
  member: MemberDetail;
  isChecklistComplete: boolean;
  activatingMemberId: string | undefined;
  activationError: string | undefined;
  missingItems: ChecklistItemKey[];
  onActivate: () => Promise<void>;
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const { t, lang } = useT();
  const label = t(`distribution.checklist.${item.key}`);
  return (
    <div className={`checklist-item ${item.done ? 'done' : ''}`}>
      <div className="item-checkbox">
        <input type="checkbox" checked={item.done} disabled readOnly aria-label={label} />
      </div>
      <div className="item-content">
        <div className="item-key">{label}</div>
        {item.key === 'TRAINING' && item.hoursLogged !== undefined && item.hoursRequired && (
          <div className="item-detail">{t('distribution.checklist.hours', { logged: item.hoursLogged, required: item.hoursRequired })}</div>
        )}
        {item.done && item.completedAt && (
          <div className="item-detail">{t('distribution.checklist.completed', { date: formatIstDate(item.completedAt, lang) })}</div>
        )}
        {item.note && <div className="item-note">{item.note}</div>}
      </div>
    </div>
  );
}

function ChecklistSection({ checklist }: { checklist?: ChecklistItem[] }) {
  const { t } = useT();
  return (
    <div className="checklist-section">
      <h3>{t('distribution.checklist.title')}</h3>
      {!checklist || checklist.length === 0 ? (
        <div className="no-items">{t('distribution.checklist.none')}</div>
      ) : (
        <div className="checklist-items">
          {checklist.map((item) => (
            <ChecklistRow key={item.key} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ChecklistPanel({ member, isChecklistComplete, activatingMemberId, activationError, missingItems, onActivate }: ChecklistPanelProps) {
  const { t } = useT();
  const activating = activatingMemberId === member.id;
  return (
    <Card>
      <div className="member-header">
        <h2>{member.displayName}</h2>
        <StatusChip tone={member.status === 'active' ? 'ok' : 'info'}>{t(`distribution.member_status.${member.status}`)}</StatusChip>
      </div>
      <div className="member-contact">
        {member.phoneMasked && <div>{member.phoneMasked}</div>}
        {member.emailMasked && <div>{member.emailMasked}</div>}
      </div>
      {member.checklist && (
        <>
          <ChecklistSection checklist={member.checklist} />
          {activationError && (
            <div className="error-message" role="alert">
              {activationError}
              {missingItems.length > 0 && (
                <ul className="missing-items">
                  {missingItems.map((item) => (
                    <li key={item}>{t(`distribution.checklist.${item}`)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {member.status !== 'active' && (
            <div className="button-group">
              <Button onClick={onActivate} disabled={activating || !isChecklistComplete} variant="primary" size="md">
                {activating
                  ? t('distribution.reason.working')
                  : t(isChecklistComplete ? 'distribution.checklist.activate' : 'distribution.checklist.activate_incomplete', {
                      name: member.displayName,
                    })}
              </Button>
              {!isChecklistComplete && <span className="help-text">{t('distribution.checklist.complete_first')}</span>}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
