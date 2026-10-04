import { Card, StatusChip, formatIstDate, type Tone } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { TenantProfile } from '../api';

const STATUS_TONE: Record<'valid' | 'expiring' | 'expired', Tone> = { valid: 'ok', expiring: 'warn', expired: 'bad' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="entity-field">
      <span className="entity-label">{label}</span>
      <div className="entity-value">{children}</div>
    </div>
  );
}

function RegistrationStatus({ status }: { status: TenantProfile['registrationStatus'] }) {
  const { t } = useT();
  if (!status) return null;
  return <StatusChip tone={STATUS_TONE[status]}>{t(`tenancy.setup.status_${status}`)}</StatusChip>;
}

export function EntityCard({ profile }: { profile: TenantProfile }) {
  const { t, lang } = useT();
  const entity = profile.entity;
  if (!entity) {
    return (
      <Card title={t('tenancy.setup.entity_title')}>
        <p className="entity-empty">{t('tenancy.setup.entity_missing')}</p>
      </Card>
    );
  }
  const scope = profile.comparisonScope === 'MARKET_WIDE' ? 'tenancy.setup.scope_market_wide' : 'tenancy.setup.scope_tied_insurers';
  return (
    <Card title={t('tenancy.setup.entity_title')}>
      <div className="entity-section">
        <Field label={t('tenancy.setup.entity_type')}>{t(`tenancy.entity_type.${entity.entityType}`)}</Field>
        <Field label={t('tenancy.setup.legal_name')}>{entity.legalName}</Field>
        <Field label={t('tenancy.setup.registration_no')}>{entity.registrationNo}</Field>
        <Field label={t('tenancy.setup.registration_valid_to')}>
          <span className="registration-status">
            {formatIstDate(entity.registrationValidTo, lang)}
            <RegistrationStatus status={profile.registrationStatus} />
          </span>
        </Field>
        {entity.principalOfficerName && <Field label={t('tenancy.setup.principal_officer')}>{entity.principalOfficerName}</Field>}
        <p className="scope-info">
          <strong>{t('tenancy.setup.comparison_scope')}</strong> {t(scope)}
        </p>
        <p className="scope-note">{t('tenancy.setup.limits_note')}</p>
      </div>
    </Card>
  );
}
