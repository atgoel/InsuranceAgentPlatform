import { Card, StatusChip, Button } from '../../../design-system';
import { ChecklistItem, MemberDetail, ChecklistItemKey } from '../api';

interface ChecklistPanelProps {
  member: MemberDetail;
  isChecklistComplete: boolean;
  activatingMemberId: string | undefined;
  activationError: string | undefined;
  missingItems: ChecklistItemKey[];
  onActivate: () => Promise<void>;
}

function ChecklistSection({
  checklist,
}: {
  checklist?: ChecklistItem[];
}) {
  if (!checklist || checklist.length === 0) {
    return (
      <div className="checklist-section">
        <h3>Checklist</h3>
        <div className="no-items">No items</div>
      </div>
    );
  }

  return (
    <div className="checklist-section">
      <h3>Checklist</h3>
      <div className="checklist-items">
        {checklist.map((item) => (
          <div key={item.key} className={`checklist-item ${item.done ? 'done' : ''}`}>
            <div className="item-checkbox">
              <input type="checkbox" checked={item.done} disabled readOnly aria-label={item.key} />
            </div>
            <div className="item-content">
              <div className="item-key">{item.key}</div>
              {item.key === 'TRAINING' && item.hoursLogged !== undefined && item.hoursRequired && (
                <div className="item-detail">
                  {item.hoursLogged}/{item.hoursRequired} hours
                </div>
              )}
              {item.note && <div className="item-note">{item.note}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChecklistPanel({
  member,
  isChecklistComplete,
  activatingMemberId,
  activationError,
  missingItems,
  onActivate,
}: ChecklistPanelProps) {
  return (
    <Card>
      <div className="member-header">
        <h2>{member.displayName}</h2>
        <StatusChip tone={member.status === 'active' ? 'ok' : 'info'}>
          {member.status}
        </StatusChip>
      </div>

      <div className="member-contact">
        {member.phoneMasked && <div>{member.phoneMasked}</div>}
        {member.emailMasked && <div>{member.emailMasked}</div>}
      </div>

      {member.checklist && (
        <>
          <ChecklistSection checklist={member.checklist} />

          {activationError && (
            <div className="error-message">
              {activationError}
              {missingItems.length > 0 && (
                <ul className="missing-items">
                  {missingItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="button-group">
            <Button
              onClick={onActivate}
              disabled={activatingMemberId === member.id || !isChecklistComplete}
              variant="primary"
              size="md"
            >
              {activatingMemberId === member.id ? 'Loading...' : 'Activate'}
            </Button>
            {!isChecklistComplete && (
              <span className="help-text">
                Complete checklist first
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
