import { Card, Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { RoleDefinition } from '../api';
import { RoleName, ScopeName } from './RoleLabels';

interface RoleCardsProps {
  roles: RoleDefinition[];
  selectedRole?: string;
  /** Editing needs distribution.role.write (TENANT_ADMIN); without it the cards are read-only. */
  canEdit?: boolean;
  onEditRole: (role: RoleDefinition) => void;
}

interface RoleCardProps {
  role: RoleDefinition;
  selected: boolean;
  canEdit: boolean;
  onEditRole: RoleCardsProps['onEditRole'];
}

function RoleCard({ role, selected, canEdit, onEditRole }: RoleCardProps) {
  const { t } = useT();
  return (
    <div className="role-card" data-selected={selected}>
      <Card>
        <div className="role-header">
          <h3>
            <RoleName role={role.role} />
          </h3>
          {role.privileged && (
            <span className="mfa-badge" title={t('distribution.roles.mfa_required')}>
              {t('distribution.roles.mfa')}
            </span>
          )}
        </div>
        <div className="role-details">
          <div>
            <strong>{t('distribution.roles.scope')}</strong>: <span><ScopeName scope={role.recordScope} /></span>
          </div>
          <div>
            <strong>{t('distribution.roles.editable')}</strong>: {role.editable ? t('distribution.roles.yes') : t('distribution.roles.no')}
          </div>
        </div>
        {role.editable && canEdit && (
          <Button onClick={() => onEditRole(role)} variant="secondary" size="md" aria-pressed={selected}>
            {t('common.edit')}
          </Button>
        )}
      </Card>
    </div>
  );
}

export function RoleCards({ roles, selectedRole, canEdit = true, onEditRole }: RoleCardsProps) {
  const { t } = useT();
  return (
    <div className="roles-section">
      <h2>{t('distribution.roles.title')}</h2>
      <div className="roles-grid">
        {roles.map((role) => (
          <RoleCard key={role.role} role={role} selected={role.role === selectedRole} canEdit={canEdit} onEditRole={onEditRole} />
        ))}
      </div>
    </div>
  );
}
