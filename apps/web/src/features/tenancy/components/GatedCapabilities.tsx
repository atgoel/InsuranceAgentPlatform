import { useState } from 'react';
import { Button, StatusChip } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { FeatureFlag } from '../api';

export interface GatedCapabilitiesProps {
  online?: FeatureFlag;
  canWrite: boolean;
  busy: boolean;
  error?: string;
  onRecordReview(reviewRef: string): void;
  onEnable(enabled: boolean): void;
}

function OnlinePurchaseActions({ online, canWrite, busy, onRecordReview, onEnable }: GatedCapabilitiesProps) {
  const { t } = useT();
  const [reviewRef, setReviewRef] = useState('');
  if (!online || !canWrite) return null;
  if (online.enabled) {
    return (
      <Button variant="secondary" size="md" loading={busy} onClick={() => onEnable(false)}>
        {t('tenancy.setup.disable_for_tenant')}
      </Button>
    );
  }
  if (online.gate?.reviewRef) {
    return (
      <Button size="md" loading={busy} onClick={() => onEnable(true)}>
        {t('tenancy.setup.enable_for_tenant')}
      </Button>
    );
  }
  const valid = reviewRef.trim().length >= 3;
  return (
    <div className="review-form">
      <input
        type="text"
        aria-label={t('tenancy.setup.review_ref')}
        placeholder={t('tenancy.setup.review_ref')}
        maxLength={80}
        value={reviewRef}
        onChange={(e) => setReviewRef(e.target.value)}
      />
      <Button variant="secondary" size="md" loading={busy} disabled={!valid} onClick={() => onRecordReview(reviewRef.trim())}>
        {t('tenancy.setup.record_review')}
      </Button>
    </div>
  );
}

function onlineStatus(online?: FeatureFlag): { tone: 'ok' | 'info' | 'warn'; key: string } {
  if (online?.enabled) return { tone: 'ok', key: 'tenancy.setup.online_purchase_enabled' };
  if (online?.gate?.reviewRef) return { tone: 'info', key: 'tenancy.setup.online_purchase_reviewed' };
  return { tone: 'warn', key: 'tenancy.setup.online_purchase_status' };
}

export function GatedCapabilities(props: GatedCapabilitiesProps) {
  const { t } = useT();
  const status = onlineStatus(props.online);
  return (
    <div className="gated-capabilities">
      <h3>{t('tenancy.setup.gated_capabilities')}</h3>
      {props.error && (
        <p role="alert" className="error-banner">
          {props.error}
        </p>
      )}
      <div className="capability-item">
        <div className="capability-header">
          <strong>{t('tenancy.setup.online_purchase')}</strong>
          <StatusChip tone={status.tone}>{t(status.key)}</StatusChip>
        </div>
        <p className="capability-description">{t('tenancy.setup.online_purchase_description')}</p>
        <OnlinePurchaseActions {...props} />
      </div>
      <div className="capability-item">
        <div className="capability-header">
          <strong>{t('tenancy.setup.referral_rewards')}</strong>
          <StatusChip tone="bad">{t('tenancy.setup.referral_locked')}</StatusChip>
        </div>
        <p className="capability-description">{t('tenancy.setup.referral_description')}</p>
        <label className="capability-switch">
          <input type="checkbox" role="switch" checked={false} disabled readOnly />
          <span>{t('tenancy.setup.referral_switch')}</span>
        </label>
      </div>
    </div>
  );
}
