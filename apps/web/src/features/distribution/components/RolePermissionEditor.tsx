import { useState } from 'react';
import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { RoleDefinition } from '../api';

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

/** Every editable permission plus whatever the role already holds (other modules and locked ones), so nothing is hidden. */
function listedPermissions(role: RoleDefinition): string[] {
  return Array.from(new Set([...ALL_PERMISSIONS, ...role.permissions]));
}

export function RolePermissionEditor({ role, onSave, onCancel, isSaving, error }: RolePermissionEditorProps) {
  const { t } = useT();
  const [selected, setSelected] = useState<Set<string>>(new Set(role.permissions));

  const labelFor = (permission: string) => {
    const key = `distribution.perm.${permission}`;
    const text = t(key);
    return text === key ? permission : text;
  };

  const toggle = (permission: string) => {
    if (LOCKED_PERMISSIONS.includes(permission)) return;
    const next = new Set(selected);
    if (next.has(permission)) next.delete(permission);
    else next.add(permission);
    setSelected(next);
  };

  return (
    <div className="permission-editor">
      <h3>{t('distribution.roles.edit_permissions')}</h3>
      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}
      <div className="permissions-grid">
        {listedPermissions(role).map((permission) => {
          const locked = LOCKED_PERMISSIONS.includes(permission);
          return (
            <label key={permission} className={`permission-checkbox ${locked ? 'locked' : ''}`}>
              <input type="checkbox" checked={selected.has(permission)} onChange={() => toggle(permission)} disabled={locked} />
              <span>{labelFor(permission)}</span>
              {locked && <span className="locked-badge">{t('distribution.roles.locked')}</span>}
            </label>
          );
        })}
      </div>
      <div className="editor-actions">
        <Button onClick={() => onSave(Array.from(selected), role.etag)} disabled={isSaving} variant="primary" size="md">
          {isSaving ? t('distribution.roles.saving') : t('distribution.roles.save_version', { version: role.version + 1 })}
        </Button>
        <Button onClick={onCancel} variant="secondary" size="md">
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
