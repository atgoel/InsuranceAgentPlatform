import './PermissionDenied.css';

export interface PermissionDeniedProps {
  reason?: 'role' | 'tenant';
}

export function PermissionDenied({ reason }: PermissionDeniedProps) {
  const messages = {
    role: 'You do not have the required role to access this page.',
    tenant: 'Your tenant does not have access to this feature.',
  };

  return (
    <div className="permission-denied">
      <div className="permission-icon">🔒</div>
      <h2 className="permission-title">Access Denied</h2>
      <p className="permission-message">{messages[reason || 'role']}</p>
    </div>
  );
}
