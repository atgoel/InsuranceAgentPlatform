import { useState } from 'react';
import { Button } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { TaskView } from '../../api';
import { formatIstDateTime } from '../format-due';

export interface MyTaskGroup {
  bucket: string;
  items: TaskView[];
}

interface MyTaskGroupsProps {
  groups: MyTaskGroup[];
  onComplete(taskId: string, version: number, outcome?: string): void;
}

const BUCKET_KEYS: Record<string, string> = {
  OVERDUE: 'crm.tasks.bucket_overdue',
  TODAY: 'crm.tasks.bucket_today',
  UPCOMING: 'crm.tasks.bucket_upcoming',
};

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

interface TaskRowProps {
  task: TaskView;
  open: boolean;
  onToggle(): void;
  onComplete(taskId: string, version: number, outcome?: string): void;
}

function TaskRow({ task, open, onToggle, onComplete }: TaskRowProps) {
  const { t, lang } = useT();
  return (
    <li className="task-row">
      <div className="task-info">
        <input type="checkbox" checked={open} onChange={onToggle} aria-label={t('crm.tasks.complete_task', { title: task.title })} />
        <div className="task-details">
          <div className="task-title">{task.title}</div>
          <div className="task-meta">
            <span className="kind">{t(`crm.taskKind.${task.kind.toLowerCase()}`)}</span>
            <span className="due">{formatIstDateTime(task.dueAt, lang)}</span>
          </div>
        </div>
      </div>
      {open && (
        <OutcomeForm
          title={task.title}
          onCancel={onToggle}
          onDone={(outcome) => {
            onToggle();
            onComplete(task.id, task.version, outcome);
          }}
        />
      )}
    </li>
  );
}

/** Overdue / Today / Upcoming groups with counts (buckets are computed by the server). Ticking a task asks for its outcome. */
export function MyTaskGroups({ groups, onComplete }: MyTaskGroupsProps) {
  const { t } = useT();
  const [completing, setCompleting] = useState<string | undefined>();
  return (
    <div className="tasks-grid">
      {groups.map((group) => {
        const name = t(BUCKET_KEYS[group.bucket] ?? 'crm.tasks.title');
        return (
          <section key={group.bucket} className="task-group" aria-label={name}>
            <h2 className="group-header">{`${name} · ${group.items.length}`}</h2>
            {group.items.length === 0 ? (
              <p className="empty-group">{t('crm.tasks.no_tasks')}</p>
            ) : (
              <ul className="task-items">
                {group.items.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    open={completing === task.id}
                    onToggle={() => setCompleting(completing === task.id ? undefined : task.id)}
                    onComplete={onComplete}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
