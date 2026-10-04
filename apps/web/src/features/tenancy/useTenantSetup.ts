import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../lib/api';
import { ApiError } from '../../lib/api/api-error';
import { useT } from '../../lib/i18n';
import { createTenancyApi, type FeatureFlag, type LineOfBusiness, type TenantProfile, type TieUp, type TieUpsResponse } from './api';
import { istToday } from './components/istToday';

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : ApiError.network(err instanceof Error ? err : new Error(String(err)));
}

interface Loaded {
  profile: TenantProfile;
  tieUps: TieUpsResponse;
  flags: FeatureFlag[];
}

/** State and actions of the tenant setup screen; failed actions report inline and never replace the screen. */
export function useTenantSetup() {
  const api = useApi();
  const tenancyApi = useMemo(() => createTenancyApi(api), [api]);
  const { t } = useT();
  const [data, setData] = useState<Loaded | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [edited, setEdited] = useState<TieUp[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();
  const [flagBusy, setFlagBusy] = useState(false);
  const [flagError, setFlagError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    Promise.all([tenancyApi.getTenantProfile(), tenancyApi.getTieUps(), tenancyApi.getFeatureFlags()])
      .then(([profile, tieUps, flags]) => {
        if (cancelled) return;
        setData({ profile, tieUps, flags: flags.items });
        setEdited(tieUps.lines.flatMap((l) => l.active));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(asApiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tenancyApi]);

  const add = useCallback(
    (line: LineOfBusiness) => {
      const insurerId = (drafts[line] ?? '').trim();
      if (!insurerId) return;
      setEdited((prev) => [...prev, { insurerId, line, effectiveFrom: istToday() }]);
      setDrafts((prev) => ({ ...prev, [line]: '' }));
    },
    [drafts],
  );

  const remove = useCallback((insurerId: string, line: LineOfBusiness) => {
    setEdited((prev) => prev.filter((x) => !(x.insurerId === insurerId && x.line === line)));
  }, []);

  const setDraft = useCallback((line: LineOfBusiness, value: string) => setDrafts((prev) => ({ ...prev, [line]: value })), []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(undefined);
    try {
      await tenancyApi.updateTieUps(edited);
      const tieUps = await tenancyApi.getTieUps();
      setData((prev) => (prev ? { ...prev, tieUps } : prev));
    } catch (err) {
      const problem = asApiError(err);
      setSaveError(problem.code === 'tie_up_limit_exceeded' ? t('tenancy.tie_up_limit_exceeded') : problem.title);
    } finally {
      setSaving(false);
    }
  }, [tenancyApi, edited, t]);

  const changeFlag = useCallback(async (call: () => Promise<FeatureFlag>) => {
    setFlagBusy(true);
    setFlagError(undefined);
    try {
      const flag = await call();
      setData((prev) => (prev ? { ...prev, flags: prev.flags.map((f) => (f.key === flag.key ? flag : f)) } : prev));
    } catch (err) {
      setFlagError(asApiError(err).title);
    } finally {
      setFlagBusy(false);
    }
  }, []);

  const recordReview = useCallback(
    (reviewRef: string) => changeFlag(() => tenancyApi.recordComplianceReview('online_purchase', reviewRef)),
    [changeFlag, tenancyApi],
  );
  const setOnline = useCallback(
    (enabled: boolean) => changeFlag(() => tenancyApi.updateFeatureFlag('online_purchase', enabled)),
    [changeFlag, tenancyApi],
  );

  return { data, error, edited, drafts, saving, saveError, flagBusy, flagError, add, remove, setDraft, save, recordReview, setOnline };
}
