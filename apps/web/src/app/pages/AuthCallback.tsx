import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, ErrorState, ApiError } from '../../design-system';
import { completeSignIn, homeForRoles, useAuth } from '../../lib/auth';
import { useT } from '../../lib/i18n';

export function AuthCallback() {
  const { t } = useT();
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const started = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeSignIn()
      .then((session) => {
        setSession(session);
        navigate(homeForRoles(session.roles), { replace: true });
      })
      .catch(() => setFailed(true));
  }, [navigate, setSession]);

  if (!failed) {
    return <p role="status">{t('login.completing')}</p>;
  }
  const error = new ApiError(0, 'auth.callback_failed', 'Sign-in failed', t('login.failed'));
  return (
    <main className="login-page">
      <div>
        <ErrorState error={error} />
        <Button variant="secondary" size="lg" onClick={() => navigate('/login', { replace: true })}>
          {t('login.backToSignIn')}
        </Button>
      </div>
    </main>
  );
}
