import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi } from '../../../lib/api';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageContainer,
  PageHeader,
  PermissionDenied,
  Tabs,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { usePermissions } from '../../../lib/auth/me';
import { useT } from '../../../lib/i18n';
import {
  createTenancyApi,
  CUSTOM_FIELD_ENTITIES,
  type CustomFieldDefinition,
  type CustomFieldEntity,
  type DefineCustomFieldInput,
  type ReviseCustomFieldInput,
} from '../api';
import { CustomFieldsTable } from '../components/CustomFieldsTable';
import { DefineFieldSheet, describeProblem } from '../components/DefineFieldSheet';
import { EditFieldSheet } from '../components/EditFieldSheet';
import '../styles/CustomFieldsScreen.css';

export interface CustomFieldsScreenProps {
  /** Whether the user holds tenant.custom_field.write; without it the table is read-only. */
  canWrite?: boolean;
}

export function CustomFieldsScreen() {
  const { can } = usePermissions();
  const api = useApi();
  const tenancyApi = useMemo(() => createTenancyApi(api), [api]);
  const { t } = useT();

  const [items, setItems] = useState<CustomFieldDefinition[]>([]);
  const [limit, setLimit] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [entity, setEntity] = useState<CustomFieldEntity>('party');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CustomFieldDefinition | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [actionError, setActionError] = useState<string | undefined>();
  const [forbiddenWrite, setForbiddenWrite] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await tenancyApi.listCustomFields();
        setItems(result.items);
        setLimit(result.usage.limit);
      } catch (err) {
        setError(err instanceof ApiError ? err : ApiError.network(err instanceof Error ? err : new Error(String(err))));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [tenancyApi]);

  const guardWrite = useCallback(<T,>(call: () => Promise<T>): Promise<T> =>
    call().catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 403) setForbiddenWrite(true);
      throw err;
    }), []);

  const handleCreate = async (input: DefineCustomFieldInput) => {
    const created = await guardWrite(() => tenancyApi.defineCustomField(input));
    setItems((prev) => [...prev, created]);
  };

  const handleRevise = async (definition: CustomFieldDefinition, patch: ReviseCustomFieldInput) => {
    const updated = await guardWrite(() => tenancyApi.reviseCustomField(definition.id, patch, definition.version));
    setItems((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
  };

  const handleToggle = async (definition: CustomFieldDefinition) => {
    setBusyId(definition.id);
    setActionError(undefined);
    try {
      await handleRevise(definition, { active: !definition.active });
    } catch (err) {
      const problem = describeProblem(err, t);
      setActionError(problem.banner ?? problem.general ?? problem.keyError);
    } finally {
      setBusyId(undefined);
    }
  };

  if (loading) return <LoadingSkeleton />;
  if (error) return error.status === 403 ? <PermissionDenied /> : <ErrorState error={error} onRetry={() => window.location.reload()} />;

  const writable = can('tenant.custom_field.write') && !forbiddenWrite;
  const inTab = items.filter((d) => d.entity === entity);
  const active = items.filter((d) => d.active).length;
  const tabs = CUSTOM_FIELD_ENTITIES.map((e) => ({ id: e, label: t(`tenancy.cf.entity.${e}`), badge: items.filter((d) => d.entity === e).length }));

  return (
    <PageContainer>
      <PageHeader
        title={t('tenancy.cf.title')}
        subtitle={t('tenancy.cf.description')}
        actions={writable ? <Button onClick={() => setAdding(true)}>{t('tenancy.cf.add')}</Button> : undefined}
      />
      <p role="status" className="cf-usage">{t('tenancy.cf.usage', { active, limit })}</p>
      <p className="cf-note">{t('tenancy.cf.builder_note')}</p>
      {forbiddenWrite && <p role="alert" className="cf-error">{t('tenancy.cf.read_only')}</p>}
      {actionError && <p role="alert" className="cf-banner">{actionError}</p>}
      <Tabs tabs={tabs} value={entity} onChange={(id) => setEntity(id as CustomFieldEntity)} />
      <div role="tabpanel" id={`panel-${entity}`}>
        {inTab.length === 0 ? (
          <EmptyState title={t('tenancy.cf.empty')} />
        ) : (
          <CustomFieldsTable items={inTab} canWrite={writable} busyId={busyId} onEdit={setEditing} onToggleActive={handleToggle} />
        )}
      </div>
      <DefineFieldSheet open={adding} entity={entity} onClose={() => setAdding(false)} onCreate={handleCreate} />
      <EditFieldSheet definition={editing} onClose={() => setEditing(undefined)} onRevise={handleRevise} />
    </PageContainer>
  );
}
