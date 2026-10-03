import { Card } from '../../../design-system';

interface StageStats {
  invited: number;
  onboarding: number;
  active: number;
  suspended: number;
}

interface StatsKPIsProps {
  stats: StageStats;
}

export function StatsKPIs({ stats }: StatsKPIsProps) {
  return (
    <div className="kpi-tiles">
      <Card>
        <div className="kpi-content">
          <div className="kpi-value">{stats.invited}</div>
          <div className="kpi-label">Invited</div>
        </div>
      </Card>
      <Card>
        <div className="kpi-content">
          <div className="kpi-value">{stats.onboarding}</div>
          <div className="kpi-label">In Progress</div>
        </div>
      </Card>
      <Card>
        <div className="kpi-content">
          <div className="kpi-value">{stats.active}</div>
          <div className="kpi-label">Active</div>
        </div>
      </Card>
      <Card>
        <div className="kpi-content">
          <div className="kpi-value">{stats.suspended}</div>
          <div className="kpi-label">Suspended</div>
        </div>
      </Card>
    </div>
  );
}
