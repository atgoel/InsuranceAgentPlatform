import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { Button, ErrorState, LoadingSkeleton, PageContainer, PageHeader, PermissionDenied, StatusChip, formatIstDate } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createAdviceApi, type AdviceView, type MissingItem } from '../api';
import { ChoiceSection, MissingChecklist, NotesSection, RecommendationsSection, RunsSection } from '../components/AdviceSections';
import { InlineError } from '../components/InlineError';
import '../styles/advice.css';

function missingFrom(err: ApiError): MissingItem[] | undefined {
  const list = err.details?.missing;
  return Array.isArray(list) ? (list as MissingItem[]) : undefined;
}

export function AdviceRecordScreen() {
  const api = useApi();
  const adviceApi = useMemo(() => createAdviceApi(api), [api]);
  const { t, lang } = useT();
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ApiError | undefined>();
  const [view, setView] = useState<AdviceView | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [serverMissing, setServerMissing] = useState<MissingItem[] | undefined>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setLoadError(undefined);
        const result = await adviceApi.getAdvice(id);
        if (!cancelled) setView(result);
      } catch (err) {
        if (!cancelled && err instanceof ApiError) setLoadError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [adviceApi, id]);

  /** Runs a mutation; a failure is shown inline and the record stays on screen. Resolves true on success. */
  const act = useCallback(async (fn: () => Promise<AdviceView>): Promise<boolean> => {
    setBusy(true);
    setActionError(undefined);
    try {
      setView(await fn());
      setServerMissing(undefined);
      return true;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setActionError(err.title);
      setServerMissing(missingFrom(err));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (loadError) return loadError.status === 403 ? <PermissionDenied /> : <ErrorState error={loadError} />;
  if (!view) return null;

  const readOnly = view.status === 'FINALISED';
  const common = { view, readOnly, busy };
  return (
    <PageContainer>
      <PageHeader
        title={t('advice.record.title')}
        subtitle={t('advice.record.subtitle')}
        actions={<StatusChip tone={readOnly ? 'ok' : 'warn'}>{t(`advice.status.${view.status}`)}</StatusChip>}
      />
      {readOnly && view.finalisedAt && <p>{t('advice.record.finalised_on', { date: formatIstDate(view.finalisedAt, lang) })}</p>}
      <p className="advice-banner" role="note">
        {view.scope.disclosure}
      </p>
      <InlineError message={actionError} />
      {!readOnly && <MissingChecklist missing={serverMissing ?? view.missing} />}
      <RunsSection view={view} />
      <RecommendationsSection {...common} onAdd={(versionId, rationale) => act(() => adviceApi.addRecommendation(view.id, versionId, rationale))} />
      <ChoiceSection {...common} onSave={(versionId, reason) => act(() => adviceApi.setCustomerChoice(view.id, view.version, versionId, reason))} />
      <NotesSection {...common} onSave={(text) => act(() => adviceApi.saveNotes(view.id, view.version, text))} />
      {!readOnly && (
        <Button loading={busy} onClick={() => act(() => adviceApi.finalise(view.id))}>
          {t('advice.record.finalise')}
        </Button>
      )}
    </PageContainer>
  );
}
