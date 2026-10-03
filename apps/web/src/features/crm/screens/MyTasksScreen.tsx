import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../../lib/api';
import { ErrorState, LoadingSkeleton, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type TaskKind, type TaskView } from '../api';
import { TasksGrid } from '../components/TasksGrid';
import '../styles/MyTasksScreen.css';

const KINDS: TaskKind[] = ['CALL', 'WHATSAPP', 'MEETING', 'DOCUMENT', 'FOLLOW_UP', 'RENEWAL'];

/** M17 My tasks (AC-M04-28): my open tasks by urgency, type filter, tick to complete with an outcome. */
export function MyTasksScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const [kind, setKind] = useState<TaskKind | undefined>();
  const [groups, setGroups] = useState<Array<{ bucket: string; items: TaskView[] }> | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    crmApi.listTasks({ mine: true, kind }).then(
      (result) => !cancelled && setGroups(result.groups),
      (err: unknown) => !cancelled && err instanceof ApiError && setError(err),
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi, kind, reload]);

  const complete = useCallback(async (taskId: string, version: number, outcome?: string) => {
    try {
      await crmApi.updateTask(taskId, version, { status: 'DONE', outcome });
      setReload((n) => n + 1);
    } catch (err) {
      if (err instanceof ApiError) setError(err);
    }
  }, [crmApi]);

  if (error?.status === 403) return <PermissionDenied />;
  if (error) return <ErrorState error={error} />;
  if (!groups) return <LoadingSkeleton />;

  return (
    <main className="my-tasks-screen">
      <h1>{t('crm.myTasks.title')}</h1>
      <div role="group" aria-label={t('crm.myTasks.type_filter')} className="type-filter-chips">
        <button type="button" className="chip" aria-pressed={kind === undefined} onClick={() => setKind(undefined)}>{t('crm.myTasks.allTypes')}</button>
        {KINDS.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`crm.taskKind.${k.toLowerCase()}`)}</button>
        ))}
      </div>
      <TasksGrid groups={groups} onTaskCompleted={complete} />
    </main>
  );
}
