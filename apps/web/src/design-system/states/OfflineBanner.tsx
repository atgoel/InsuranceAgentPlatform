import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';
import './OfflineBanner.css';

export function OfflineBanner() {
  const { t } = useT();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="offline-banner">
      📡 {t('ds.offline.banner')}
    </div>
  );
}
