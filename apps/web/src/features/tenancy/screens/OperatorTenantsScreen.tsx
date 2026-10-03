import { useState, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import {
  Button,
  Card,
  DataGrid,
  BottomSheet,
  StatusChip,
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createTenancyApi, TenantSummary, ProvisionTenantInput, PlanCode, Plan, EntityType } from '../api';
import '../styles/OperatorTenantsScreen.css';

export function OperatorTenantsScreen() {
  const api = useApi();
  const tenancyApi = createTenancyApi(api);
  const { t } = useT();

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [provisionSheet, setProvisionSheet] = useState(false);
  const [provisioning, setProvisioning] = useState(false);

  const [formData, setFormData] = useState<ProvisionTenantInput>({
    slug: '',
    displayName: '',
    kind: 'ORGANISATION',
    planCode: 'TEAM',
    entity: {
      entityType: 'IMF',
      legalName: '',
      registrationNo: '',
      registrationValidTo: '',
    },
    admin: {
      name: '',
    },
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [tenantList, planList] = await Promise.all([
          tenancyApi.listTenants({ limit: 50 }),
          tenancyApi.listPlans(),
        ]);
        setTenants(tenantList.items);
        setPlans(planList.items);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      await tenancyApi.provisionTenant(formData);
      const updated = await tenancyApi.listTenants({ limit: 50 });
      setTenants(updated.items);
      setProvisionSheet(false);
      setFormData({
        slug: '',
        displayName: '',
        kind: 'ORGANISATION',
        planCode: 'TEAM',
        entity: {
          entityType: 'IMF',
          legalName: '',
          registrationNo: '',
          registrationValidTo: '',
        },
        admin: { name: '' },
      });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      }
    } finally {
      setProvisioning(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} />;
  }

  const statusTone = (status: string) => {
    switch (status) {
      case 'active':
        return 'ok';
      case 'suspended':
        return 'warn';
      case 'offboarded':
        return 'bad';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="operator-tenants-screen">
      <div className="page-header">
        <div>
          <h1>{t('tenancy.operator.title')}</h1>
          <p>{t('tenancy.operator.description')}</p>
        </div>
        <Button onClick={() => setProvisionSheet(true)} size="lg">
          {t('tenancy.operator.provision')}
        </Button>
      </div>

      <Card>
        <DataGrid
          columns={[
            { key: 'displayName', header: t('tenancy.operator.col_name') },
            { key: 'kind', header: t('tenancy.operator.col_type') },
            {
              key: 'planCode',
              header: t('tenancy.operator.col_plan'),
            },
            {
              key: 'status',
              header: t('tenancy.operator.col_status'),
              render: (row: TenantSummary) => (
                <StatusChip tone={statusTone(row.status)}>
                  {row.status}
                </StatusChip>
              ),
            },
          ]}
          rows={tenants}
          rowKey={t => t.id}
        />
      </Card>

      <BottomSheet
        open={provisionSheet}
        title={t('tenancy.operator.provision_title')}
        onClose={() => setProvisionSheet(false)}
      >
        <div className="provision-form">
          <label>
            <span>{t('tenancy.operator.form_legal_name')}</span>
            <input
              type="text"
              value={formData.entity.legalName}
              onChange={e =>
                setFormData({
                  ...formData,
                  entity: { ...formData.entity, legalName: e.target.value },
                })
              }
            />
          </label>

          <label>
            <span>{t('tenancy.operator.form_entity_type')}</span>
            <select
              value={formData.entity.entityType}
              onChange={e =>
                setFormData({
                  ...formData,
                  entity: { ...formData.entity, entityType: e.target.value as EntityType },
                })
              }
            >
              <option value="IMF">Insurance Marketing Firm</option>
              <option value="BROKER">Broker</option>
              <option value="CORPORATE_AGENT">Corporate Agent</option>
              <option value="INDIVIDUAL_AGENT">Individual Agent</option>
            </select>
          </label>

          <label>
            <span>{t('tenancy.operator.form_plan')}</span>
            <select
              value={formData.planCode}
              onChange={e =>
                setFormData({
                  ...formData,
                  planCode: e.target.value as PlanCode,
                })
              }
            >
              {plans.map(p => (
                <option key={p.code} value={p.code}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>{t('tenancy.operator.form_slug')}</span>
            <input
              type="text"
              value={formData.slug}
              onChange={e => setFormData({ ...formData, slug: e.target.value })}
              placeholder="tenant-slug"
            />
          </label>

          <label>
            <span>{t('tenancy.operator.form_registration')}</span>
            <input
              type="text"
              value={formData.entity.registrationNo}
              onChange={e =>
                setFormData({
                  ...formData,
                  entity: { ...formData.entity, registrationNo: e.target.value },
                })
              }
            />
          </label>

          <label>
            <span>{t('tenancy.operator.form_registration_valid')}</span>
            <input
              type="date"
              value={formData.entity.registrationValidTo}
              onChange={e =>
                setFormData({
                  ...formData,
                  entity: { ...formData.entity, registrationValidTo: e.target.value },
                })
              }
            />
          </label>

          <label>
            <span>{t('tenancy.operator.form_admin_name')}</span>
            <input
              type="text"
              value={formData.admin.name}
              onChange={e =>
                setFormData({
                  ...formData,
                  admin: { ...formData.admin, name: e.target.value },
                })
              }
            />
          </label>

          <div className="form-actions">
            <Button
              onClick={handleProvision}
              loading={provisioning}
              size="lg"
            >
              {t('tenancy.operator.provision')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setProvisionSheet(false)}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}
