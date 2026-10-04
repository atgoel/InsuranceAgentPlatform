import { CountChips } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import type { MemberStatus, MemberView } from '../api';

export const ALL = 'all';

export interface MemberFiltersProps {
  members: MemberView[];
  status: string;
  role: string;
  onStatusChange(status: string): void;
  onRoleChange(role: string): void;
}

function RoleChipButton({ role, count, selected, onSelect }: { role: string; count: number; selected: boolean; onSelect(): void }) {
  const label = useLabel('role', role);
  return (
    <button type="button" className="count-chip" aria-pressed={selected} onClick={onSelect}>
      {label}
      <span className="count-chip-badge">{count}</span>
    </button>
  );
}

const STATUSES: MemberStatus[] = ['active', 'invited', 'onboarding', 'suspended'];

export function MemberFilters({ members, status, role, onStatusChange, onRoleChange }: MemberFiltersProps) {
  const { t } = useT();
  const roles = Array.from(new Set(members.flatMap((m) => m.roles)));
  const statusOptions = [
    { id: ALL, label: t('distribution.users.filter_all'), count: members.length },
    ...STATUSES.filter((s) => members.some((m) => m.status === s)).map((s) => ({
      id: s,
      label: t(`distribution.member_status.${s}`),
      count: members.filter((m) => m.status === s).length,
    })),
  ];
  return (
    <div className="filters-section">
      <CountChips options={statusOptions} selected={status} onChange={onStatusChange} ariaLabel={t('common.status')} />
      <div className="count-chips" role="group" aria-label={t('common.role')}>
        <button type="button" className="count-chip" aria-pressed={role === ALL} onClick={() => onRoleChange(ALL)}>
          {t('distribution.users.filter_all_roles')}
        </button>
        {roles.map((r) => (
          <RoleChipButton
            key={r}
            role={r}
            count={members.filter((m) => m.roles.includes(r)).length}
            selected={role === r}
            onSelect={() => onRoleChange(r)}
          />
        ))}
      </div>
    </div>
  );
}
