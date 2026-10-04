import { KpiRow, KpiTile } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { LeadStats } from '../api';

function percent(value: number | null): string {
  return value === null ? '—' : `${value}%`;
}

/** KPI tiles from GET /leads/stats (CRM01). */
export function LeadsKpis({ stats }: { stats?: LeadStats }) {
  const { t } = useT();
  if (!stats) {
    return null;
  }
  return (
    <KpiRow>
      <KpiTile label={t('crm.leads.kpi.open')} value={stats.open} />
      <KpiTile label={t('crm.leads.kpi.unassigned')} value={stats.unassigned} caption={t('crm.leads.kpi.unassigned_caption')} />
      <KpiTile label={t('crm.leads.kpi.sla_met_7d')} value={percent(stats.slaMetPct7d)} />
      <KpiTile
        label={t('crm.leads.kpi.lead_to_issued_90d')}
        value={percent(stats.leadToIssuedPct90d)}
        caption={t('crm.leads.kpi.insurer_confirmed_only')}
      />
    </KpiRow>
  );
}
