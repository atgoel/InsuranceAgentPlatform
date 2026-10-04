import { EmptyState } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { MemberStatus, MemberView } from '../api';

/** Candidates are grouped by member status: the list endpoint carries no checklist stage (M02 section 6). */
const COLUMNS: MemberStatus[] = ['invited', 'onboarding', 'active'];

export interface OnboardingPipelineProps {
  members: MemberView[];
  selectedId?: string;
  onSelect(memberId: string): void;
}

function Candidate({ member, selected, onSelect }: { member: MemberView; selected: boolean; onSelect(): void }) {
  const { t } = useT();
  const meta = [member.salespersonType ? t(`distribution.sp_type.${member.salespersonType}`) : '', member.orgUnitName ?? ''].filter(Boolean);
  return (
    <button type="button" className="candidate-card" aria-pressed={selected} onClick={onSelect}>
      <strong>{member.displayName}</strong>
      <span className="candidate-meta">{meta.join(' · ')}</span>
    </button>
  );
}

export function OnboardingPipeline({ members, selectedId, onSelect }: OnboardingPipelineProps) {
  const { t } = useT();
  const candidates = members.filter((m) => COLUMNS.includes(m.status));
  if (candidates.length === 0) return <EmptyState title={t('distribution.onboarding.pipeline_empty')} />;
  return (
    <div className="pipeline-columns">
      {COLUMNS.map((status) => {
        const inColumn = candidates.filter((m) => m.status === status);
        return (
          <section key={status} className="pipeline-column" aria-label={t(`distribution.member_status.${status}`)}>
            <h3>
              {t(`distribution.member_status.${status}`)} <span className="pipeline-count">{inColumn.length}</span>
            </h3>
            {inColumn.map((member) => (
              <Candidate key={member.id} member={member} selected={member.id === selectedId} onSelect={() => onSelect(member.id)} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
