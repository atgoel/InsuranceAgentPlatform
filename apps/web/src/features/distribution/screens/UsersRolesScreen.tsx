import { useState, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import { LoadingSkeleton, ErrorState, FilterChips, Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useMembers } from '../hooks/useMembers';
import { useRoles } from '../hooks/useRoles';
import {
  MembersTable,
  InviteMemberSheet,
  ReasonDialog,
  RoleCards,
  RolePermissionEditor,
  RolePreviewPanel,
} from '../components';
import '../styles/UsersRolesScreen.css';

interface MemberActionState {
  memberId: string;
  action: 'suspend' | 'reactivate';
  reason: string;
}

export function UsersRolesScreen() {
  const api = useApi();
  const { t } = useT();
  const membersHook = useMembers({ apiClient: api });
  const rolesHook = useRoles({ apiClient: api });

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showMemberAction, setShowMemberAction] = useState(false);
  const [memberAction, setMemberAction] = useState<MemberActionState | undefined>();
  const [editingRole, setEditingRole] = useState<typeof rolesHook.roles[0] | undefined>();
  const [actioning, setActioning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Load data on mount
  useEffect(() => {
    membersHook.loadMembers({ limit: 1000 }).catch(() => {
      // Error handled in hook state
    });
    rolesHook.loadRoles().catch(() => {
      // Error handled in hook state
    });
  }, [membersHook, rolesHook]);

  // Load role preview when editing
  useEffect(() => {
    if (editingRole) {
      rolesHook.loadRolePreview(editingRole.role).catch(() => {
        // Preview is optional
      });
    }
  }, [editingRole, rolesHook]);

  const filteredMembers = membersHook.members.filter((m) => {
    if (statusFilters.length > 0 && !statusFilters.includes(m.status)) return false;
    if (roleFilters.length > 0 && !m.roles.some((r) => roleFilters.includes(r))) return false;
    return true;
  });

  const uniqueRoles = Array.from(new Set(membersHook.members.flatMap((m) => m.roles)));
  const uniqueStatuses = Array.from(new Set(membersHook.members.map((m) => m.status)));

  const statusFilterOptions = uniqueStatuses.map((s) => ({ id: s, label: s }));
  const roleFilterOptions = uniqueRoles.map((r) => ({ id: r, label: r }));

  const handleInvite = async (input: Parameters<typeof membersHook.inviteMember>[0]) => {
    try {
      setInviting(true);
      await membersHook.inviteMember(input);
      setShowInviteForm(false);
    } finally {
      setInviting(false);
    }
  };

  const handleMemberAction = async () => {
    if (!memberAction) return;

    try {
      setActioning(true);
      await membersHook.transitionMemberStatus(
        memberAction.memberId,
        memberAction.action === 'suspend' ? 'suspended' : 'active',
        memberAction.reason
      );
      setShowMemberAction(false);
      setMemberAction(undefined);
    } finally {
      setActioning(false);
    }
  };

  const handleSaveRole = async (permissions: string[], etag: string) => {
    if (!editingRole) return;

    try {
      setSaving(true);
      await rolesHook.updateRolePermissions(editingRole.role, permissions, etag);
      setEditingRole(undefined);
    } finally {
      setSaving(false);
    }
  };

  if (membersHook.loading || rolesHook.loading) {
    return <LoadingSkeleton />;
  }

  if (membersHook.error) {
    return <ErrorState error={membersHook.error} />;
  }

  if (rolesHook.error) {
    return <ErrorState error={rolesHook.error} />;
  }

  return (
    <div className="users-roles-screen">
      <div className="page-header">
        <h1>{t('distribution.users.title')}</h1>
        <Button onClick={() => setShowInviteForm(true)} variant="primary" size="md">
          {t('distribution.users.invite')}
        </Button>
      </div>

      {/* KPI Tiles */}
      <div className="kpi-tiles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--spacing-2)' }}>
        <div style={{ padding: 'var(--spacing-2)', border: '1px solid var(--color-line)', borderRadius: '8px' }}>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' }}>
            {filteredMembers.length}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-caption)' }}>
            {t('distribution.users.total_users')}
          </div>
        </div>
        <div style={{ padding: 'var(--spacing-2)', border: '1px solid var(--color-line)', borderRadius: '8px' }}>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)' }}>
            {filteredMembers.filter((m) => m.mfaRequired).length}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-caption)' }}>
            {t('distribution.users.mfa_enabled')}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label>{t('common.status')}</label>
          <FilterChips
            options={statusFilterOptions}
            selected={statusFilters}
            onChange={setStatusFilters}
            multi={true}
          />
        </div>
        <div className="filter-group">
          <label>{t('common.role')}</label>
          <FilterChips
            options={roleFilterOptions}
            selected={roleFilters}
            onChange={setRoleFilters}
            multi={true}
          />
        </div>
      </div>

      {/* Members Table */}
      <MembersTable
        members={filteredMembers}
        onSuspend={(memberId) => {
          setMemberAction({ memberId, action: 'suspend', reason: '' });
          setShowMemberAction(true);
        }}
        onReactivate={(memberId) => {
          setMemberAction({ memberId, action: 'reactivate', reason: '' });
          setShowMemberAction(true);
        }}
      />

      {/* Roles Section */}
      <RoleCards roles={rolesHook.roles} onEditRole={setEditingRole} />

      {/* Invite Member Modal */}
      <InviteMemberSheet
        isOpen={showInviteForm}
        roles={rolesHook.roles}
        onClose={() => setShowInviteForm(false)}
        onSubmit={handleInvite}
        isLoading={inviting}
      />

      {/* Member Action Modal */}
      <ReasonDialog
        isOpen={showMemberAction}
        title={
          memberAction?.action === 'suspend'
            ? t('distribution.users.confirm_suspend')
            : t('distribution.users.confirm_reactivate')
        }
        reason={memberAction?.reason ?? ''}
        onReasonChange={(reason) =>
          setMemberAction((prev) => (prev ? { ...prev, reason } : prev))
        }
        onConfirm={handleMemberAction}
        onCancel={() => {
          setShowMemberAction(false);
          setMemberAction(undefined);
        }}
        isLoading={actioning}
      />

      {/* Role Editor Modal */}
      {editingRole && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', width: '100%', maxHeight: '80vh', overflowY: 'auto', padding: 'var(--spacing-3)', borderRadius: '8px 8px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-2)' }}>
              <h2 style={{ margin: 0 }}>{editingRole.role}</h2>
              <button onClick={() => setEditingRole(undefined)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>
                ×
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-3)' }}>
              <RolePermissionEditor
                role={editingRole}
                onSave={handleSaveRole}
                onCancel={() => setEditingRole(undefined)}
                isSaving={saving}
              />
              <RolePreviewPanel preview={rolesHook.rolePreview} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
