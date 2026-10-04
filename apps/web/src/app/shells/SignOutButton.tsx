import { useState } from 'react';
import { Button } from '../../design-system';
import { signOut } from '../../lib/auth';
import { useT } from '../../lib/i18n';

/** Signs out through Keycloak; a failure is shown next to the button and never replaces the screen. */
export function SignOutButton() {
  const { t } = useT();
  const [failed, setFailed] = useState(false);

  const handleClick = () => {
    setFailed(false);
    signOut().catch(() => setFailed(true));
  };

  return (
    <>
      <Button type="button" variant="secondary" onClick={handleClick}>
        {t('shell.signOut')}
      </Button>
      {failed && (
        <p role="alert" className="shell-error">
          {t('shell.signOutFailed')}
        </p>
      )}
    </>
  );
}
