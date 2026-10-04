import { useState } from 'react';
import { Button, Card, Select } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import type { MemberView } from '../api';

export interface ExitPanelProps {
  member: MemberView;
  /** Eligible receivers of the leaving member's customers. */
  targets: MemberView[];
  onExit(transferToMemberId: string | undefined, reason: string): Promise<void>;
}

const NONE = '';
const MIN_REASON = 3;

/** Member exit with ownership transfer; the data-ownership note follows the tenant contract (F97). */
export function ExitPanel({ member, targets, onExit }: ExitPanelProps) {
  const { t } = useT();
  const [target, setTarget] = useState(NONE);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onExit(target === NONE ? undefined : target, reason.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.title : t('distribution.users.action_failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('distribution.exit.title', { name: member.displayName })}>
      <div className="exit-panel">
        <Select
          label={t('distribution.exit.transfer_to')}
          value={target}
          options={[
            { value: NONE, label: t('distribution.exit.no_transfer') },
            ...targets.map((m) => ({ value: m.id, label: m.displayName })),
          ]}
          onChange={setTarget}
        />
        <div className="form-field">
          <label htmlFor="exit-reason">{t('distribution.reason.label')}</label>
          <textarea id="exit-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        <Button variant="secondary" size="md" loading={busy} disabled={reason.trim().length < MIN_REASON} onClick={confirm}>
          {t('distribution.exit.confirm')}
        </Button>
        <p className="help-text">{t('distribution.exit.ownership_note')}</p>
      </div>
    </Card>
  );
}
