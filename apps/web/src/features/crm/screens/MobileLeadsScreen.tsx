import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApi } from '../../../lib/api';
import { Button, PageHeader, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type LeadListItem, type ProductLine } from '../api';
import { leadQueryFor } from './LeadsWorkspaceScreen';
import { NewLeadForm } from '../components/NewLeadForm';
import { LeadsResults } from '../components/mobile/LeadsResults';
import { MobileLeadsControls } from '../components/mobile/MobileLeadsControls';
import { useDebounced, useLeadStats } from '../components/mobile/use-lead-stats';
import '../styles/MobileLeadsScreen.css';

/** M02 Leads on the phone (AC-M04-25): saved views as server queries, list or stage board, new lead with consent. */
export function MobileLeadsScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const [params] = useSearchParams();
  const [view, setView] = useState('all_open');
  const [product, setProduct] = useState<ProductLine | undefined>();
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<'list' | 'board'>('list');
  const [leads, setLeads] = useState<LeadListItem[] | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [reload, setReload] = useState(0);
  const q = useDebounced(search.trim(), 250);
  const query = useMemo(() => ({ ...leadQueryFor(view, product), q: q || undefined }), [view, product, q]);
  const stats = useLeadStats(crmApi, reload);

  useEffect(() => {
    let cancelled = false;
    crmApi.listLeads(query).then(
      (result) => {
        if (cancelled) return;
        setError(undefined);
        setLeads(result.items);
      },
      (err: unknown) => !cancelled && err instanceof ApiError && setError(err),
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi, query, reload]);

  if (error?.status === 403) return <PermissionDenied />;

  return (
    <main className="mobile-leads-screen">
      <PageHeader
        title={t('crm.leads.title')}
        subtitle={stats ? t('crm.mobile.open_count', { count: stats.open }) : undefined}
        actions={
          <>
            <Link className="header-link" to="/m/tasks">{t('crm.mobile.tasks_link')}</Link>
            <Button onClick={() => setCreating(true)}>{t('crm.leads.new_lead')}</Button>
          </>
        }
      />
      <div role="group" aria-label={t('crm.mobile.layout')} className="view-controls">
        <button type="button" className="view-btn" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>{t('crm.mobile.list')}</button>
        <button type="button" className="view-btn" aria-pressed={layout === 'board'} onClick={() => setLayout('board')}>{t('crm.mobile.board')}</button>
      </div>
      <MobileLeadsControls stats={stats} view={view} onView={setView} search={search} onSearch={setSearch} product={product} onProduct={setProduct} />
      {error && <p role="alert" className="list-error">{t('crm.mobile.list_failed', { reason: error.title })}</p>}
      {(leads || !error) && <LeadsResults leads={leads} layout={layout} />}
      {creating && (
        <NewLeadForm
          onClose={() => setCreating(false)}
          onSubmitted={() => {
            setCreating(false);
            setReload((n) => n + 1); // the server decides owner and view membership; re-query rather than guess
          }}
        />
      )}
    </main>
  );
}
