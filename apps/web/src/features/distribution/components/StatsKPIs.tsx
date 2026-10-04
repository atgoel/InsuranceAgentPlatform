import { KpiRow, KpiTile } from '../../../design-system';
import { useT } from '../../../lib/i18n';

interface StatsKPIsProps {
  /** Members still invited or in onboarding. */
  inOnboarding: number;
  /** Licences expiring within 60 days; undefined while unknown (the count is optional and its failure is not fatal). */
  licencesExpiring?: number;
}

/** The two tiles the LLD lists for the onboarding screen (M02 section 9). */
export function StatsKPIs({ inOnboarding, licencesExpiring }: StatsKPIsProps) {
  const { t } = useT();
  return (
    <KpiRow>
      <KpiTile label={t('distribution.onboarding.kpi_in_onboarding')} value={inOnboarding} />
      <KpiTile
        label={t('distribution.onboarding.kpi_licences')}
        value={licencesExpiring ?? t('distribution.onboarding.kpi_unknown')}
        tone={licencesExpiring ? 'warn' : 'neutral'}
      />
    </KpiRow>
  );
}
