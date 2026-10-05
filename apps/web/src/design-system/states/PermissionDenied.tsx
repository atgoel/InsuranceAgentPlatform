import { useT } from '../../lib/i18n';
import './PermissionDenied.css';

export interface PermissionDeniedProps {
  reason?: 'role' | 'tenant';
}

export function PermissionDenied({ reason }: PermissionDeniedProps) {
  const { t } = useT();

  return (
    <div className="permission-denied">
      <div className="permission-icon">🔒</div>
      <h2 className="permission-title">{t('ds.permission.title')}</h2>
      <p className="permission-message">{t(reason === 'tenant' ? 'ds.permission.tenant' : 'ds.permission.role')}</p>
    </div>
  );
}
