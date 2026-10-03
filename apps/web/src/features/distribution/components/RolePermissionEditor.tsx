import { useState } from 'react';
import { Button } from '../../../design-system';
import { RoleDefinition } from '../api';

const LOCKED_PERMISSIONS = ['party.medical.read', 'audit.delete', 'ops.*'];

const ALL_PERMISSIONS = [
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

interface RolePermissionEditorProps {
  role: RoleDefinition;
  onSave: (permissions: string[], etag: string) => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
  error?: string;
}

export function RolePermissionEditor({
  role,
  onSave,
  onCancel,
  isSaving,
  error,
}: RolePermissionEditorProps) {
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set(role.permissions)
  );

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
    await onSave(Array.from(selectedPermissions), role.etag);
  };

  return (
    <div className="permission-editor">
      <h3>Edit Permissions</h3>

      {error && <div className="error-message">{error}</div>}

      <div className="permissions-grid">
        {ALL_PERMISSIONS.map((permission) => {
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
                <span className="locked-badge" title="Locked">
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
          disabled={isSaving}
          variant="primary"
          size="md"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </Button>
        <Button onClick={onCancel} variant="secondary" size="md">
          Cancel
        </Button>
      </div>
    </div>
  );
}
