import { EmptyState, LoadingSkeleton } from '../../../../design-system';
import { useT } from '../../../../lib/i18n';
import type { LeadListItem, LeadStage } from '../../api';
import { LabelText } from '../LabelText';
import { LeadCard } from './LeadCard';

const BOARD: LeadStage[] = ['NEW', 'CONTACTED', 'QUALIFIED'];

interface LeadsResultsProps {
  leads?: LeadListItem[];
  layout: 'list' | 'board';
}

/** The list or stage board; an undefined `leads` means the first load is still running. */
export function LeadsResults({ leads, layout }: LeadsResultsProps) {
  const { t } = useT();
  if (!leads) return <LoadingSkeleton />;
  if (leads.length === 0) return <EmptyState title={t('crm.leads.empty_title')} />;
  if (layout === 'list') {
    return <ul className="lead-cards">{leads.map((l) => <LeadCard key={l.id} lead={l} />)}</ul>;
  }
  return (
    <div className="lead-board">
      {BOARD.map((stage) => {
        const inStage = leads.filter((l) => l.stage === stage);
        return (
          <section key={stage} aria-label={t(`labels.leadStage.${stage}`)} className="board-column">
            <h2>
              <LabelText kind="leadStage" code={stage} /> ({inStage.length})
            </h2>
            <ul>{inStage.map((l) => <LeadCard key={l.id} lead={l} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}
