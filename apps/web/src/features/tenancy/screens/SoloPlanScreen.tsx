import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../../../lib/api';
import {
  Button,
  Card,
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createTenancyApi, EntitlementsResponse, TenantProfile } from '../api';
import '../styles/SoloPlanScreen.css';

export function SoloPlanScreen() {
  const api = useApi();
  const tenancyApi = useMemo(() => createTenancyApi(api), [api]);
  const { t } = useT();

  const [profile, setProfile] = useState<TenantProfile | undefined>();
  const [entitlements, setEntitlements] = useState<EntitlementsResponse | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [trialLoading, setTrialLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [prof, ent] = await Promise.all([
          tenancyApi.getTenantProfile(),
          tenancyApi.getEntitlements(),
        ]);
        setProfile(prof);
        setEntitlements(ent);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleStartTrial = async () => {
    setTrialLoading(true);
    try {
      const updated = await tenancyApi.startTrial();
      setProfile(updated);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      }
    } finally {
      setTrialLoading(false);
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

  if (!profile || !entitlements) {
    return <LoadingSkeleton />;
  }

  const isTrialActive = profile.trialEndsAt && new Date(profile.trialEndsAt) > new Date();
  const alertThreshold = entitlements.plan.alertThresholdPct;

  return (
    <div className="solo-plan-screen">
      <div className="page-header">
        <div>
          <h1>{t('tenancy.plan.title')}</h1>
          <p>{entitlements.plan.name}</p>
        </div>
      </div>

      {isTrialActive && (
        <div className="trial-banner">
          <p>
            {t('tenancy.plan.trial_active')}
            {profile.trialEndsAt && (
              <span>{new Date(profile.trialEndsAt).toLocaleDateString()}</span>
            )}
          </p>
        </div>
      )}

      <div className="plan-grid">
        {entitlements.usage.map(counter => {
          const percentUsed = counter.percentUsed ?? 0;
          const isWarning = percentUsed >= alertThreshold;

          return (
            <Card key={counter.metric} title={t(`tenancy.plan.metric_${counter.metric}`)}>
              <div className="usage-section">
                <div className="usage-stats">
                  <div className="usage-value">
                    {counter.used} / {counter.limit === null ? '∞' : counter.limit}
                  </div>
                  <div className="usage-percent">
                    {percentUsed}% {t('tenancy.plan.used')}
                  </div>
                </div>

                <div className="usage-bar">
                  <div
                    className="usage-fill"
                    style={{
                      width: `${Math.min(percentUsed, 100)}%`,
                      backgroundColor: isWarning ? '#F59E0B' : '#10B981',
                    }}
                  />
                </div>

                {isWarning && (
                  <div className="usage-warning">
                    {t('tenancy.plan.usage_warning', {
                      percent: percentUsed,
                    })}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {profile.planCode === 'SOLO' && !isTrialActive && (
        <Card title={t('tenancy.plan.trial_cta_title')}>
          <div className="trial-section">
            <p>{t('tenancy.plan.trial_cta_description')}</p>
            <Button
              onClick={handleStartTrial}
              loading={trialLoading}
              size="lg"
            >
              {t('tenancy.plan.start_trial')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
