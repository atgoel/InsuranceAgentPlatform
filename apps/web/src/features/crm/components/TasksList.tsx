import { useT } from '../../../lib/i18n';
import { type TaskView } from '../api';

interface TasksListProps {
  tasks: TaskView[];
}

export function TasksList({ tasks }: TasksListProps) {
  const { t } = useT();

  if (tasks.length === 0) {
    return <div className="empty-tasks">{t('crm.lead.no_open_tasks')}</div>;
  }

  return (
    <ul className="tasks-list">
      {tasks.map((task) => (
        <li key={task.id} className="task-item">
          <div className="task-header">
            <h4>{task.title}</h4>
            <span className="task-kind">{task.kind}</span>
          </div>
          <div className="task-meta">
            <span className="label">{t('crm.task.due')}:</span>
            <span>{new Date(task.dueAt).toLocaleDateString()}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
