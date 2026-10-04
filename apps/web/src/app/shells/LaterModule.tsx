import { EmptyState } from '../../design-system';
import { useT } from '../../lib/i18n';

/** The "later module" screen for unknown routes and for navigation entries whose screen is not built (D3). */
export function LaterModule() {
  const { t } = useT();
  return <EmptyState title={t('shell.laterModule')} />;
}
