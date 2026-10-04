import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, ErrorState, ApiError } from '../../design-system';
import { DEMO_PASSWORD, DEMO_PERSONAS, homeForRoles, isOidcConfigured, signIn, useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';
import './LoginPage.css';

function DemoPersonaPicker({ username, onChange }: { username: string; onChange(username: string): void }) {
  const { t } = useT();
  return (
    <div className="login-demo">
      <label htmlFor="demo-persona" className="login-label">
        {t('login.demoPersona')}
      </label>
      <select id="demo-persona" className="login-select" value={username} onChange={(e) => onChange(e.target.value)}>
        {DEMO_PERSONAS.map((p) => (
          <option key={p.username} value={p.username}>
            {`${p.name} — ${p.roleLabel}`}
          </option>
        ))}
      </select>
      <p className="login-hint">{t('login.demoHint', { username, password: DEMO_PASSWORD })}</p>
    </div>
  );
}

export function LoginPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const demo = import.meta.env.VITE_DEMO_LOGIN === '1';
  const [username, setUsername] = useState(DEMO_PERSONAS[0].username);
  const [redirecting, setRedirecting] = useState(false);
  const [failure, setFailure] = useState<string>();
  const { session } = useAuth();

  useEffect(() => {
    if (session) navigate(homeForRoles(session.roles), { replace: true });
  }, [session, navigate]);

  const start = () => {
    setRedirecting(true);
    setFailure(undefined);
    signIn(demo ? username : undefined).catch(() => {
      setRedirecting(false);
      setFailure(t('login.failed'));
    });
  };

  if (!isOidcConfigured()) {
    const error = new ApiError(0, 'auth.not_configured', 'Sign-in is not configured', t('login.notConfigured'));
    return (
      <main className="login-page">
        <ErrorState error={error} />
      </main>
    );
  }

  return (
    <main className="login-page">
      <Card title={t('app.title')}>
        <div className="login-body">
          <p className="login-description">{t('login.description')}</p>
          {demo && <DemoPersonaPicker username={username} onChange={setUsername} />}
          {failure && <p role="alert" className="login-error">{failure}</p>}
          <Button size="lg" loading={redirecting} onClick={start} className="login-submit">
            {t('login.signIn')}
          </Button>
        </div>
      </Card>
    </main>
  );
}
