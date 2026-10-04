import { useState } from 'react';
import { useT } from '../../lib/i18n';
import { RoleName } from './RoleName';
import { SignOutButton } from './SignOutButton';

export interface UserMenuProps {
  userName?: string;
  roles: string[];
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/** Avatar button that opens the account panel: user name, role and Sign out. */
export function UserMenu({ userName, roles }: UserMenuProps) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const name = userName ?? t('shell.user');
  return (
    <div className="shell-user">
      <button
        type="button"
        className="shell-avatar"
        aria-label={t('shell.account')}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {initialOf(name)}
      </button>
      {open && (
        <div className="shell-user-panel">
          <p className="shell-user-name">{name}</p>
          {roles[0] && (
            <p className="shell-user-role">
              <RoleName role={roles[0]} />
            </p>
          )}
          <SignOutButton />
        </div>
      )}
    </div>
  );
}
