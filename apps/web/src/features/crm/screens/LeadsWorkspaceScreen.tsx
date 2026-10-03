import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../../../lib/api';
import {
  LoadingSkeleton,
  ErrorState,
  EmptyState,
  PermissionDenied,
  type FilterOption,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type LeadListItem, type LeadStage, type LeadStats, type ProductLine, type Temperature } from '../api';
import { LeadsGrid } from '../components/LeadsGrid';
import { LeadFilterBar } from '../components/LeadFilterBar';
import { NewLeadForm } from '../components/NewLeadForm';
import { BulkAssignForm } from '../components/BulkAssignForm';
import '../styles/LeadsWorkspaceScreen.css';

interface KpiTile {
  label: string;
  value: string | number;
  note?: string;
}

export function LeadsWorkspaceScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [stats, setStats] = useState<LeadStats | undefined>();
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [selectedView, setSelectedView] = useState<string>('all_open');
  const [productFilter, setProductFilter] = useState<ProductLine | undefined>();
  const [showNewLeadForm, setShowNewLeadForm] = useState(false);
  const [showBulkAssignForm, setShowBulkAssignForm] = useState(false);

  // Saved views and the product filter are API queries (server-side scope and paging), never client-side filters.
  const query = useMemo(() => leadQueryFor(selectedView, productFilter), [selectedView, productFilter]);

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const [statsResult, leadsResult] = await Promise.all([crmApi.getLeadStats(), crmApi.listLeads(query)]);
        if (cancelled) return;
        setStats(statsResult);
        setLeads(leadsResult.items);
        setSelectedLeadIds([]);
      } catch (err) {
        if (!cancelled && err instanceof ApiError) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => {
      cancelled = true;
    };
  }, [crmApi, query]);

  const filteredLeads = leads;

  const handleNewLeadCreated = useCallback(
    async (leadId: string) => {
      try {
        const updated = await crmApi.getLead(leadId);
        const asListItem = {
          id: updated.id,
          partyId: updated.partyId,
          name: updated.name,
          mobileMasked: updated.mobileMasked,
          productInterest: updated.productInterest,
          source: updated.source,
          campaignId: updated.campaignId,
          ownerMemberId: updated.ownerMemberId,
          ownerName: updated.ownerName,
          stage: updated.stage,
          temperature: updated.temperature as Temperature,
          slaState: updated.slaState,
          slaDueAt: updated.slaDueAt,
          consent: updated.consent,
          createdAt: updated.createdAt,
        } as LeadListItem;
        setLeads((prev) => [asListItem, ...prev]);
        setShowNewLeadForm(false);
        // Reload stats
        const newStats = await crmApi.getLeadStats();
        setStats(newStats);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [crmApi]
  );

  const handleBulkAssignSubmitted = useCallback(
    async (leadIds: string[], memberId: string) => {
      try {
        const result = await crmApi.bulkAssignLeads(leadIds, memberId);
        // Update leads with newly assigned ones
        setLeads((prev) =>
          prev.map((l) => (result.assigned.includes(l.id) ? { ...l, ownerMemberId: memberId } : l))
        );
        setSelectedLeadIds([]);
        setShowBulkAssignForm(false);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [crmApi]
  );

  const kpiTiles: KpiTile[] = stats
    ? [
        {
          label: t('crm.leads.kpi.open'),
          value: stats.open,
        },
        {
          label: t('crm.leads.kpi.unassigned'),
          value: stats.unassigned,
        },
        {
          label: t('crm.leads.kpi.sla_met_7d'),
          value: stats.slaMetPct7d !== null ? `${stats.slaMetPct7d}%` : '—',
        },
        {
          label: t('crm.leads.kpi.lead_to_issued_90d'),
          value: stats.leadToIssuedPct90d !== null ? `${stats.leadToIssuedPct90d}%` : '—',
          note: t('crm.leads.kpi.insurer_confirmed_only'),
        },
      ]
    : [];

  const viewOptions: FilterOption[] = [
    { id: 'all_open', label: t('crm.leads.view.all_open'), count: 0 },
    { id: 'unassigned', label: t('crm.leads.view.unassigned'), count: 0 },
    { id: 'sla_breached', label: t('crm.leads.view.sla_breached'), count: 0 },
    { id: 'mine', label: t('crm.leads.view.mine'), count: 0 },
  ];

  if (loading && leads.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }

  return (
    <main className="leads-workspace-screen" role="main">
      <div className="screen-header">
        <div>
          <h1>{t('crm.leads.title')}</h1>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowNewLeadForm(true)}
          aria-label={t('crm.leads.new_lead')}
        >
          {t('crm.leads.new_lead')}
        </button>
      </div>

      {/* KPI Tiles */}
      <div className="kpi-tiles">
        {kpiTiles.map((tile) => (
          <div key={tile.label} className="kpi-tile">
            <div className="kpi-label">{tile.label}</div>
            <div className="kpi-value">{tile.value}</div>
            {tile.note && <div className="kpi-note">{tile.note}</div>}
          </div>
        ))}
      </div>

      {/* View Filters */}
      <LeadFilterBar
        views={viewOptions}
        selectedView={selectedView}
        onViewChange={setSelectedView}
        product={productFilter}
        onProductChange={setProductFilter}
      />

      {/* Action Bar */}
      {selectedLeadIds.length > 0 && (
        <div className="action-bar">
          <div className="selection-info">
            {t('crm.leads.selected_count', { count: selectedLeadIds.length })}
          </div>
          <button className="btn btn-secondary" onClick={() => setShowBulkAssignForm(true)}>
            {t('crm.leads.bulk_assign')}
          </button>
        </div>
      )}

      {/* Grid */}
      {filteredLeads.length === 0 ? (
        <EmptyState
          title={t('crm.leads.empty_title')}
          body={t('crm.leads.empty_description')}
        />
      ) : (
        <LeadsGrid
          items={filteredLeads}
          selectedIds={selectedLeadIds}
          onSelectionChange={setSelectedLeadIds}
        />
      )}

      {/* New Lead Form */}
      {showNewLeadForm && (
        <NewLeadForm
          onClose={() => setShowNewLeadForm(false)}
          onSubmitted={handleNewLeadCreated}
        />
      )}

      {/* Bulk Assign Form */}
      {showBulkAssignForm && (
        <BulkAssignForm
          leadIds={selectedLeadIds}
          onClose={() => setShowBulkAssignForm(false)}
          onSubmitted={handleBulkAssignSubmitted}
        />
      )}
    </main>
  );
}


/** Saved view → API filter (M04 §10: All open, Unassigned, SLA breached, Mine). */
export function leadQueryFor(view: string, product?: ProductLine): Parameters<ReturnType<typeof createCrmApi>['listLeads']>[0] {
  const open: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED'];
  const base = { stage: open, product };
  if (view === 'unassigned') return { ...base, owner: 'unassigned' };
  if (view === 'sla_breached') return { ...base, sla: 'breached' };
  if (view === 'mine') return { ...base, owner: 'me' };
  return base;
}
