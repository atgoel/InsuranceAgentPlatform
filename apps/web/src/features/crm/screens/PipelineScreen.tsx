import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApi } from '../../../lib/api';
import {
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import { createCrmApi, type BoardResponse } from '../api';
import { PipelineBoard } from '../components/PipelineBoard';
import '../styles/PipelineScreen.css';

export function PipelineScreen() {
  const api = useApi();
  const crmApi = useMemo(() => createCrmApi(api), [api]);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [boardData, setBoardData] = useState<BoardResponse | undefined>();

  useEffect(() => {
    const loadBoard = async () => {
      try {
        setLoading(true);
        setError(undefined);
        const result = await crmApi.getOpportunitiesBoard();
        setBoardData(result);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      } finally {
        setLoading(false);
      }
    };
    loadBoard();
  }, [crmApi]);

  const handleMoveOpportunity = useCallback(
    async (opportunityId: string, toStage: any) => {
      try {
        await crmApi.moveOpportunityStage(opportunityId, toStage);
        // Reload board
        const result = await crmApi.getOpportunitiesBoard();
        setBoardData(result);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [crmApi]
  );

  const handleMarkLost = useCallback(
    async (opportunityId: string, reason: any) => {
      try {
        await crmApi.markOpportunityLost(opportunityId, reason);
        // Reload board
        const result = await crmApi.getOpportunitiesBoard();
        setBoardData(result);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err);
        }
      }
    },
    [crmApi]
  );

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }

  if (!boardData) {
    return <ErrorState error={new ApiError(404, 'no_data', 'No data')} onRetry={() => window.location.reload()} />;
  }

  return (
    <main className="pipeline-screen" role="main">
      <div className="screen-header">
        <h1>{t('crm.pipeline.title')}</h1>
      </div>

      <div className="stats-row">
        <div className="stat">
          <div className="stat-label">{t('crm.pipeline.open_count')}</div>
          <div className="stat-value">{boardData.stats.openCount}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('crm.pipeline.total_premium')}</div>
          <div className="stat-value">₹{(boardData.stats.openExpectedPremiumPaise / 100).toLocaleString('en-IN')}</div>
        </div>
        <div className="stat">
          <div className="stat-label">{t('crm.pipeline.win_rate_90d')}</div>
          <div className="stat-value">{boardData.stats.winRate90d !== null ? `${boardData.stats.winRate90d}%` : '—'}</div>
        </div>
      </div>

      <PipelineBoard
        columns={boardData.columns}
        closed={boardData.closed}
        onMoveOpportunity={handleMoveOpportunity}
        onMarkLost={handleMarkLost}
      />
    </main>
  );
}
