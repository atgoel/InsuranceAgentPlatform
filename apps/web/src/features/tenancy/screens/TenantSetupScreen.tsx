import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../../../lib/api';
import { Button, Card, StatusChip, LoadingSkeleton, ErrorState, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createTenancyApi, TieUp, TenantProfile, TieUpsResponse, LineOfBusiness } from '../api';
import { CatalogueTable } from '../../catalogue/components/CatalogueTable';
import '../styles/TenantSetupScreen.css';

interface TieUpsLine {
  line: LineOfBusiness;
  max: number | null;
  active: TieUp[];
}

interface TieUpsSectionProps {
  lines: TieUpsLine[];
  editedTieUps: TieUp[];
  newInsurers: Record<string, string>;
  saveError?: string;
  onAddInsurer: (line: LineOfBusiness) => void;
  onRemoveInsurer: (insurerId: string, line: LineOfBusiness) => void;
  onNewInsurerChange: (line: LineOfBusiness, value: string) => void;
  t: ReturnType<typeof useT>['t'];
}

function TieUpsContent(props: TieUpsSectionProps) {
  return (
    <div className="tieups-section">
      {props.saveError && (
        <div className="error-banner">{props.saveError}</div>
      )}

      {props.lines.map(line => {
        const currentTieUps = props.editedTieUps.filter(t => t.line === line.line);
        const max = line.max;
        const isFull = max !== null && currentTieUps.length >= max;

        return (
          <div key={line.line} className="line-section">
            <div className="line-header">
              <strong>{line.line}</strong>
              <span className="limit-text">
                {currentTieUps.length}{max !== null ? `/${max}` : ''}
              </span>
            </div>

            {isFull && max !== null && (
              <div className="limit-warning">
                {props.t('tenancy.setup.tie_up_limit_reached')}
              </div>
            )}

            <div className="insurers-list">
              {currentTieUps.map(tieUp => (
                <div key={`${tieUp.insurerId}-${tieUp.line}`} className="insurer-chip">
                  {tieUp.insurerId}
                  <button
                    className="remove-btn"
                    onClick={() => props.onRemoveInsurer(tieUp.insurerId, line.line)}
                    aria-label={props.t('common.delete')}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {!isFull && (
              <div className="add-insurer">
                <input
                  type="text"
                  placeholder={props.t('tenancy.setup.insurer_id')}
                  value={props.newInsurers[line.line] || ''}
                  onChange={e =>
                    props.onNewInsurerChange(line.line, e.target.value)
                  }
                />
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => props.onAddInsurer(line.line)}
                >
                  {props.t('tenancy.setup.add_insurer')}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface GatedCapabilitiesProps {
  t: ReturnType<typeof useT>['t'];
}

function GatedCapabilities({ t }: GatedCapabilitiesProps) {
  return (
    <div className="gated-capabilities">
      <h3>{t('tenancy.setup.gated_capabilities')}</h3>

      <div className="capability-item">
        <div className="capability-header">
          <strong>{t('tenancy.setup.online_purchase')}</strong>
          <StatusChip tone="info">
            {t('tenancy.setup.online_purchase_status')}
          </StatusChip>
        </div>
        <p className="capability-description">
          {t('tenancy.setup.online_purchase_description')}
        </p>
        <Button variant="secondary" size="md">
          {t('tenancy.setup.record_review')}
        </Button>
      </div>

      <div className="capability-item">
        <div className="capability-header">
          <strong>{t('tenancy.setup.referral_rewards')}</strong>
          <StatusChip tone="bad">
            {t('tenancy.setup.referral_locked')}
          </StatusChip>
        </div>
        <p className="capability-description">
          {t('tenancy.setup.referral_description')}
        </p>
      </div>
    </div>
  );
}

export function TenantSetupScreen() {
  const api = useApi();
  const tenancyApi = useMemo(() => createTenancyApi(api), [api]);
  const { t } = useT();

  const [profile, setProfile] = useState<TenantProfile | undefined>();
  const [tieUps, setTieUps] = useState<TieUpsResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [editedTieUps, setEditedTieUps] = useState<TieUp[]>([]);
  const [newInsurers, setNewInsurers] = useState<Record<string, string>>({});

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [prof, ties] = await Promise.all([
          tenancyApi.getTenantProfile(),
          tenancyApi.getTieUps(),
        ]);
        setProfile(prof);
        setTieUps(ties);
        setEditedTieUps(ties.lines.flatMap(l => l.active));
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 403) {
            setError(err);
          } else {
            setError(err);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleAddInsurer = (line: string) => {
    const insurerId = newInsurers[line];
    if (!insurerId) return;

    const today = new Date().toISOString().split('T')[0];
    setEditedTieUps([
      ...editedTieUps,
      {
        insurerId,
        line: line as LineOfBusiness,
        effectiveFrom: today,
      },
    ]);
    setNewInsurers({ ...newInsurers, [line]: '' });
  };

  const handleRemoveInsurer = (insurerId: string, line: string) => {
    setEditedTieUps(
      editedTieUps.filter(t => !(t.insurerId === insurerId && t.line === line))
    );
  };

  const handleSaveError = (err: ApiError) => {
    if (err.code === 'tie_up_limit_exceeded') {
      setSaveError(t('tenancy.tie_up_limit_exceeded'));
    } else {
      setSaveError(err.title);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(undefined);

    try {
      await tenancyApi.updateTieUps(editedTieUps);
      // Update the displayed tieUps
      const updated = await tenancyApi.getTieUps();
      setTieUps(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        handleSaveError(err);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} />;
  }

  if (!profile || !tieUps) {
    return <LoadingSkeleton />;
  }

  const getRegistrationTone = () => {
    if (profile.entity?.registrationStatus === 'valid') return 'ok';
    if (profile.entity?.registrationStatus === 'expiring') return 'warn';
    return 'bad';
  };

  const registrationStatusTone = getRegistrationTone();

  return (
    <div className="tenant-setup-screen">
      <div className="page-header">
        <div>
          <h1>{t('tenancy.setup.title')}</h1>
          <p>{t('tenancy.setup.description')}</p>
        </div>
        <Button onClick={handleSave} loading={saving} size="lg">
          {t('common.save')}
        </Button>
      </div>

      <div className="setup-grid">
        <Card title={t('tenancy.setup.entity_title')}>
          <div className="entity-section">
            {profile.entity && (
              <>
                <div className="entity-field">
                  <label>{t('tenancy.setup.entity_type')}</label>
                  <p>{profile.entity.entityType}</p>
                </div>

                <div className="entity-field">
                  <label>{t('tenancy.setup.legal_name')}</label>
                  <p>{profile.entity.legalName}</p>
                </div>

                <div className="entity-field">
                  <label>{t('tenancy.setup.registration_no')}</label>
                  <p>{profile.entity.registrationNo}</p>
                </div>

                <div className="entity-field">
                  <label>{t('tenancy.setup.registration_valid_to')}</label>
                  <div className="registration-status">
                    <p>{profile.entity.registrationValidTo}</p>
                    <StatusChip tone={registrationStatusTone}>
                      {t(`tenancy.setup.status_${profile.entity.registrationStatus}`)}
                    </StatusChip>
                  </div>
                </div>

                {profile.entity.principalOfficerName && (
                  <div className="entity-field">
                    <label>{t('tenancy.setup.principal_officer')}</label>
                    <p>{profile.entity.principalOfficerName}</p>
                  </div>
                )}

                <div className="entity-field scope-info">
                  <strong>{t('tenancy.setup.comparison_scope')}</strong>
                  <p>
                    {profile.entity.comparisonScope === 'MARKET_WIDE'
                      ? t('tenancy.setup.scope_market_wide')
                      : t('tenancy.setup.scope_tied_insurers')}
                  </p>
                </div>
              </>
            )}

            <hr />

            <GatedCapabilities t={t} />
          </div>
        </Card>

        <Card title={t('tenancy.setup.tieups_title')}>
          <TieUpsContent
            lines={tieUps.lines}
            editedTieUps={editedTieUps}
            newInsurers={newInsurers}
            saveError={saveError}
            onAddInsurer={handleAddInsurer}
            onRemoveInsurer={handleRemoveInsurer}
            onNewInsurerChange={(line, value) => setNewInsurers({ ...newInsurers, [line]: value })}
            t={t}
          />
        </Card>
      </div>

      <Card title={t('catalogue.table.title')}>
        <CatalogueTable />
      </Card>
    </div>
  );
}
