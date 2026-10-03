import { useState } from 'react';
import { Button, Card } from '../../design-system';
import { useApi } from '../api';
import { useAuth } from './auth-provider';
import './DevLogin.css';

const ROLES = ['agent', 'isp', 'manager', 'operator', 'compliance', 'po', 'admin'];
const ROLE_LABELS: Record<string, string> = {
  agent: 'Agent',
  isp: 'ISP',
  manager: 'Manager',
  operator: 'Operator',
  compliance: 'Compliance',
  po: 'Principal Officer',
  admin: 'Admin',
};

const ROLE_HOMES: Record<string, string> = {
  agent: '/m/today',
  isp: '/m/today',
  manager: '/crm/leads',
  operator: '/console/dashboard',
  compliance: '/console/compliance',
  po: '/console/dashboard',
  admin: '/console/configuration',
};

export function DevLogin() {
  const api = useApi();
  const { setSession } = useAuth();
  const [selectedRole, setSelectedRole] = useState<string>('agent');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const response = await api.post<{ token: string }>('/api/v1/dev/tokens', {
        tenantId: 'ten_acme',
        roles: [selectedRole],
      });

      setSession({
        token: response.token,
        tenantId: 'ten_acme',
        roles: [selectedRole],
      });

      // Navigate to role-specific home
      const home = ROLE_HOMES[selectedRole] || '/';
      window.location.href = home;
    } catch {
      // Login failed, UI will show error via api.onError callback
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dev-login-container">
      <Card title="Select Your Role">
        <div className="role-grid">
          {ROLES.map(role => (
            <button
              key={role}
              className={`role-card ${selectedRole === role ? 'selected' : ''}`}
              onClick={() => setSelectedRole(role)}
            >
              {ROLE_LABELS[role]}
            </button>
          ))}
        </div>
        <Button onClick={handleLogin} loading={loading} size="lg" className="login-button">
          Login
        </Button>
      </Card>
    </div>
  );
}
