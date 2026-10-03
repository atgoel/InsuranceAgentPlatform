import { Card, Button } from '../design-system';
import { useAuth } from '../lib/auth';
import { useT } from '../lib/i18n';
import './Home.css';

const ROLE_CARDS = [
  { role: 'agent', label: 'Agent', color: '#1F5FBF' },
  { role: 'isp', label: 'ISP', color: '#1D5F3A' },
  { role: 'manager', label: 'Manager', color: '#7A3E06' },
  { role: 'operator', label: 'Operator', color: '#163F7F' },
];

export function Home() {
  const { session } = useAuth();
  const { t, lang, setLang } = useT();

  if (!session) {
    return (
      <div className="home-container">
        <div className="language-switch">
          <button
            className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
            onClick={() => setLang('en')}
          >
            EN
          </button>
          <button
            className={`lang-btn ${lang === 'hi' ? 'active' : ''}`}
            onClick={() => setLang('hi')}
          >
            हि
          </button>
        </div>

        <Card title={t('app.title')}>
          <div className="role-grid">
            {ROLE_CARDS.map(roleCard => (
              <div key={roleCard.role} className="role-entry-card">
                <div className="role-badge" style={{ backgroundColor: roleCard.color }}>
                  {roleCard.label[0]}
                </div>
                <h3>{roleCard.label}</h3>
                <Button variant="secondary" size="md">
                  {t('auth.selectRole')}
                </Button>
              </div>
            ))}
          </div>

          <div className="surfaces-section">
            <h3>Platform Surfaces</h3>
            <div className="surfaces-grid">
              <Button variant="ghost" onClick={() => (window.location.href = '/m/today')}>
                Mobile App
              </Button>
              <Button variant="ghost" onClick={() => (window.location.href = '/crm/leads')}>
                CRM
              </Button>
              <Button variant="ghost" onClick={() => (window.location.href = '/console/dashboard')}>
                Console
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="home-container">
      <Card title={t('app.title')}>
        <p>Welcome, {session.roles.join(', ')}</p>
        <div className="surfaces-grid">
          <Button onClick={() => (window.location.href = '/m/today')}>Mobile App</Button>
          <Button onClick={() => (window.location.href = '/crm/leads')}>CRM</Button>
          <Button onClick={() => (window.location.href = '/console/dashboard')}>Console</Button>
        </div>
      </Card>
    </div>
  );
}
