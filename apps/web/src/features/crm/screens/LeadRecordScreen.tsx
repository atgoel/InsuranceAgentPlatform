import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { PageContainer, LoadingSkeleton, ErrorState, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type LeadDetailView, type LeadStage, type ProductLine, type Qualification, type LostReason } from '../api';
import { LeadHeader } from '../components/LeadHeader';
import { LeadCustomFields } from '../components/LeadCustomFields';
import { StageBar } from '../components/StageBar';
import { QualificationForm } from '../components/QualificationForm';
import { ActivityComposer } from '../components/ActivityComposer';
import { ActivityTimeline } from '../components/ActivityTimeline';
import { ConvertSheet } from '../components/ConvertSheet';
import { TasksList } from '../components/TasksList';
import { PossibleMatchBanner } from '../components/PossibleMatchBanner';
import { ContactCard, ConsentCard, AttributionCard } from '../components/LeadInfoCards';
import '../styles/crm-frame.css';
import '../styles/LeadRecordScreen.css';

type ConvertInput = {
  partyChoice: 'LEAD_PARTY' | { existingPartyId: string };
  productInterest: ProductLine;
  expectedPremiumPaise: number;
  startStage: 'DISCOVERY' | 'QUOTE_SHARED';
};

/** Runs a lead action; a failure is returned as its inline title and never replaces the record. */
function useLeadActions(crmApi: ReturnType<typeof createCrmApi>, id: string | undefined, setLead: (lead: LeadDetailView) => void) {
  const [actionError, setActionError] = useState<string | undefined>();

  const run = useCallback(
    async (action: () => Promise<LeadDetailView | undefined>) => {
      try {
        setActionError(undefined);
        const updated = await action();
        if (updated) setLead(updated);
      } catch (err) {
        setActionError(err instanceof ApiError ? err.title : undefined);
      }
    },
    [setLead],
  );

  const saveQualification = useCallback(
    (q: Qualification) => (id ? run(() => crmApi.updateLeadQualification(id, q)) : undefined),
    [id, crmApi, run],
  );
  const transition = useCallback(
    (to: LeadStage, lostReason?: string) =>
      id ? run(() => crmApi.transitionLeadStage(id, { to, lostReason: lostReason as LostReason | undefined })) : undefined,
    [id, crmApi, run],
  );
  const refresh = useCallback(() => (id ? run(() => crmApi.getLead(id)) : undefined), [id, crmApi, run]);
  const convert = useCallback(
    (input: ConvertInput) =>
      id
        ? run(async () => {
            await crmApi.convertLead(id, input);
            return crmApi.getLead(id);
          })
        : undefined,
    [id, crmApi, run],
  );
  const link = useCallback((partyId: string) => (id ? run(() => crmApi.linkLeadToParty(id, partyId)) : undefined), [id, crmApi, run]);

  return { actionError, saveQualification, transition, refresh, convert, link };
}

function LeadSections({ lead, actions }: { lead: LeadDetailView; actions: ReturnType<typeof useLeadActions> }) {
  const { t } = useT();
  return (
    <div className="lead-content">
      <section className="stage-section">
        <h2>{t('crm.lead.stage_title')}</h2>
        <StageBar currentStage={lead.stage} stageRules={lead.stageRules} onTransition={actions.transition} />
      </section>
      <section className="qualification-section">
        <h2>{t('crm.lead.qualification_title')}</h2>
        <QualificationForm qualification={lead.qualification} onSaved={actions.saveQualification} />
      </section>
      {lead.stage === 'QUALIFIED' && (
        <section className="convert-section">
          <h2>{t('crm.lead.convert_title')}</h2>
          <ConvertSheet lead={lead} onConvert={actions.convert} />
        </section>
      )}
      <section className="activity-section">
        <h2>{t('crm.lead.activity_title')}</h2>
        <ActivityComposer leadId={lead.id} onActivityLogged={actions.refresh} />
        <ActivityTimeline activities={lead.activities ?? []} />
      </section>
      {lead.openTasks && lead.openTasks.length > 0 && (
        <section className="tasks-section">
          <h2>{t('crm.lead.tasks_title')}</h2>
          <TasksList tasks={lead.openTasks} />
        </section>
      )}
    </div>
  );
}

export function LeadRecordScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [lead, setLead] = useState<LeadDetailView | undefined>();
  const actions = useLeadActions(crmApi, id, setLead);

  useEffect(() => {
    if (!id) return;
    const loadLead = async () => {
      try {
        setLoading(true);
        setError(undefined);
        setLead(await crmApi.getLead(id));
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };
    void loadLead();
  }, [id, crmApi]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} onRetry={() => (error.status === 404 ? window.history.back() : window.location.reload())} />;
  }

  if (!lead) {
    return <ErrorState error={new ApiError(404, 'not_found', 'Not found')} onRetry={() => window.history.back()} />;
  }

  return (
    <div className="crm-screen-frame">
      <PageContainer width="wide">
        <main className="lead-record-screen">
          {actions.actionError && (
            <p role="alert" className="action-error">
              {t('crm.lead.action_failed', { reason: actions.actionError })}
            </p>
          )}
          <LeadHeader lead={lead} />
          <PossibleMatchBanner matches={lead.possibleMatches ?? []} onLink={actions.link} />
          <LeadCustomFields lead={lead} onUpdated={setLead} />
          <div className="lead-layout">
            <LeadSections lead={lead} actions={actions} />
            <aside className="lead-aside">
              <ContactCard lead={lead} />
              <ConsentCard lead={lead} />
              {lead.attribution && <AttributionCard lead={lead} />}
            </aside>
          </div>
        </main>
      </PageContainer>
    </div>
  );
}
