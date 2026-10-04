import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../../../lib/api/api-error';
import { createCrmApi, type LeadListItem, type LeadStage, type LeadStats, type ProductLine } from '../api';

export type CrmApi = ReturnType<typeof createCrmApi>;
type LeadQuery = NonNullable<Parameters<CrmApi['listLeads']>[0]>;

export interface LeadFilters {
  view: string;
  product?: ProductLine;
  /** Explicit owner filter: a member id or "unassigned". Empty means "the saved view decides". */
  owner: string;
  q: string;
}

/** Saved view and filters to the API query (M04 §10: All open, Unassigned, SLA breached, Mine). */
export function leadQueryFor(view: string, product?: ProductLine, owner = '', q = ''): LeadQuery {
  const open: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED'];
  const base = { stage: open, product, q: q.trim() || undefined };
  const explicitOwner = owner || undefined;
  if (view === 'unassigned') return { ...base, owner: explicitOwner ?? 'unassigned' };
  if (view === 'sla_breached') return { ...base, owner: explicitOwner, sla: 'breached' };
  if (view === 'mine') return { ...base, owner: explicitOwner ?? 'me' };
  return { ...base, owner: explicitOwner };
}

interface ListState {
  loading: boolean;
  error?: ApiError;
  stats?: LeadStats;
  leads: LeadListItem[];
}

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, 'network_error', 'Network error');
}

function mergeOwners(known: Record<string, string>, leads: LeadListItem[]): Record<string, string> {
  const next = { ...known };
  for (const lead of leads) {
    if (lead.ownerMemberId && lead.ownerName) {
      next[lead.ownerMemberId] = lead.ownerName;
    }
  }
  return next;
}

/** Loads stats and the filtered list together. Filters are API queries, never client-side filters. */
export function useLeadsList(crmApi: CrmApi, filters: LeadFilters) {
  const [state, setState] = useState<ListState>({ loading: true, leads: [] });
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const query = useMemo(
    () => leadQueryFor(filters.view, filters.product, filters.owner, filters.q),
    [filters.view, filters.product, filters.owner, filters.q],
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      try {
        const [stats, list] = await Promise.all([crmApi.getLeadStats(), crmApi.listLeads(query)]);
        if (cancelled) return;
        setState({ loading: false, stats, leads: list.items });
        setOwners((known) => mergeOwners(known, list.items));
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: asApiError(err) }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [crmApi, query, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);
  return { ...state, owners, reload };
}
