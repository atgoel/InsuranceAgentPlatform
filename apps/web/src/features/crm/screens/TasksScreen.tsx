import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../../../lib/api';
import {
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type TaskView } from '../api';
import { TasksGrid } from '../components/TasksGrid';
import { NewTaskForm } from '../components/NewTaskForm';
import '../styles/TasksScreen.css';

interface TaskGroup {
  bucket: string;
  items: TaskView[];
}

export function TasksScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [taskTab, setTaskTab] = useState<'my' | 'team'>('my');
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const result = await crmApi.listTasks({ mine: taskTab === 'my' });
        setGroups(result.groups);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };
    loadTasks();
  }, [crmApi, taskTab]);

  const handleTaskCreated = useCallback(
    async (taskId: string) => {
      try {
        setShowNewTaskForm(false);
        // Reload tasks
        const result = await crmApi.listTasks({ mine: taskTab === 'my' });
        setGroups(result.groups);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [crmApi, taskTab]
  );

  const handleTaskCompleted = useCallback(
    async (taskId: string, version: number, outcome?: string) => {
      try {
        const etag = `"v${version}"`;
        await crmApi.updateTask(taskId, { status: 'DONE', outcome }, etag);
        // Reload tasks
        const result = await crmApi.listTasks({ mine: taskTab === 'my' });
        setGroups(result.groups);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [crmApi, taskTab]
  );

  if (loading && groups.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <main className="tasks-screen" role="main">
      <div className="screen-header">
        <h1>{t('crm.tasks.title')}</h1>
        <button
          className="btn btn-primary"
          onClick={() => setShowNewTaskForm(true)}
          aria-label={t('crm.tasks.new_task')}
        >
          {t('crm.tasks.new_task')}
        </button>
      </div>

      <div className="tabs">
        <button
          className={`tab ${taskTab === 'my' ? 'active' : ''}`}
          onClick={() => setTaskTab('my')}
        >
          {t('crm.tasks.tab_my')}
        </button>
        <button
          className={`tab ${taskTab === 'team' ? 'active' : ''}`}
          onClick={() => setTaskTab('team')}
        >
          {t('crm.tasks.tab_team')}
        </button>
      </div>

      <div className="cadence-rules-card">
        <h3>{t('crm.tasks.cadence_rules')}</h3>
        <p>{t('crm.tasks.cadence_rules_text')}</p>
      </div>

      <TasksGrid
        groups={groups}
        onTaskCompleted={handleTaskCompleted}
      />

      {showNewTaskForm && (
        <NewTaskForm
          onClose={() => setShowNewTaskForm(false)}
          onSubmitted={handleTaskCreated}
        />
      )}
    </main>
  );
}
