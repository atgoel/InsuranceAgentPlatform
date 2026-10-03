import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import {
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type LeadDetailView } from '../api';
import { LeadHeader } from '../components/LeadHeader';
import { StageBar } from '../components/StageBar';
import { QualificationForm } from '../components/QualificationForm';
import { ActivityComposer } from '../components/ActivityComposer';
import { ConvertSheet } from '../components/ConvertSheet';
import { TasksList } from '../components/TasksList';
import '../styles/LeadRecordScreen.css';

export function LeadRecordScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lead, setLead] = useState<LeadDetailView | undefined>();

  useEffect(() => {
    if (!id) return;
    const loadLead = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const result = await crmApi.getLead(id);
        setLead(result);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };
    loadLead();
  }, [id, crmApi]);

  const handleQualificationSaved = useCallback(
    async (qualification: any) => {
      if (!id || !lead) return;
      try {
        const updated = await crmApi.updateLeadQualification(id, qualification);
        setLead(updated);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [id, lead, crmApi]
  );

  const handleStageTransition = useCallback(
    async (toStage: any, lostReason?: string) => {
      if (!id) return;
      try {
        const updated = await crmApi.transitionLeadStage(id, { to: toStage, lostReason });
        setLead(updated);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [id, crmApi]
  );

  const handleActivityLogged = useCallback(
    async (_activityId: string) => {
      if (!id || !lead) return;
      try {
        const updated = await crmApi.getLead(id);
        setLead(updated);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [id, lead, crmApi]
  );

  const handleConvert = useCallback(
    async (conversion: any) => {
      if (!id) return;
      try {
        await crmApi.convertLead(id, conversion);
        const updated = await crmApi.getLead(id);
        setLead(updated);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [id, crmApi]
  );

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    if (error.status === 404) {
      return <ErrorState error={error} onRetry={() => window.history.back()} />;
    }
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }

  if (!lead) {
    return <ErrorState error={new ApiError('Not found', 404)} onRetry={() => window.history.back()} />;
  }

  return (
    <main className="lead-record-screen" role="main">
      <LeadHeader lead={lead} />

      <div className="lead-content">
        <section className="stage-section">
          <h2>{t('crm.lead.stage_title')}</h2>
          <StageBar
            currentStage={lead.stage}
            stageRules={lead.stageRules}
            onTransition={handleStageTransition}
          />
        </section>

        <section className="qualification-section">
          <h2>{t('crm.lead.qualification_title')}</h2>
          <QualificationForm
            qualification={lead.qualification}
            onSaved={handleQualificationSaved}
          />
        </section>

        {lead.stage === 'QUALIFIED' && (
          <section className="convert-section">
            <h2>{t('crm.lead.convert_title')}</h2>
            <ConvertSheet
              lead={lead}
              onConvert={handleConvert}
            />
          </section>
        )}

        <section className="activity-section">
          <h2>{t('crm.lead.activity_title')}</h2>
          <ActivityComposer
            leadId={lead.id}
            onActivityLogged={handleActivityLogged}
          />
          {lead.activities && lead.activities.length > 0 && (
            <div className="activity-timeline">
              {lead.activities.map((activity) => (
                <div key={activity.id} className="activity-item">
                  <div className="activity-kind">{activity.kind}</div>
                  <div className="activity-summary">{activity.summary}</div>
                  <div className="activity-time">{new Date(activity.occurredAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {lead.openTasks && lead.openTasks.length > 0 && (
          <section className="tasks-section">
            <h2>{t('crm.lead.tasks_title')}</h2>
            <TasksList tasks={lead.openTasks} />
          </section>
        )}
      </div>
    </main>
  );
}
