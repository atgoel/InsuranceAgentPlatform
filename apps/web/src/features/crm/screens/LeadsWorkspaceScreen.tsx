import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { PageContainer, PageHeader, LoadingSkeleton, ErrorState, EmptyState, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type LeadListItem, type ProductLine } from '../api';
import { LeadsGrid } from '../components/LeadsGrid';
import { LeadsWorkspaceFilters } from '../components/LeadsWorkspaceFilters';
import { LeadsKpis } from '../components/LeadsKpis';
import { NewLeadForm } from '../components/NewLeadForm';
import { BulkAssignForm } from '../components/BulkAssignForm';
import { useLeadsList } from '../components/useLeadsList';
import '../styles/crm-frame.css';
import '../styles/LeadsWorkspaceScreen.css';

export { leadQueryFor } from '../components/useLeadsList';

const SEARCH_DEBOUNCE_MS = 250;

/** The committed search text follows the typed text after a short pause, so typing never reloads per key. */
function useDebounced(value: string): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

interface LeadsBodyProps {
  loading: boolean;
  error?: ApiError;
  leads: LeadListItem[];
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
  onRetry: () => void;
}

function LeadsBody({ loading, error, leads, selectedIds, onSelectionChange, onRetry }: LeadsBodyProps) {
  const { t } = useT();
  if (error) {
    return <ErrorState error={error} onRetry={onRetry} />;
  }
  if (loading) {
    return <LoadingSkeleton />;
  }
  if (leads.length === 0) {
    return <EmptyState title={t('crm.leads.empty_title')} body={t('crm.leads.empty_description')} />;
  }
  return <LeadsGrid items={leads} selectedIds={selectedIds} onSelectionChange={onSelectionChange} />;
}

export function LeadsWorkspaceScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [pickedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedView, setSelectedView] = useState<string>('all_open');
  const [productFilter, setProductFilter] = useState<ProductLine | undefined>();
  const [ownerFilter, setOwnerFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [showBulkAssignForm, setShowBulkAssignForm] = useState(false);
  /** A failed action is shown inline; the workspace stays on screen. */
  const [actionError, setActionError] = useState<string | undefined>();

  const q = useDebounced(search);
  const filters = useMemo(
    () => ({ view: selectedView, product: productFilter, owner: ownerFilter, q }),
    [selectedView, productFilter, ownerFilter, q],
  );
  const { loading, error, stats, leads, owners, reload } = useLeadsList(crmApi, filters);

  // A selection only counts for leads still on screen after a reload or a filter change.
  const selectedLeadIds = useMemo(() => pickedLeadIds.filter((id) => leads.some((lead) => lead.id === id)), [pickedLeadIds, leads]);

  const handleNewLeadCreated = useCallback(() => {
    setShowNewLeadForm(false);
    reload();
  }, [reload]);

  const handleBulkAssignSubmitted = useCallback(
    async (leadIds: string[], memberId: string) => {
      try {
        setActionError(undefined);
        await crmApi.bulkAssignLeads(leadIds, memberId);
        setShowBulkAssignForm(false);
        reload();
      } catch (err) {
        setShowBulkAssignForm(false);
        setActionError(err instanceof ApiError ? err.title : t('common.error'));
      }
    },
    [crmApi, reload, t],
  );

  if (error?.status === 403) {
    return <PermissionDenied />;
  }

  return (
    <div className="crm-screen-frame">
      <PageContainer width="wide">
        <PageHeader
          title={t('crm.leads.title')}
          subtitle={t('crm.leads.subtitle')}
          actions={
            <>
              <Link className="btn btn-secondary lead-import-link" to="/crm/import">
                {t('crm.leads.import_csv')}
              </Link>
              <button type="button" className="btn btn-primary" onClick={() => setShowNewLeadForm(true)}>
                {t('crm.leads.new_lead')}
              </button>
            </>
          }
        />
        {actionError && (
          <p role="alert" className="action-error">
            {t('crm.lead.action_failed', { reason: actionError })}
          </p>
        )}
        <LeadsKpis stats={stats} />
        <LeadsWorkspaceFilters
          stats={stats}
          selectedView={selectedView}
          onViewChange={setSelectedView}
          search={search}
          onSearchChange={setSearch}
          product={productFilter}
          onProductChange={setProductFilter}
          owner={ownerFilter}
          onOwnerChange={setOwnerFilter}
          owners={owners}
        />
        {selectedLeadIds.length > 0 && (
          <div className="action-bar">
            <div className="selection-info">{t('crm.leads.selected_count', { count: selectedLeadIds.length })}</div>
            <button type="button" className="btn btn-secondary" onClick={() => setShowBulkAssignForm(true)}>
              {t('crm.leads.bulk_assign')}
            </button>
          </div>
        )}
        <LeadsBody
          loading={loading}
          error={error}
          leads={leads}
          selectedIds={selectedLeadIds}
          onSelectionChange={setSelectedLeadIds}
          onRetry={reload}
        />
        {showNewLeadForm && <NewLeadForm onClose={() => setShowNewLeadForm(false)} onSubmitted={handleNewLeadCreated} />}
        {showBulkAssignForm && (
          <BulkAssignForm leadIds={selectedLeadIds} onClose={() => setShowBulkAssignForm(false)} onSubmitted={handleBulkAssignSubmitted} />
        )}
      </PageContainer>
    </div>
  );
}
