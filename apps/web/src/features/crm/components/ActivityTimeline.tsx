import { formatIstDate } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { Activity } from '../api';

const KNOWN_KINDS = new Set(['CALL', 'NOTE', 'WHATSAPP', 'SMS', 'EMAIL', 'MEETING', 'VOICE_NOTE']);

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  const { t, lang } = useT();
  if (activities.length === 0) {
    return null;
  }
  return (
    <div className="activity-timeline">
      {activities.map((activity) => (
        <div key={activity.id} className="activity-item">
          <div className="activity-kind">{KNOWN_KINDS.has(activity.kind) ? t(`crm.activityKind.${activity.kind}`) : activity.kind}</div>
          <div className="activity-summary">{activity.summary}</div>
          <div className="activity-time">{formatIstDate(activity.occurredAt, lang)}</div>
        </div>
      ))}
    </div>
  );
}
