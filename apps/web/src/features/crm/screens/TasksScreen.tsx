import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../../../lib/api';
import {
  PageContainer,
  PageHeader,
  KpiRow,
  KpiTile,
  CountChips,
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
  type CountChipOption,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type TaskKind, type TaskView } from '../api';
import { TasksGrid } from '../components/TasksGrid';
import { NewTaskForm } from '../components/NewTaskForm';
import '../styles/crm-frame.css';
import '../styles/TasksScreen.css';

interface TaskGroup {
  bucket: string;
  items: TaskView[];
}

interface Counts {
  overdue: number;
  today: number;
  upcoming: number;
}

interface TasksState {
  loading: boolean;
  error?: ApiError;
  groups: TaskGroup[];
  counts?: Counts;
}

const KINDS: TaskKind[] = ['CALL', 'WHATSAPP', 'MEETING', 'DOCUMENT', 'FOLLOW_UP', 'RENEWAL'];

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, 'network_error', 'Network error');
}

function TasksKpis({ counts }: { counts?: Counts }) {
  const { t } = useT();
  if (!counts) {
    return null;
  }
  return (
    <KpiRow>
      <KpiTile label={t('crm.tasks.kpi_overdue')} value={counts.overdue} tone={counts.overdue > 0 ? 'bad' : 'neutral'} />
      <KpiTile label={t('crm.tasks.kpi_today')} value={counts.today} />
      <KpiTile label={t('crm.tasks.kpi_upcoming')} value={counts.upcoming} />
    </KpiRow>
  );
}

function TasksFilters(props: { scope: string; onScope: (id: string) => void; kind: string; onKind: (id: string) => void }) {
  const { t } = useT();
  const scopes: CountChipOption[] = [
    { id: 'my', label: t('crm.tasks.tab_my') },
    { id: 'team', label: t('crm.tasks.tab_team') },
  ];
  const kinds: CountChipOption[] = [
    { id: 'ALL', label: t('crm.tasks.kind_all') },
    ...KINDS.map((k) => ({ id: k, label: t(`crm.taskKind.${k.toLowerCase()}`) })),
  ];
  return (
    <div className="tasks-filters">
      <CountChips options={scopes} selected={props.scope} onChange={props.onScope} ariaLabel={t('crm.tasks.scope_label')} />
      <CountChips options={kinds} selected={props.kind} onChange={props.onKind} ariaLabel={t('crm.tasks.kind_filter')} />
    </div>
  );
}

export function TasksScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [state, setState] = useState<TasksState>({ loading: true, groups: [] });
  const [scope, setScope] = useState('my');
  const [kind, setKind] = useState('ALL');
  const [reloadKey, setReloadKey] = useState(0);
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  /** A failed completion is shown inline; the task list stays on screen. */
  const [actionError, setActionError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      try {
        const result = await crmApi.listTasks({ mine: scope === 'my', kind: kind === 'ALL' ? undefined : (kind as TaskKind) });
        if (!cancelled) setState({ loading: false, groups: result.groups, counts: result.counts });
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: asApiError(err) }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [crmApi, scope, kind, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const handleTaskCreated = useCallback(() => {
    setShowNewTaskForm(false);
    reload();
  }, [reload]);

  const handleTaskCompleted = useCallback(
    async (taskId: string, version: number, outcome?: string) => {
      try {
        setActionError(undefined);
        await crmApi.updateTask(taskId, version, { status: 'DONE', outcome });
        reload();
      } catch (err) {
        setActionError(asApiError(err).title);
      }
    },
    [crmApi, reload],
  );

  if (state.error?.status === 403) {
    return <PermissionDenied />;
  }

  return (
    <div className="crm-screen-frame">
      <PageContainer width="wide">
        <PageHeader
          title={t('crm.tasks.title')}
          subtitle={t('crm.tasks.subtitle')}
          actions={
            <button type="button" className="btn btn-primary" onClick={() => setShowNewTaskForm(true)}>
              {t('crm.tasks.new_task')}
            </button>
          }
        />
        {actionError && (
          <p role="alert" className="action-error">
            {t('crm.lead.action_failed', { reason: actionError })}
          </p>
        )}
        <TasksKpis counts={state.counts} />
        <TasksFilters scope={scope} onScope={setScope} kind={kind} onKind={setKind} />
        {state.error && <ErrorState error={state.error} onRetry={reload} />}
        {!state.error && state.loading && state.groups.length === 0 && <LoadingSkeleton />}
        {!state.error && !(state.loading && state.groups.length === 0) && <TasksGrid groups={state.groups} onTaskCompleted={handleTaskCompleted} />}
        <div className="cadence-rules-card">
          <h3>{t('crm.tasks.cadence_rules')}</h3>
          <p>{t('crm.tasks.cadence_rules_text')}</p>
        </div>
        {showNewTaskForm && <NewTaskForm onClose={() => setShowNewTaskForm(false)} onSubmitted={handleTaskCreated} />}
      </PageContainer>
    </div>
  );
}
