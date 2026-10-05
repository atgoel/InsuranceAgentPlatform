import { Button } from '../../design-system';
import { useT } from '../../lib/i18n';
import { usePwa } from '../../lib/pwa';
import './UpdatePrompt.css';

/** Persistent bar shown when a new app version is waiting; Reload activates it. */
export function UpdatePrompt() {
  const { t } = useT();
  const { needRefresh, update } = usePwa();
  if (!needRefresh) return null;
  return (
    <div className="update-prompt" role="status">
      <span>{t('pwa.updateAvailable')}</span>
      <Button type="button" variant="secondary" onClick={update}>
        {t('pwa.reload')}
      </Button>
    </div>
  );
}
