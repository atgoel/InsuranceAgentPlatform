import { Button, Card, DataGrid, EmptyState, StatusChip, formatIstDate, type Tone } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { Plan, TenantStatus, TenantSummary } from '../api';

const STATUS_TONE: Record<TenantStatus, Tone> = { active: 'ok', suspended: 'warn', offboarded: 'bad', provisioning: 'info' };

export interface TenantsTableProps {
  tenants: TenantSummary[];
  plans: Plan[];
  onSuspend(tenant: TenantSummary): void;
  onResume(tenant: TenantSummary): void;
  onResumeProvisioning(tenant: TenantSummary): void;
}

function RowActions({ tenant, ...handlers }: Omit<TenantsTableProps, 'tenants' | 'plans'> & { tenant: TenantSummary }) {
  const { t } = useT();
  if (tenant.status === 'active') {
    return (
      <Button
        variant="secondary"
        size="md"
        aria-label={t('tenancy.operator.suspend_named', { name: tenant.displayName })}
        onClick={() => handlers.onSuspend(tenant)}
      >
        {t('tenancy.operator.suspend')}
      </Button>
    );
  }
  if (tenant.status === 'suspended') {
    return (
      <Button
        variant="secondary"
        size="md"
        aria-label={t('tenancy.operator.resume_named', { name: tenant.displayName })}
        onClick={() => handlers.onResume(tenant)}
      >
        {t('tenancy.operator.resume')}
      </Button>
    );
  }
  if (tenant.status === 'provisioning') {
    return (
      <Button
        variant="secondary"
        size="md"
        aria-label={t('tenancy.operator.resume_provisioning_named', { name: tenant.displayName })}
        onClick={() => handlers.onResumeProvisioning(tenant)}
      >
        {t('tenancy.operator.resume_provisioning')}
      </Button>
    );
  }
  return null;
}

export function TenantsTable({ tenants, plans, ...handlers }: TenantsTableProps) {
  const { t, lang } = useT();
  const planName = (code: string) => plans.find((p) => p.code === code)?.name ?? code;
  return (
    <Card>
      <DataGrid
        caption={t('tenancy.operator.table_caption')}
        empty={<EmptyState title={t('tenancy.operator.empty')} />}
        columns={[
          { key: 'displayName', header: t('tenancy.operator.col_name') },
          { key: 'kind', header: t('tenancy.operator.col_type'), render: (row) => t(`tenancy.operator.kind.${row.kind}`) },
          { key: 'planCode', header: t('tenancy.operator.col_plan'), render: (row) => planName(row.planCode) },
          {
            key: 'status',
            header: t('tenancy.operator.col_status'),
            render: (row) => <StatusChip tone={STATUS_TONE[row.status]}>{t(`tenancy.operator.status.${row.status}`)}</StatusChip>,
          },
          { key: 'createdAt', header: t('tenancy.operator.col_created'), render: (row) => formatIstDate(row.createdAt, lang) },
          { key: 'actions', header: t('tenancy.operator.col_actions'), render: (row) => <RowActions tenant={row} {...handlers} /> },
        ]}
        rows={tenants}
        rowKey={(row) => row.id}
      />
    </Card>
  );
}
