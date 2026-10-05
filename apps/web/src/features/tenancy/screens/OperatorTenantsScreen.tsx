import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../../lib/api';
import {
  Button,
  ErrorState,
  KpiRow,
  KpiTile,
  LoadingSkeleton,
  PageContainer,
  PageHeader,
  PermissionDenied,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createTenancyApi, type Plan, type ProvisionTenantInput, type ProvisionTenantResponse, type TenantSummary } from '../api';
import { PlanCards } from '../components/PlanCards';
import { ProvisionTenantSheet } from '../components/ProvisionTenantSheet';
import { TenantStatusSheet, type TenantStatusTarget } from '../components/TenantStatusSheet';
import { TenantsTable } from '../components/TenantsTable';
import '../styles/OperatorTenantsScreen.css';

const PAGE_SIZE = 50;

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : ApiError.network(err instanceof Error ? err : new Error(String(err)));
}

/** KPI tiles count the first page only, so a further page makes the figure a lower bound. */
function kpiCount(count: number, hasMore: boolean): string {
  return hasMore ? `${count}+` : String(count);
}

function ProvisionNotice({ result }: { result: ProvisionTenantResponse }) {
  const { t } = useT();
  if (result.failedStep) {
    return (
      <p role="alert" className="operator-error">
        {t('tenancy.operator.provision_incomplete', { step: result.failedStep })}
      </p>
    );
  }
  return (
    <p role="status" className="operator-ok">
      {t('tenancy.operator.provisioned', { host: result.host })}
    </p>
  );
}

export function OperatorTenantsScreen() {
  const api = useApi();
  const tenancyApi = useMemo(() => createTenancyApi(api), [api]);
  const { t } = useT();

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<ApiError | undefined>();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState<TenantStatusTarget | undefined>();
  const [notice, setNotice] = useState<ProvisionTenantResponse | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    Promise.all([tenancyApi.listTenants({ limit: PAGE_SIZE }), tenancyApi.listPlans()])
      .then(([tenantList, planList]) => {
        if (cancelled) return;
        setTenants(tenantList.items);
        setHasMore(tenantList.nextCursor !== undefined);
        setPlans(planList.items);
        setLoaded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(asApiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tenancyApi]);

  const refresh = useCallback(async () => {
    try {
      const updated = await tenancyApi.listTenants({ limit: PAGE_SIZE });
      setTenants(updated.items);
      setHasMore(updated.nextCursor !== undefined);
    } catch (err) {
      setActionError(asApiError(err).title);
    }
  }, [tenancyApi]);

  const closeProvision = useCallback(() => setSheetOpen(false), []);
  const closeStatus = useCallback(() => setStatusTarget(undefined), []);

  const provision = async (input: ProvisionTenantInput) => {
    const result = await tenancyApi.provisionTenant(input);
    setNotice(result);
    setSheetOpen(false);
    await refresh();
    return result;
  };

  const changeStatus = async (tenantId: string, to: 'suspended' | 'active', reason: string) => {
    await tenancyApi.transitionTenantStatus(tenantId, to, reason);
    setStatusTarget(undefined);
    await refresh();
  };

  const resumeProvisioning = async (tenant: TenantSummary) => {
    setActionError(undefined);
    try {
      setNotice(await tenancyApi.resumeProvisioning(tenant.id));
    } catch (err) {
      setActionError(asApiError(err).title);
      return;
    }
    await refresh();
  };

  if (error) return error.status === 403 ? <PermissionDenied /> : <ErrorState error={error} />;
  if (!loaded) return <LoadingSkeleton />;

  const organisations = tenants.filter((tenant) => tenant.kind === 'ORGANISATION').length;
  return (
    <PageContainer>
      <PageHeader
        title={t('tenancy.operator.title')}
        subtitle={t('tenancy.operator.description')}
        actions={
          <Button onClick={() => setSheetOpen(true)} size="lg">
            {t('tenancy.operator.provision')}
          </Button>
        }
      />
      <KpiRow>
        <KpiTile label={t('tenancy.operator.kpi_orgs')} value={kpiCount(organisations, hasMore)} caption={t('tenancy.operator.kpi_orgs_caption')} />
        <KpiTile label={t('tenancy.operator.kpi_solo')} value={kpiCount(tenants.length - organisations, hasMore)} />
      </KpiRow>
      {notice && <ProvisionNotice result={notice} />}
      {actionError && (
        <p role="alert" className="operator-error">
          {actionError}
        </p>
      )}
      <PlanCards plans={plans} />
      <TenantsTable
        tenants={tenants}
        plans={plans}
        onSuspend={(tenant) => setStatusTarget({ tenant, to: 'suspended' })}
        onResume={(tenant) => setStatusTarget({ tenant, to: 'active' })}
        onResumeProvisioning={resumeProvisioning}
      />
      <ProvisionTenantSheet open={sheetOpen} plans={plans} onClose={closeProvision} onSubmit={provision} />
      <TenantStatusSheet
        key={statusTarget ? `${statusTarget.tenant.id}-${statusTarget.to}` : 'none'}
        target={statusTarget}
        onClose={closeStatus}
        onConfirm={changeStatus}
      />
    </PageContainer>
  );
}
