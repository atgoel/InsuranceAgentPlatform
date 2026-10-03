import { Button } from '../Button';
import './EmptyState.css';

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: { label: string; onClick(): void };
}

export function EmptyState({ title, body, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">📭</div>
      <h2 className="empty-state-title">{title}</h2>
      {body && <p className="empty-state-body">{body}</p>}
      {action && (
        <Button onClick={action.onClick} size="lg">
          {action.label}
        </Button>
      )}
    </div>
  );
}
