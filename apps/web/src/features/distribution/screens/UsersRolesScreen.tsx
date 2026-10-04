import { useEffect, useState, type ReactNode } from 'react';
import { useApi } from '../../../lib/api';
import {
  Button,
  ErrorState,
  LoadingSkeleton,
  PageContainer,
  PageHeader,
  PermissionDenied,
} from '../../../design-system';
import type { ApiError } from '../../../lib/api/api-error';
import { usePermissions } from '../../../lib/auth/me';
import { useT } from '../../../lib/i18n';
import type { MemberView } from '../api';
import { useMembers } from '../hooks/useMembers';
import { useOrgUnits } from '../hooks/useOrgUnits';
import { useRoles } from '../hooks/useRoles';
import { useUsersRolesActions } from '../hooks/useUsersRolesActions';
import {
  ALL,
  InviteMemberSheet,
  MemberFilters,
  MembersTable,
  ReasonDialog,
  RoleCards,
  RoleEditorPanel,
  UsersKpis,
} from '../components';
import '../styles/UsersRolesScreen.css';

function LoadError({ error, onRetry }: { error: ApiError; onRetry(): void }) {
  return error.status === 403 ? <PermissionDenied /> : <ErrorState error={error} onRetry={onRetry} />;
}

function RolesSection(props: { error?: ApiError; onRetry(): void; children: ReactNode }) {
  return props.error ? <LoadError error={props.error} onRetry={props.onRetry} /> : <>{props.children}</>;
}

function filterMembers(members: MemberView[], status: string, role: string): MemberView[] {
  return members.filter((m) => (status === ALL || m.status === status) && (role === ALL || m.roles.includes(role)));
}

export function UsersRolesScreen() {
  const api = useApi();
  const { t } = useT();
  const { can } = usePermissions();
  const membersHook = useMembers({ apiClient: api });
  const rolesHook = useRoles({ apiClient: api });
  const units = useOrgUnits(api);
  const actions = useUsersRolesActions(membersHook, rolesHook, t('distribution.users.action_failed'));
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [roleFilter, setRoleFilter] = useState(ALL);

  // Depend on the hooks' stable callbacks, not the hook objects (new every render, which would loop).
  const { loadMembers } = membersHook;
  const { loadRoles, loadRolePreview } = rolesHook;
  const editingRoleName = actions.editingRole?.role;

  useEffect(() => {
    loadMembers({ limit: 100 }).catch(() => undefined); // errors surface through hook state
    loadRoles().catch(() => undefined);
  }, [loadMembers, loadRoles]);

  useEffect(() => {
    if (editingRoleName) loadRolePreview(editingRoleName).catch(() => undefined); // the preview is optional
  }, [editingRoleName, loadRolePreview]);

  if (membersHook.loading || rolesHook.loading) return <LoadingSkeleton />;
  if (membersHook.error) return <LoadError error={membersHook.error} onRetry={() => void loadMembers({ limit: 100 })} />;

  const visible = filterMembers(membersHook.members, statusFilter, roleFilter);
  const canManage = can('distribution.member.write');
  const canInvite = canManage && !rolesHook.error;
  const action = actions.memberAction;

  return (
    <PageContainer>
      <PageHeader
        title={t('distribution.users.title')}
        subtitle={t('distribution.users.subtitle')}
        actions={
          canInvite ? (
            <Button onClick={actions.openInvite} variant="primary" size="md">
              {t('distribution.users.invite')}
            </Button>
          ) : undefined
        }
      />
      <UsersKpis members={membersHook.members} />
      <MemberFilters
        members={membersHook.members}
        status={statusFilter}
        role={roleFilter}
        onStatusChange={setStatusFilter}
        onRoleChange={setRoleFilter}
      />
      <MembersTable
        members={visible}
        roles={rolesHook.roles}
        canManage={canManage}
        onSuspend={(id) => actions.startAction(id, 'suspend')}
        onReactivate={(id) => actions.startAction(id, 'reactivate')}
      />
      <RolesSection error={rolesHook.error} onRetry={() => void loadRoles()}>
        <RoleCards
          roles={rolesHook.roles}
          selectedRole={editingRoleName}
          canEdit={can('distribution.role.write')}
          onEditRole={actions.startEditing}
        />
        {actions.editingRole && (
          <RoleEditorPanel
            role={actions.editingRole}
            preview={rolesHook.rolePreview}
            saving={actions.saving}
            error={actions.saveError}
            onSave={actions.saveRole}
            onCancel={actions.stopEditing}
          />
        )}
      </RolesSection>
      <p className="policy-note">{t('distribution.users.signin_policy')}</p>
      <p className="policy-note">{t('distribution.users.medical_note')}</p>
      <InviteMemberSheet
        isOpen={actions.inviteOpen}
        roles={rolesHook.roles}
        units={units}
        onClose={actions.closeInvite}
        onSubmit={actions.invite}
        isLoading={actions.inviting}
      />
      <ReasonDialog
        isOpen={action !== undefined}
        title={t(action?.action === 'reactivate' ? 'distribution.users.confirm_reactivate' : 'distribution.users.confirm_suspend')}
        reason={action?.reason ?? ''}
        onReasonChange={actions.setReason}
        onConfirm={actions.confirmAction}
        onCancel={actions.cancelAction}
        isLoading={actions.actioning}
        error={actions.actionError}
      />
    </PageContainer>
  );
}
