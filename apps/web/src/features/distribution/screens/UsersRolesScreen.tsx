import { useState, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import {
  Button,
  Card,
  StatusChip,
  LoadingSkeleton,
  ErrorState,
  DataGrid,
  FilterChips,
  BottomSheet,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import {
  createDistributionApi,
  MemberView,
  RoleDefinition,
  RolePreview,
} from '../api';
import '../styles/UsersRolesScreen.css';

interface InviteFormState {
  displayName: string;
  phone: string;
  email: string;
  roles: string[];
  orgUnitId: string;
  errors: Record<string, string>;
}

interface MemberActionState {
  memberId: string;
  action: 'suspend' | 'reactivate';
  reason: string;
}

const LOCKED_PERMISSIONS = ['party.medical.read', 'audit.delete', 'ops.*'];

function PermissionEditor({
  role,
  onSave,
  onCancel,
  t,
}: {
  role: RoleDefinition;
  onSave: (permissions: string[], etag: string) => Promise<void>;
  onCancel: () => void;
  t: ReturnType<typeof useT>['t'];
}) {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(role.permissions)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const allPermissions = [
    'distribution.org.write',
    'distribution.member.read',
    'distribution.member.write',
    'distribution.onboarding.write',
    'distribution.onboarding.approve',
    'distribution.licence.write',
    'distribution.licence.read',
    'distribution.role.read',
    'distribution.role.write',
    'distribution.transfer.write',
    'distribution.self.read',
  ];

  const handlePermissionChange = (permission: string) => {
    if (LOCKED_PERMISSIONS.includes(permission)) return;

    const newPermissions = new Set(selectedPermissions);
    if (newPermissions.has(permission)) {
      newPermissions.delete(permission);
    } else {
      newPermissions.add(permission);
    }
    setSelectedPermissions(newPermissions);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(undefined);
      await onSave(Array.from(selectedPermissions), role.etag);
    } catch (err) {
      if (err instanceof ApiError && err.status === 412) {
        setError(t('distribution.roles.stale_etag'));
      } else {
        setError(err instanceof ApiError ? err.title : 'Failed to save permissions');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="permission-editor">
      <h3>{t('distribution.roles.edit_permissions')}</h3>

      {error && <div className="error-message">{error}</div>}

      <div className="permissions-grid">
        {allPermissions.map((permission) => {
          const isLocked = LOCKED_PERMISSIONS.includes(permission);
          const isSelected = selectedPermissions.has(permission);

          return (
            <label key={permission} className={`permission-checkbox ${isLocked ? 'locked' : ''}`}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handlePermissionChange(permission)}
                disabled={isLocked}
              />
              <span>{permission}</span>
              {isLocked && (
                <span className="locked-badge" title={t('distribution.roles.locked')}>
                  Locked
                </span>
              )}
            </label>
          );
        })}
      </div>

      <div className="editor-actions">
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="primary"
          size="md"
        >
          {saving ? t('common.saving') : t('common.save')}
        </Button>
        <Button onClick={onCancel} variant="secondary" size="md">
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

export function UsersRolesScreen() {
  const api = useApi();
  const distributionApi = createDistributionApi(api);
  const { t } = useT();

  const [members, setMembers] = useState<MemberView[]>([]);
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [rolePreview, setRolePreview] = useState<RolePreview | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();

  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [roleFilters, setRoleFilters] = useState<string[]>([]);

  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>({
    displayName: '',
    phone: '',
    email: '',
    roles: [],
    orgUnitId: '',
    errors: {},
  });
  const [inviting, setInviting] = useState(false);

  const [showMemberAction, setShowMemberAction] = useState(false);
  const [memberAction, setMemberAction] = useState<MemberActionState | undefined>();
  const [actioning, setActioning] = useState(false);

  const [editingRole, setEditingRole] = useState<RoleDefinition | undefined>();

  // Load data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [membersRes, rolesRes] = await Promise.all([
          distributionApi.listMembers({ limit: 1000 }),
          distributionApi.listRoles(),
        ]);
        setMembers(membersRes.items);
        setRoles(rolesRes.items);
      } catch (err) {
        setError(err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Failed to load users'));
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [distributionApi]);

  // Load role preview when selected
  useEffect(() => {
    const loadPreview = async () => {
      if (editingRole) {
        try {
          const preview = await distributionApi.getRolePreview(editingRole.role);
          setRolePreview(preview);
        } catch {
          // Preview is optional
        }
      }
    };
    loadPreview();
  }, [editingRole, distributionApi]);

  const validateInviteForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!inviteForm.displayName.trim()) {
      errors.displayName = t('distribution.users.name_required');
    }

    if (!inviteForm.phone && !inviteForm.email) {
      errors.contact = t('distribution.users.phone_or_email_required');
    }

    if (!inviteForm.roles.length) {
      errors.roles = t('distribution.users.roles_required');
    }

    if (!inviteForm.orgUnitId) {
      errors.orgUnitId = t('distribution.users.unit_required');
    }

    setInviteForm((prev) => ({ ...prev, errors }));
    return Object.keys(errors).length === 0;
  };

  const handleInvite = async () => {
    if (!validateInviteForm()) return;

    try {
      setInviting(true);
      await distributionApi.inviteMember({
        displayName: inviteForm.displayName,
        phone: inviteForm.phone || undefined,
        email: inviteForm.email || undefined,
        roles: inviteForm.roles,
        orgUnitId: inviteForm.orgUnitId,
      });

      // Reload members
      const membersRes = await distributionApi.listMembers({ limit: 1000 });
      setMembers(membersRes.items);

      setShowInviteForm(false);
      setInviteForm({
        displayName: '',
        phone: '',
        email: '',
        roles: [],
        orgUnitId: '',
        errors: {},
      });
    } catch (err) {
      setInviteForm((prev) => ({
        ...prev,
        errors: {
          ...prev.errors,
          submit: err instanceof ApiError ? err.title : 'Failed to invite member',
        },
      }));
    } finally {
      setInviting(false);
    }
  };

  const handleMemberAction = async () => {
    if (!memberAction) return;

    try {
      setActioning(true);
      const member = members.find((m) => m.id === memberAction.memberId);
      if (!member) return;

      if (memberAction.action === 'suspend') {
        await distributionApi.transitionMemberStatus(
          memberAction.memberId,
          'suspended',
          memberAction.reason
        );
      } else {
        await distributionApi.transitionMemberStatus(
          memberAction.memberId,
          'active',
          memberAction.reason
        );
      }

      // Reload members
      const membersRes = await distributionApi.listMembers({ limit: 1000 });
      setMembers(membersRes.items);

      setShowMemberAction(false);
      setMemberAction(undefined);
    } catch (err) {
      alert(err instanceof ApiError ? err.title : 'Failed to update member');
    } finally {
      setActioning(false);
    }
  };

  const handleSaveRole = async (permissions: string[], etag: string) => {
    if (!editingRole) return;

    const updated = await distributionApi.updateRolePermissions(
      editingRole.role,
      permissions,
      etag
    );
    setRoles((prev) =>
      prev.map((r) => (r.role === editingRole.role ? updated : r))
    );
    setEditingRole(undefined);
  };

  const filteredMembers = members.filter((m) => {
    if (statusFilters.length > 0 && !statusFilters.includes(m.status)) return false;
    if (roleFilters.length > 0 && !m.roles.some((r) => roleFilters.includes(r))) return false;
    return true;
  });

  const uniqueRoles = Array.from(new Set(members.flatMap((m) => m.roles)));
  const uniqueStatuses = Array.from(new Set(members.map((m) => m.status)));

  const statusFilterOptions = uniqueStatuses.map((s) => ({ id: s, label: s }));
  const roleFilterOptions = uniqueRoles.map((r) => ({ id: r, label: r }));

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
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
      <div className="kpi-tiles">
        <Card>
          <div className="kpi-content">
            <div className="kpi-value">{filteredMembers.length}</div>
            <div className="kpi-label">{t('distribution.users.total_users')}</div>
          </div>
        </Card>
        <Card>
          <div className="kpi-content">
            <div className="kpi-value">
              {filteredMembers.filter((m) => m.mfaRequired).length}
            </div>
            <div className="kpi-label">{t('distribution.users.mfa_enabled')}</div>
          </div>
        </Card>
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
      <div className="members-table-card">
        <DataGrid
          columns={[
            { key: 'displayName', header: t('common.name') },
            { key: 'phoneMasked', header: t('common.phone') },
            {
              key: 'roles',
              header: t('common.role'),
              render: (row) => (row as MemberView).roles.join(', '),
            },
            {
              key: 'status',
              header: t('common.status'),
              render: (row) => (
                <StatusChip tone={(row as MemberView).status === 'active' ? 'ok' : 'info'}>
                  {(row as MemberView).status}
                </StatusChip>
              ),
            },
            {
              key: 'mfaRequired',
              header: t('distribution.users.mfa'),
              render: (row) => ((row as MemberView).mfaRequired ? '✓' : ''),
            },
            {
              key: 'actions',
              header: t('common.actions'),
              render: (row) => {
                const member = row as MemberView;
                return (
                  <div className="action-buttons">
                    {member.status === 'active' && (
                      <Button
                        size="md"
                        variant="secondary"
                        onClick={() => {
                          setMemberAction({
                            memberId: member.id,
                            action: 'suspend',
                            reason: '',
                          });
                          setShowMemberAction(true);
                        }}
                      >
                        {t('distribution.users.suspend')}
                      </Button>
                    )}
                    {member.status === 'suspended' && (
                      <Button
                        size="md"
                        variant="secondary"
                        onClick={() => {
                          setMemberAction({
                            memberId: member.id,
                            action: 'reactivate',
                            reason: '',
                          });
                          setShowMemberAction(true);
                        }}
                      >
                        {t('distribution.users.reactivate')}
                      </Button>
                    )}
                  </div>
                );
              },
            },
          ]}
          rows={filteredMembers}
          rowKey={(row) => row.id}
        />
      </div>

      {/* Roles Section */}
      <div className="roles-section">
        <h2>{t('distribution.roles.title')}</h2>
        <div className="roles-grid">
          {roles.map((role) => (
            <div key={role.role} className="role-card">
              <Card>
              <div className="role-header">
                <h3>{role.role}</h3>
                {role.privileged && (
                  <span className="mfa-badge" title={t('distribution.roles.mfa_required')}>
                    MFA
                  </span>
                )}
              </div>
              <div className="role-details">
                <div>
                  <strong>{t('distribution.roles.scope')}</strong>: {role.recordScope}
                </div>
                <div>
                  <strong>{t('distribution.roles.editable')}</strong>: {role.editable ? t('common.yes') : t('common.no')}
                </div>
              </div>
              {role.editable && (
                <Button
                  onClick={() => setEditingRole(role)}
                  variant="secondary"
                  size="md"
                >
                  {t('distribution.roles.edit')}
                </Button>
              )}
              </Card>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Member Modal */}
      <BottomSheet open={showInviteForm} title={t('distribution.users.invite_member')} onClose={() => setShowInviteForm(false)}>
        <div className="invite-form">
          {inviteForm.errors.submit && (
            <div className="error-message">{inviteForm.errors.submit}</div>
          )}

          <div className="form-field">
            <label>{t('common.name')}</label>
            <input
              type="text"
              value={inviteForm.displayName}
              onChange={(e) =>
                setInviteForm((prev) => ({ ...prev, displayName: e.target.value }))
              }
              placeholder={t('common.name')}
            />
            {inviteForm.errors.displayName && (
              <span className="field-error">{inviteForm.errors.displayName}</span>
            )}
          </div>

          <div className="form-field">
            <label>{t('common.phone')}</label>
            <input
              type="tel"
              value={inviteForm.phone}
              onChange={(e) =>
                setInviteForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              placeholder="+91-XXXX-XXXX-XXXX"
            />
          </div>

          <div className="form-field">
            <label>{t('common.email')}</label>
            <input
              type="email"
              value={inviteForm.email}
              onChange={(e) =>
                setInviteForm((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="user@example.com"
            />
          </div>

          {inviteForm.errors.contact && (
            <span className="field-error">{inviteForm.errors.contact}</span>
          )}

          <div className="form-field">
            <label>{t('common.roles')}</label>
            <div className="role-checkboxes">
              {roles.map((role) => (
                <label key={role.role}>
                  <input
                    type="checkbox"
                    checked={inviteForm.roles.includes(role.role)}
                    onChange={(e) => {
                      const newRoles = e.target.checked
                        ? [...inviteForm.roles, role.role]
                        : inviteForm.roles.filter((r) => r !== role.role);
                      setInviteForm((prev) => ({ ...prev, roles: newRoles }));
                    }}
                  />
                  {role.role}
                </label>
              ))}
            </div>
            {inviteForm.errors.roles && (
              <span className="field-error">{inviteForm.errors.roles}</span>
            )}
          </div>

          <div className="form-actions">
            <Button
              onClick={handleInvite}
              disabled={inviting}
              variant="primary"
              size="md"
            >
              {inviting ? t('common.loading') : t('distribution.users.invite')}
            </Button>
            <Button
              onClick={() => setShowInviteForm(false)}
              variant="secondary"
              size="md"
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </BottomSheet>

      {/* Member Action Modal */}
      <BottomSheet
        open={showMemberAction}
        title={
          memberAction?.action === 'suspend'
            ? t('distribution.users.confirm_suspend')
            : t('distribution.users.confirm_reactivate')
        }
        onClose={() => setShowMemberAction(false)}
      >
        {memberAction && (
          <div className="member-action-form">

            <div className="form-field">
              <label>{t('common.reason')}</label>
              <textarea
                value={memberAction.reason}
                onChange={(e) =>
                  setMemberAction((prev) =>
                    prev ? { ...prev, reason: e.target.value } : prev
                  )
                }
                placeholder={t('common.reason')}
                minLength={3}
                maxLength={200}
              />
            </div>

            <div className="form-actions">
              <Button
                onClick={handleMemberAction}
                disabled={actioning || !memberAction.reason.trim()}
                variant={memberAction.action === 'suspend' ? 'danger' : 'primary'}
                size="md"
              >
                {actioning ? t('common.loading') : t('common.confirm')}
              </Button>
              <Button
                onClick={() => setShowMemberAction(false)}
                variant="secondary"
                size="md"
              >
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </BottomSheet>

      {/* Role Editor Modal */}
      <BottomSheet open={!!editingRole} title={editingRole?.role ?? ''} onClose={() => setEditingRole(undefined)}>
        {editingRole && (
          <div className="role-editor-wrapper">
            <PermissionEditor
              role={editingRole}
              onSave={handleSaveRole}
              onCancel={() => setEditingRole(undefined)}
              t={t}
            />

            {rolePreview && (
              <div className="role-preview">
                <h3>{t('distribution.roles.what_sees')}</h3>
                <div className="preview-permissions">
                  {rolePreview.sees.map((permission) => (
                    <span key={permission} className="permission-tag">
                      {permission}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  );
}
