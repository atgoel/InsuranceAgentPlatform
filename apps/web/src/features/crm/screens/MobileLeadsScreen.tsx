import { useEffect, useMemo, useState } from 'react';
import { useApi } from '../../../lib/api';
import { Button, EmptyState, ErrorState, LoadingSkeleton, PermissionDenied } from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type LeadListItem, type LeadStage, type ProductLine } from '../api';
import { leadQueryFor } from './LeadsWorkspaceScreen';
import { LeadFilterBar } from '../components/LeadFilterBar';
import { NewLeadForm } from '../components/NewLeadForm';
import { LeadCard } from '../components/mobile/LeadCard';
import '../styles/MobileLeadsScreen.css';

const BOARD: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED'];

/** M02 Leads on the phone (AC-M04-25): saved views as server queries, list or stage board, new lead with consent. */
export function MobileLeadsScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();
  const [view, setView] = useState('all_open');
  const [product, setProduct] = useState<ProductLine | undefined>();
  const [layout, setLayout] = useState<'list' | 'board'>('list');
  const [leads, setLeads] = useState<LeadListItem[] | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const query = useMemo(() => leadQueryFor(view, product), [view, product]);

  useEffect(() => {
    let cancelled = false;
    crmApi.listLeads(query).then(
      (result) => !cancelled && setLeads(result.items),
      (err: unknown) => !cancelled && err instanceof ApiError && setError(err),
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi, query, reload]);

  if (error?.status === 403) return <PermissionDenied />;
  if (error) return <ErrorState error={error} />;
  if (!leads) return <LoadingSkeleton />;

  const views = ['all_open', 'unassigned', 'sla_breached', 'mine'].map((id) => ({ id, label: t(`crm.leads.view.${id}`) }));
  return (
    <main className="mobile-leads-screen">
      <header className="screen-header">
        <h1>{t('crm.leads.title')}</h1>
        <Button onClick={() => setCreating(true)}>{t('crm.leads.new_lead')}</Button>
      </header>
      <div role="group" aria-label={t('crm.mobile.layout')}>
        <button type="button" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>{t('crm.mobile.list')}</button>
        <button type="button" aria-pressed={layout === 'board'} onClick={() => setLayout('board')}>{t('crm.mobile.board')}</button>
      </div>
      <LeadFilterBar views={views} selectedView={view} onViewChange={setView} product={product} onProductChange={setProduct} />
      {leads.length === 0 && <EmptyState title={t('crm.leads.empty_title')} />}
      {leads.length > 0 && layout === 'list' && (
        <ul className="lead-cards">{leads.map((l) => <LeadCard key={l.id} lead={l} />)}</ul>
      )}
      {leads.length > 0 && layout === 'board' && (
        <div className="lead-board">
          {BOARD.map((stage) => (
            <section key={stage} aria-label={t(`crm.lead.stage_${stage}`)} className="board-column">
              <h2>{t(`crm.lead.stage_${stage}`)} ({leads.filter((l) => l.stage === stage).length})</h2>
              <ul>{leads.filter((l) => l.stage === stage).map((l) => <LeadCard key={l.id} lead={l} />)}</ul>
            </section>
          ))}
        </div>
      )}
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
