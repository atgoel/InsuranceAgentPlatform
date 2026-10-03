import './Timeline.css';
import { Tone } from './StatusChip';

export interface TimelineItem {
  id: string;
  at: string;
  title: string;
  detail?: string;
  tone?: Tone;
}

export interface TimelineProps {
  items: TimelineItem[];
}

export function Timeline({ items }: TimelineProps) {
  return (
    <div className="timeline">
      {items.map(item => (
        <div key={item.id} className="timeline-item">
          <div className={`timeline-dot ${item.tone || 'neutral'}`} />
          <div className="timeline-content">
            <div className="timeline-time">{item.at}</div>
            <div className="timeline-title">{item.title}</div>
            {item.detail && <div className="timeline-detail">{item.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
