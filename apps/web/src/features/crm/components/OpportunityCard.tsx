import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import { formatPaise } from '../money';
import type { OpportunityStage, OpportunityView } from '../api';

const MS_PER_DAY = 86_400_000;

interface OpportunityCardProps {
  opportunity: OpportunityView;
  stage: OpportunityStage;
  canMoveBack: boolean;
  canMoveForward: boolean;
  onMove: (direction: -1 | 1) => void;
  onLost: () => void;
}

function ageInDays(stageEnteredAt: string): number {
  const entered = Date.parse(stageEnteredAt);
  if (Number.isNaN(entered)) {
    return 0;
  }
  return Math.max(0, Math.floor((Date.now() - entered) / MS_PER_DAY));
}

/** One opportunity: title, expected premium, product and age in stage, and the move and lost controls. */
export function OpportunityCard({ opportunity, stage, canMoveBack, canMoveForward, onMove, onLost }: OpportunityCardProps) {
  const { t } = useT();
  const product = useLabel('line', opportunity.productInterest);
  const age = t('crm.pipeline.age_days', { count: ageInDays(opportunity.stageEnteredAt) });
  const title = opportunity.title;

  return (
    <article className="opportunity-card" data-stage={stage}>
      <h4>{title}</h4>
      <p className="opp-amount">{formatPaise(opportunity.expectedPremium.amountPaise)}</p>
      <p className="opp-meta">{`${product} · ${age}`}</p>
      {opportunity.ownerName && <p className="opp-owner">{`${t('crm.pipeline.owner')}: ${opportunity.ownerName}`}</p>}
      <div className="opp-actions">
        {canMoveBack && (
          <button type="button" className="action-btn" aria-label={t('crm.pipeline.move_back', { title })} onClick={() => onMove(-1)}>
            ←
          </button>
        )}
        {canMoveForward && (
          <button type="button" className="action-btn" aria-label={t('crm.pipeline.move_forward', { title })} onClick={() => onMove(1)}>
            →
          </button>
        )}
        <button type="button" className="action-btn lost" aria-label={t('crm.pipeline.mark_lost', { title })} onClick={onLost}>
          {t('crm.pipeline.lost')}
        </button>
      </div>
    </article>
  );
}
