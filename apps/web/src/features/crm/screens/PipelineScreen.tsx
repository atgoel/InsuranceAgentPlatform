import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../../../lib/api';
import {
  PageContainer,
  PageHeader,
  KpiRow,
  KpiTile,
  Select,
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
  type SelectOption,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type BoardResponse, type OpportunityStage, type LostReason, type ProductLine } from '../api';
import { formatPaise } from '../money';
import { PipelineBoard } from '../components/PipelineBoard';
import '../styles/crm-frame.css';
import '../styles/PipelineScreen.css';

const PRODUCT_LINES: ProductLine[] = ['TERM_LIFE', 'SAVINGS_LIFE', 'HEALTH', 'HEALTH_FLOATER', 'CHILD', 'RETIREMENT', 'MOTOR', 'OTHER'];

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, 'network_error', 'Network error');
}

/** Owner filter options come from the board itself: member id to the server-resolved ownerName. */
function collectOwners(board: BoardResponse, known: Record<string, string>): Record<string, string> {
  const next = { ...known };
  for (const column of board.columns) {
    for (const opportunity of column.items) {
      if (opportunity.ownerName) {
        next[opportunity.ownerMemberId] = opportunity.ownerName;
      }
    }
  }
  return next;
}

function PipelineKpis({ board }: { board: BoardResponse }) {
  const { t } = useT();
  const { stats } = board;
  return (
    <KpiRow>
      <KpiTile label={t('crm.pipeline.open_count')} value={stats.openCount} caption={t('crm.pipeline.open_caption')} />
      <KpiTile
        label={t('crm.pipeline.total_premium')}
        value={formatPaise(stats.openExpectedPremiumPaise)}
        caption={t('crm.pipeline.premium_caption')}
      />
      <KpiTile label={t('crm.pipeline.median_days')} value={stats.medianDaysToIssue ?? '—'} />
      <KpiTile
        label={t('crm.pipeline.win_rate_90d')}
        value={stats.winRate90d !== null ? `${stats.winRate90d}%` : '—'}
        caption={t('crm.pipeline.win_caption')}
      />
    </KpiRow>
  );
}

interface BoardState {
  loading: boolean;
  error?: ApiError;
  board?: BoardResponse;
}

export function PipelineScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [state, setState] = useState<BoardState>({ loading: true });
  const [product, setProduct] = useState('');
  const [owner, setOwner] = useState('');
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);
  /** A failed move or loss is shown inline; the board stays on screen. */
  const [actionError, setActionError] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setState((prev) => ({ ...prev, loading: true, error: undefined }));
      try {
        const board = await crmApi.getOpportunitiesBoard({
          product: (product || undefined) as ProductLine | undefined,
          owner: owner || undefined,
        });
        if (!cancelled) {
          setState({ loading: false, board });
          setOwners((known) => collectOwners(board, known));
        }
      } catch (err) {
        if (!cancelled) setState((prev) => ({ ...prev, loading: false, error: asApiError(err) }));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [crmApi, product, owner, reloadKey]);

  const runAction = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        setActionError(undefined);
        await action();
        setReloadKey((key) => key + 1);
      } catch (err) {
        setActionError(asApiError(err).title);
      }
    },
    [],
  );

  const handleMove = useCallback(
    (id: string, to: OpportunityStage) => runAction(() => crmApi.moveOpportunityStage(id, to)),
    [crmApi, runAction],
  );
  const handleLost = useCallback(
    (id: string, reason: LostReason) => runAction(() => crmApi.markOpportunityLost(id, reason)),
    [crmApi, runAction],
  );

  const productOptions: SelectOption[] = [
    { value: '', label: t('crm.pipeline.all_products') },
    ...PRODUCT_LINES.map((p) => ({ value: p, label: t(`labels.line.${p}`) })),
  ];

  const ownerOptions: SelectOption[] = [
    { value: '', label: t('crm.leads.all_owners') },
    ...Object.entries(owners).map(([id, name]) => ({ value: id, label: name })),
  ];

  if (state.error?.status === 403) {
    return <PermissionDenied />;
  }

  return (
    <div className="crm-screen-frame">
      <PageContainer width="wide">
        <PageHeader title={t('crm.pipeline.title')} subtitle={t('crm.pipeline.subtitle')} />
        {actionError && (
          <p role="alert" className="action-error">
            {t('crm.lead.action_failed', { reason: actionError })}
          </p>
        )}
        {state.board && <PipelineKpis board={state.board} />}
        <div className="pipeline-filters">
          <Select label={t('crm.pipeline.product_filter')} value={product} options={productOptions} onChange={setProduct} />
          <Select label={t('crm.pipeline.owner_filter')} value={owner} options={ownerOptions} onChange={setOwner} />
        </div>
        {state.error && <ErrorState error={state.error} onRetry={() => setReloadKey((key) => key + 1)} />}
        {!state.error && !state.board && <LoadingSkeleton />}
        {!state.error && state.board && (
          <PipelineBoard columns={state.board.columns} closed={state.board.closed} onMoveOpportunity={handleMove} onMarkLost={handleLost} />
        )}
      </PageContainer>
    </div>
  );
}
