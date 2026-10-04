import { useCallback, useState } from 'react';
import { ApiError } from '../../../lib/api/api-error';
import type { useMembers } from './useMembers';
import type { useRoles } from './useRoles';
import type { InviteInput } from '../components/InviteMemberSheet';
import type { RoleDefinition } from '../api';

export interface MemberActionState {
  memberId: string;
  action: 'suspend' | 'reactivate';
  reason: string;
}

function problemOf(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.title : fallback;
}

/**
 * Invite, deactivate/reactivate and role-edit interactions of the users and roles screen.
 * A failed action keeps its sheet open and reports inline; it never replaces the screen.
 */
export function useUsersRolesActions(membersHook: ReturnType<typeof useMembers>, rolesHook: ReturnType<typeof useRoles>, fallback: string) {
  const { inviteMember, transitionMemberStatus } = membersHook;
  const { updateRolePermissions } = rolesHook;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [memberAction, setMemberAction] = useState<MemberActionState | undefined>();
  const [actioning, setActioning] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>();
  const [editingRole, setEditingRole] = useState<RoleDefinition | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  const closeInvite = useCallback(() => setInviteOpen(false), []);
  const cancelAction = useCallback(() => {
    setMemberAction(undefined);
    setActionError(undefined);
  }, []);
  const stopEditing = useCallback(() => {
    setEditingRole(undefined);
    setSaveError(undefined);
  }, []);

  const invite = async (input: InviteInput) => {
    setInviting(true);
    try {
      await inviteMember(input);
      setInviteOpen(false);
    } finally {
      setInviting(false);
    }
  };

  const confirmAction = async () => {
    if (!memberAction) return;
    setActioning(true);
    setActionError(undefined);
    try {
      await transitionMemberStatus(memberAction.memberId, memberAction.action === 'suspend' ? 'suspended' : 'active', memberAction.reason);
      setMemberAction(undefined);
    } catch (err) {
      setActionError(problemOf(err, fallback));
    } finally {
      setActioning(false);
    }
  };

  const saveRole = async (permissions: string[], etag: string) => {
    if (!editingRole) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await updateRolePermissions(editingRole.role, permissions, etag);
      setEditingRole(undefined);
    } catch (err) {
      setSaveError(problemOf(err, fallback));
    } finally {
      setSaving(false);
    }
  };

  return {
    inviteOpen,
    inviting,
    memberAction,
    actioning,
    actionError,
    editingRole,
    saving,
    saveError,
    openInvite: () => setInviteOpen(true),
    closeInvite,
    startAction: (memberId: string, action: MemberActionState['action']) => setMemberAction({ memberId, action, reason: '' }),
    setReason: (reason: string) => setMemberAction((prev) => (prev ? { ...prev, reason } : prev)),
    cancelAction,
    confirmAction,
    invite,
    startEditing: (role: RoleDefinition) => {
      setSaveError(undefined);
      setEditingRole(role);
    },
    stopEditing,
    saveRole,
  };
}
