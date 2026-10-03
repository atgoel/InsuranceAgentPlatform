import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import { type BoardColumn, type OpportunityStage, type LostReason } from '../api';

interface PipelineBoardProps {
  columns: BoardColumn[];
  closed: { issued: number; lost: number };
  onMoveOpportunity: (opportunityId: string, toStage: OpportunityStage) => void;
  onMarkLost: (opportunityId: string, reason: LostReason) => void;
}

export function PipelineBoard({ columns, closed, onMoveOpportunity, onMarkLost }: PipelineBoardProps) {
  const { t } = useT();
  const [showLostForm, setShowLostForm] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState<LostReason | undefined>();

  const handleLostSubmit = (opportunityId: string) => {
    if (!lostReason) return;
    onMarkLost(opportunityId, lostReason);
    setShowLostForm(null);
    setLostReason(undefined);
  };

  const getColumnLabel = (stage: OpportunityStage): string => {
    switch (stage) {
      case 'DISCOVERY':
        return t('crm.pipeline.discovery');
      case 'QUOTE_SHARED':
        return t('crm.pipeline.quote_shared');
      case 'PROPOSAL_COMPLETE':
        return t('crm.pipeline.proposal_complete');
      case 'INSURER_PENDING':
        return t('crm.pipeline.insurer_pending');
      default:
        return stage;
    }
  };

  return (
    <div className="pipeline-board">
      <div className="board-columns">
        {columns.map((column) => (
          <div key={column.stage} className="board-column">
            <div className="column-header">
              <h3>{getColumnLabel(column.stage)}</h3>
              <div className="column-stats">
                <span className="count">{column.count}</span>
                <span className="premium">₹{(column.totalExpectedPremiumPaise / 100).toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="column-cards">
              {column.items.map((opp) => (
                <div key={opp.id} className="opportunity-card">
                  <h4>{opp.title}</h4>
                  <p className="opp-amount">₹{(opp.expectedPremium.amountPaise / 100).toLocaleString('en-IN')}</p>

                  <div className="opp-actions">
                    {column.stage !== 'INSURER_PENDING' && column.stage !== 'ISSUED' && column.stage !== 'LOST' && (
                      <>
                        {column.stage !== 'DISCOVERY' && (
                          <button
                            className="action-btn"
                            onClick={() => {
                              const stages: OpportunityStage[] = ['DISCOVERY', 'QUOTE_SHARED', 'PROPOSAL_COMPLETE', 'INSURER_PENDING'];
                              const currentIdx = stages.indexOf(column.stage);
                              if (currentIdx > 0) {
                                onMoveOpportunity(opp.id, stages[currentIdx - 1]);
                              }
                            }}
                          >
                            ← {t('crm.pipeline.prev')}
                          </button>
                        )}
                        {column.stage !== 'INSURER_PENDING' && (
                          <button
                            className="action-btn"
                            onClick={() => {
                              const stages: OpportunityStage[] = ['DISCOVERY', 'QUOTE_SHARED', 'PROPOSAL_COMPLETE', 'INSURER_PENDING'];
                              const currentIdx = stages.indexOf(column.stage);
                              if (currentIdx < stages.length - 1) {
                                onMoveOpportunity(opp.id, stages[currentIdx + 1]);
                              }
                            }}
                          >
                            {t('crm.pipeline.next')} →
                          </button>
                        )}
                      </>
                    )}
                    <button
                      className="action-btn lost"
                      onClick={() => setShowLostForm(opp.id)}
                    >
                      {t('crm.pipeline.lost')}
                    </button>
                  </div>

                  {showLostForm === opp.id && (
                    <div className="lost-form">
                      <select
                        value={lostReason || ''}
                        onChange={(e) => setLostReason(e.target.value as LostReason)}
                      >
                        <option value="">{t('crm.pipeline.select_reason')}</option>
                        <option value="BOUGHT_ELSEWHERE">Bought Elsewhere</option>
                        <option value="PREMIUM_TOO_HIGH">Premium Too High</option>
                        <option value="DECLINED_BY_UNDERWRITING">Declined by Underwriting</option>
                        <option value="NOT_REACHABLE">Not Reachable</option>
                        <option value="POSTPONED">Postponed</option>
                        <option value="NOT_INTERESTED">Not Interested</option>
                        <option value="OTHER">Other</option>
                      </select>
                      <button
                        className="btn-sm"
                        onClick={() => handleLostSubmit(opp.id)}
                        disabled={!lostReason}
                      >
                        {t('crm.pipeline.confirm')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="board-closed">
        <div className="closed-stat">
          <span className="label">{t('crm.pipeline.issued')}</span>
          <span className="value">{closed.issued}</span>
        </div>
        <div className="closed-stat">
          <span className="label">{t('crm.pipeline.lost')}</span>
          <span className="value">{closed.lost}</span>
        </div>
      </div>

      <div className="pipeline-note">
        {t('crm.pipeline.issued_only_by_insurer')}
      </div>
    </div>
  );
}
