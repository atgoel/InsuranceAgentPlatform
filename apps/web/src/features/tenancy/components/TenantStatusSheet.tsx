import { useState } from 'react';
import { BottomSheet, Button } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import type { TenantSummary } from '../api';

export interface TenantStatusTarget {
  tenant: TenantSummary;
  to: 'suspended' | 'active';
}

export interface TenantStatusSheetProps {
  target?: TenantStatusTarget;
  onClose(): void;
  onConfirm(tenantId: string, to: 'suspended' | 'active', reason: string): Promise<void>;
}

const MIN_REASON = 3;
const MAX_REASON = 200;

/** Suspend or resume asks for a reason (3..200 characters, M01 section 6.1); a failure stays inside the sheet. */
export function TenantStatusSheet({ target, onClose, onConfirm }: TenantStatusSheetProps) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  if (!target) return null;
  const { tenant, to } = target;
  const titleKey = to === 'suspended' ? 'tenancy.operator.suspend_title' : 'tenancy.operator.resume_title';

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(tenant.id, to, reason.trim());
      setReason('');
    } catch (err) {
      setError(err instanceof ApiError ? err.title : t('error.networkError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open title={t(titleKey, { name: tenant.displayName })} onClose={onClose}>
      <div className="provision-form">
        <label className="provision-field">
          <span>{t('tenancy.operator.reason')}</span>
          <textarea value={reason} maxLength={MAX_REASON} rows={3} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="operator-error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button onClick={confirm} loading={busy} disabled={reason.trim().length < MIN_REASON} size="lg">
            {t('tenancy.operator.confirm')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
