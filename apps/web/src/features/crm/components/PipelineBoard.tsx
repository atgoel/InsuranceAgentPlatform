import { useState } from 'react';
import { useT } from '../../../lib/i18n';
import { formatPaise } from '../money';
import { type BoardColumn, type OpportunityStage, type OpportunityView, type LostReason } from '../api';
import { OpportunityCard } from './OpportunityCard';
import { LostReasonSheet } from './LostReasonSheet';

const OPEN_STAGES: OpportunityStage[] = ['DISCOVERY', 'QUOTE_SHARED', 'PROPOSAL_COMPLETE', 'INSURER_PENDING'];

const STAGE_LABEL_KEYS: Partial<Record<OpportunityStage, string>> = {
  DISCOVERY: 'crm.pipeline.discovery',
  QUOTE_SHARED: 'crm.pipeline.quote_shared',
  PROPOSAL_COMPLETE: 'crm.pipeline.proposal_complete',
  INSURER_PENDING: 'crm.pipeline.insurer_pending',
};

interface PipelineBoardProps {
  columns: BoardColumn[];
  closed: { issued: number; lost: number };
  onMoveOpportunity: (opportunityId: string, toStage: OpportunityStage) => void;
  onMarkLost: (opportunityId: string, reason: LostReason) => void;
}

function ColumnHeader({ column }: { column: BoardColumn }) {
  const { t } = useT();
  const labelKey = STAGE_LABEL_KEYS[column.stage];
  return (
    <div className="column-header">
      <h3>{labelKey ? t(labelKey) : ''}</h3>
      <div className="column-stats">
        <span className="count">{column.count}</span>
        <span className="premium">{formatPaise(column.totalExpectedPremiumPaise)}</span>
      </div>
    </div>
  );
}

interface ColumnProps {
  column: BoardColumn;
  onMove: (opportunity: OpportunityView, direction: -1 | 1) => void;
  onLost: (opportunity: OpportunityView) => void;
}

function Column({ column, onMove, onLost }: ColumnProps) {
  const { t } = useT();
  const index = OPEN_STAGES.indexOf(column.stage);
  return (
    <section className="board-column" data-stage={column.stage} aria-label={t(STAGE_LABEL_KEYS[column.stage] ?? '')}>
      <ColumnHeader column={column} />
      <div className="column-cards">
        {column.items.length === 0 && <p className="empty-column">{t('crm.pipeline.empty_column')}</p>}
        {column.items.map((opp) => (
          <OpportunityCard
            key={opp.id}
            opportunity={opp}
            stage={column.stage}
            canMoveBack={index > 0}
            canMoveForward={index < OPEN_STAGES.length - 1}
            onMove={(direction) => onMove(opp, direction)}
            onLost={() => onLost(opp)}
          />
        ))}
      </div>
    </section>
  );
}

/** Horizontal kanban of the open stages. Won is never a control: the insurer's issuance confirmation sets it. */
export function PipelineBoard({ columns, closed, onMoveOpportunity, onMarkLost }: PipelineBoardProps) {
  const { t } = useT();
  const [lostTarget, setLostTarget] = useState<OpportunityView | undefined>();

  const move = (opportunity: OpportunityView, direction: -1 | 1) => {
    const index = OPEN_STAGES.indexOf(opportunity.stage);
    onMoveOpportunity(opportunity.id, OPEN_STAGES[index + direction]);
  };

  const confirmLost = (reason: LostReason) => {
    if (lostTarget) {
      onMarkLost(lostTarget.id, reason);
    }
    setLostTarget(undefined);
  };

  return (
    <div className="pipeline-board">
      <div className="board-columns" role="group" aria-label={t('crm.pipeline.board_label')}>
        {columns.map((column) => (
          <Column key={column.stage} column={column} onMove={move} onLost={setLostTarget} />
        ))}
      </div>
      <div className="board-closed">
        <span className="closed-stat">{`${t('crm.pipeline.closed_issued')}: ${closed.issued}`}</span>
        <span className="closed-stat">{`${t('crm.pipeline.closed_lost')}: ${closed.lost}`}</span>
      </div>
      <LostReasonSheet key={lostTarget?.id ?? 'closed'} title={lostTarget?.title} onCancel={() => setLostTarget(undefined)} onConfirm={confirmLost} />
    </div>
  );
}
