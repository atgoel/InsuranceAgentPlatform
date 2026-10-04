import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import { Button, formatIstDate } from '../../../design-system';
import { type TaskView } from '../api';

interface TaskGroup {
  bucket: string;
  items: TaskView[];
}

interface TasksGridProps {
  groups: TaskGroup[];
  onTaskCompleted: (taskId: string, version: number, outcome?: string) => void;
}

const BUCKET_KEYS: Record<string, string> = { OVERDUE: 'crm.tasks.bucket_overdue', TODAY: 'crm.tasks.bucket_today', UPCOMING: 'crm.tasks.bucket_upcoming' };

/** Overdue / Today / Upcoming groups (server-computed buckets). Ticking a task asks for its outcome before completing (AC-M04-28). */
export function TasksGrid({ groups, onTaskCompleted }: TasksGridProps) {
  const { t, lang } = useT();
  const [completing, setCompleting] = useState<string | undefined>();

  return (
    <div className="tasks-grid">
      {groups.map((group) => (
        <section key={group.bucket} className="task-group" aria-label={t(BUCKET_KEYS[group.bucket] ?? group.bucket)}>
          <h3 className="group-header">{t(BUCKET_KEYS[group.bucket] ?? group.bucket)}</h3>
          {group.items.length === 0 ? (
            <p className="empty-group">{t('crm.tasks.no_tasks')}</p>
          ) : (
            <ul className="task-items">
              {group.items.map((task) => (
                <li key={task.id} className="task-row">
                  <div className="task-info">
                    <input
                      type="checkbox"
                      checked={completing === task.id}
                      onChange={() => setCompleting(completing === task.id ? undefined : task.id)}
                      aria-label={t('crm.tasks.complete_task', { title: task.title })}
                    />
                    <div className="task-details">
                      <h4>{task.title}</h4>
                      <div className="task-meta">
                        <span className="kind">{t(`crm.taskKind.${task.kind.toLowerCase()}`)}</span>
                        <span className="due">{formatIstDate(task.dueAt, lang)}</span>
                      </div>
                    </div>
                  </div>
                  {completing === task.id && (
                    <OutcomeForm
                      title={task.title}
                      onCancel={() => setCompleting(undefined)}
                      onDone={(outcome) => {
                        setCompleting(undefined);
                        onTaskCompleted(task.id, task.version, outcome);
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}

function OutcomeForm({ title, onCancel, onDone }: { title: string; onCancel(): void; onDone(outcome?: string): void }) {
  const { t } = useT();
  const [outcome, setOutcome] = useState('');
  return (
    <form
      className="task-outcome-form"
      onSubmit={(e) => {
        e.preventDefault();
        onDone(outcome.trim() || undefined);
      }}
    >
      <label>
        {t('crm.tasks.outcome_label', { title })}
        <input value={outcome} maxLength={500} onChange={(e) => setOutcome(e.target.value)} />
      </label>
      <Button type="submit">{t('crm.tasks.mark_done')}</Button>
      <Button type="button" variant="secondary" onClick={onCancel}>{t('common.cancel')}</Button>
    </form>
  );
}
