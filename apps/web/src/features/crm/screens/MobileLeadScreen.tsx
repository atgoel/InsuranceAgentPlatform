import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { ErrorState, LoadingSkeleton, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type LeadDetailView, type LeadStage, type LostReason, type Qualification } from '../api';
import { ConvertInput, MobileLeadBody } from '../components/mobile/MobileLeadBody';
import '../styles/MobileLeadScreen.css';

/** M16 lead record on the phone (AC-M04-26). A failed action is shown inline; the record stays on screen. */
export function MobileLeadScreen() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const [lead, setLead] = useState<LeadDetailView | undefined>();
  const [loadError, setLoadError] = useState<ApiError | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    crmApi.getLead(id).then(
      (result) => !cancelled && setLead(result),
      (err: unknown) => !cancelled && err instanceof ApiError && setLoadError(err),
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi, id]);

  const act = useCallback(async (work: () => Promise<void>) => {
    setActionError(undefined);
    try {
      await work();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.title : String(err));
    }
  }, []);

  if (loadError?.status === 403) return <PermissionDenied />;
  if (loadError) return <ErrorState error={loadError} />;
  if (!lead) return <LoadingSkeleton />;

  return (
    <main className="mobile-lead-screen">
      {actionError && <p role="alert" className="action-error">{t('crm.lead.action_failed', { reason: actionError })}</p>}
      <MobileLeadBody
        lead={lead}
        onStage={(to: LeadStage, lostReason?: string) => act(async () => setLead(await crmApi.transitionLeadStage(id, { to, lostReason: lostReason as LostReason | undefined })))}
        onQualify={(q: Qualification) => act(async () => setLead(await crmApi.updateLeadQualification(id, q)))}
        onConvert={(input: ConvertInput) => act(async () => {
          await crmApi.convertLead(id, input);
          navigate('/m/leads', { replace: true });
        })}
      />
    </main>
  );
}
