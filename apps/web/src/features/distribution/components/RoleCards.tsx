import { Card, Button } from '../../../design-system';
import { RoleDefinition } from '../api';

interface RoleCardsProps {
  roles: RoleDefinition[];
  onEditRole: (role: RoleDefinition) => void;
}

export function RoleCards({ roles, onEditRole }: RoleCardsProps) {
  return (
    <div className="roles-section">
      <h2>Roles</h2>
      <div className="roles-grid">
        {roles.map((role) => (
          <div key={role.role} className="role-card">
            <Card>
              <div className="role-header">
                <h3>{role.role}</h3>
                {role.privileged && (
                  <span className="mfa-badge" title="MFA Required">
                    MFA
                  </span>
                )}
              </div>
              <div className="role-details">
                <div>
                  <strong>Scope</strong>: {role.recordScope}
                </div>
                <div>
                  <strong>Editable</strong>: {role.editable ? 'Yes' : 'No'}
                </div>
              </div>
              {role.editable && (
                <Button
                  onClick={() => onEditRole(role)}
                  variant="secondary"
                  size="md"
                >
                  Edit
                </Button>
              )}
            </Card>
          </div>
        ))}
      </div>
    </div>
  );
}
