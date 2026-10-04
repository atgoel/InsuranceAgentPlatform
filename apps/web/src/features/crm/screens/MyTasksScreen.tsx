import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../../lib/api';
import { CountChips, ErrorState, LoadingSkeleton, PageHeader, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type TaskKind } from '../api';
import { MyTaskGroups, type MyTaskGroup } from '../components/mobile/MyTaskGroups';
import '../styles/MyTasksScreen.css';

const KINDS: TaskKind[] = ['CALL', 'WHATSAPP', 'MEETING', 'DOCUMENT', 'FOLLOW_UP', 'RENEWAL'];
const ALL = 'ALL';

/** M17 My tasks (AC-M04-28): my open tasks by urgency, type filter, tick to complete with an outcome. */
export function MyTasksScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const [kind, setKind] = useState<TaskKind | undefined>();
  const [groups, setGroups] = useState<MyTaskGroup[] | undefined>();
  const [loadError, setLoadError] = useState<ApiError | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    crmApi.listTasks({ mine: true, kind }).then(
      (result) => {
        if (cancelled) return;
        setLoadError(undefined);
        setGroups(result.groups);
      },
      (err: unknown) => !cancelled && err instanceof ApiError && setLoadError(err),
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi, kind, reload]);

  const complete = useCallback(
    async (taskId: string, version: number, outcome?: string) => {
      setActionError(undefined);
      try {
        await crmApi.updateTask(taskId, version, { status: 'DONE', outcome });
        setReload((n) => n + 1);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.title : String(err));
      }
    },
    [crmApi],
  );

  if (loadError?.status === 403) return <PermissionDenied />;

  const options = [{ id: ALL, label: t('crm.myTasks.allTypes') }, ...KINDS.map((k) => ({ id: k, label: t(`crm.taskKind.${k.toLowerCase()}`) }))];
  return (
    <main className="my-tasks-screen">
      <PageHeader title={t('crm.myTasks.title')} subtitle={t('crm.myTasks.subtitle')} />
      <CountChips
        ariaLabel={t('crm.myTasks.type_filter')}
        options={options}
        selected={kind ?? ALL}
        onChange={(id) => setKind(id === ALL ? undefined : (id as TaskKind))}
      />
      {actionError && <p role="alert" className="action-error">{t('crm.myTasks.action_failed', { reason: actionError })}</p>}
      {loadError && <ErrorState error={loadError} />}
      {!groups && !loadError && <LoadingSkeleton />}
      {groups && <MyTaskGroups groups={groups} onComplete={complete} />}
    </main>
  );
}
