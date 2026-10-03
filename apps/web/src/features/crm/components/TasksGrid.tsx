import { useT } from '../../../lib/i18n';
import { type TaskView } from '../api';

interface TaskGroup {
  bucket: string;
  items: TaskView[];
}

interface TasksGridProps {
  groups: TaskGroup[];
  onTaskCompleted: (taskId: string, version: number, outcome?: string) => void;
}

export function TasksGrid({ groups, onTaskCompleted }: TasksGridProps) {
  const { t } = useT();

  const getBucketLabel = (bucket: string): string => {
    switch (bucket) {
      case 'OVERDUE':
        return t('crm.tasks.bucket_overdue');
      case 'TODAY':
        return t('crm.tasks.bucket_today');
      case 'UPCOMING':
        return t('crm.tasks.bucket_upcoming');
      default:
        return bucket;
    }
  };

  return (
    <div className="tasks-grid">
      {groups.map((group) => (
        <div key={group.bucket} className="task-group">
          <h3 className="group-header">{getBucketLabel(group.bucket)}</h3>
          {group.items.length === 0 ? (
            <p className="empty-group">{t('crm.tasks.no_tasks')}</p>
          ) : (
            <ul className="task-items">
              {group.items.map((task) => (
                <li key={task.id} className="task-row">
                  <div className="task-info">
                    <input
                      type="checkbox"
                      checked={task.status === 'DONE'}
                      onChange={() => onTaskCompleted(task.id, task.version)}
                      aria-label={`Complete task: ${task.title}`}
                    />
                    <div className="task-details">
                      <h4>{task.title}</h4>
                      <div className="task-meta">
                        <span className="kind">{task.kind}</span>
                        <span className="due">{new Date(task.dueAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                  {task.outcome && (
                    <div className="task-outcome">{task.outcome}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
