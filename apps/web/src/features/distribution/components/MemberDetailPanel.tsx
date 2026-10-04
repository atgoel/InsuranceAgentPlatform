import { useT } from '../../../lib/i18n';
import type { ChecklistItemKey, MemberDetail, MemberView } from '../api';
import { ChecklistPanel } from './ChecklistPanel';
import { ExitPanel } from './ExitPanel';

export interface MemberDetailPanelProps {
  member?: MemberDetail;
  error?: string;
  activatingMemberId?: string;
  activationError?: string;
  missingItems: ChecklistItemKey[];
  canExit: boolean;
  exitTargets: MemberView[];
  onActivate(): Promise<void>;
  onExit(memberId: string, transferToMemberId: string | undefined, reason: string): Promise<void>;
}

/** The selected candidate: evidence checklist with Activate, and the exit panel for an active member. */
export function MemberDetailPanel(props: MemberDetailPanelProps) {
  const { t } = useT();
  const { member } = props;
  if (!member) {
    return (
      <div className="member-detail-empty">
        {props.error && (
          <p role="alert" className="error-message">
            {props.error}
          </p>
        )}
        {t('distribution.onboarding.select_member')}
      </div>
    );
  }
  const isChecklistComplete = !member.checklist || member.checklist.every((item) => item.done);
  return (
    <div className="member-detail-stack">
      {props.error && (
        <p role="alert" className="error-message">
          {props.error}
        </p>
      )}
      <ChecklistPanel
        member={member}
        isChecklistComplete={isChecklistComplete}
        activatingMemberId={props.activatingMemberId}
        activationError={props.activationError}
        missingItems={props.missingItems}
        onActivate={props.onActivate}
      />
      {member.status === 'active' && props.canExit && (
        <ExitPanel
          key={member.id}
          member={member}
          targets={props.exitTargets.filter((m) => m.id !== member.id)}
          onExit={(target, reason) => props.onExit(member.id, target, reason)}
        />
      )}
    </div>
  );
}
