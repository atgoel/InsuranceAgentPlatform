import { DataGrid, StatusChip, Button, EmptyState, type Column, type Tone } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { MemberStatus, MemberView, RoleDefinition } from '../api';
import { RoleChip, ScopeName } from './RoleLabels';

const STATUS_TONE: Record<MemberStatus, Tone> = {
  active: 'ok',
  invited: 'info',
  onboarding: 'info',
  suspended: 'warn',
  exited: 'neutral',
};

interface MembersTableProps {
  members: MemberView[];
  /** Used for the record-scope column; the column is left out when the roles are unavailable. */
  roles?: RoleDefinition[];
  /** Deactivate and Reactivate need distribution.member.write; without it the table is read-only. */
  canManage?: boolean;
  onSuspend: (memberId: string) => void;
  onReactivate: (memberId: string) => void;
}

function RolesCell({ member }: { member: MemberView }) {
  return (
    <div className="member-roles">
      {member.roles.map((role) => (
        <RoleChip key={role} role={role} />
      ))}
    </div>
  );
}

function ScopeCell({ member, roles }: { member: MemberView; roles: RoleDefinition[] }) {
  const definition = roles.find((r) => member.roles.includes(r.role));
  return definition ? <ScopeName scope={definition.recordScope} /> : null;
}

type Handlers = Pick<MembersTableProps, 'onSuspend' | 'onReactivate'>;

function ActionCell({ member, onSuspend, onReactivate }: Handlers & { member: MemberView }) {
  const { t } = useT();
  const name = member.displayName;
  if (member.status === 'active') {
    return (
      <Button
        size="md"
        variant="secondary"
        aria-label={t('distribution.users.deactivate_named', { name })}
        onClick={() => onSuspend(member.id)}
      >
        {t('distribution.users.deactivate')}
      </Button>
    );
  }
  if (member.status === 'suspended') {
    return (
      <Button
        size="md"
        variant="secondary"
        aria-label={t('distribution.users.reactivate_named', { name })}
        onClick={() => onReactivate(member.id)}
      >
        {t('distribution.users.reactivate')}
      </Button>
    );
  }
  return null;
}

export function MembersTable({ members, roles = [], canManage = true, onSuspend, onReactivate }: MembersTableProps) {
  const { t } = useT();
  const columns: Column<MemberView>[] = [
    {
      key: 'displayName',
      header: t('distribution.users.col_name'),
      render: (row) => (
        <div className="member-name">
          <strong>{row.displayName}</strong>
          <span className="member-contact">{row.phoneMasked ?? row.emailMasked ?? ''}</span>
        </div>
      ),
    },
    { key: 'roles', header: t('distribution.users.col_role'), render: (row) => <RolesCell member={row} /> },
  ];
  if (roles.length > 0) {
    columns.push({ key: 'scope', header: t('distribution.users.col_scope'), render: (row) => <ScopeCell member={row} roles={roles} /> });
  }
  columns.push(
    {
      key: 'mfaRequired',
      header: t('distribution.users.col_signin'),
      render: (row) => t(row.mfaRequired ? 'distribution.users.signin_mfa' : 'distribution.users.signin_otp'),
    },
    {
      key: 'status',
      header: t('distribution.users.col_status'),
      render: (row) => <StatusChip tone={STATUS_TONE[row.status]}>{t(`distribution.member_status.${row.status}`)}</StatusChip>,
    },
  );
  if (canManage) {
    columns.push({
      key: 'actions',
      header: t('distribution.users.col_action'),
      render: (row) => <ActionCell member={row} onSuspend={onSuspend} onReactivate={onReactivate} />,
    });
  }
  return (
    <div className="members-table-card">
      <DataGrid
        caption={t('distribution.users.table_caption')}
        empty={<EmptyState title={t('distribution.users.empty')} />}
        columns={columns}
        rows={members}
        rowKey={(row) => row.id}
      />
    </div>
  );
}
