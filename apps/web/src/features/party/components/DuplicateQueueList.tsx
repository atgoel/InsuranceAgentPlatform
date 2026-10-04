import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { DuplicateCandidateView } from '../api';
import { partyLabel } from '../partyLabels';

interface DuplicateQueueListProps {
  items: DuplicateCandidateView[];
  activeId?: string;
  busy: boolean;
  onCompare: (item: DuplicateCandidateView) => void;
}

/** Queue of candidate pairs with score, rule and explanation (CRM08 queue part). */
export function DuplicateQueueList({ items, activeId, busy, onCompare }: DuplicateQueueListProps) {
  const { t } = useT();

  return (
    <section className="duplicate-queue" aria-label={t('party.duplicates.queue')}>
      <h2>{t('party.duplicates.queue_count', { count: items.length })}</h2>
      <ul className="queue-grid">
        {items.map((item) => (
          <li key={item.id} className="queue-item-card" data-active={item.id === activeId}>
            <div className="item-header">
              <span className={`score-badge score-${item.score >= 90 ? 'high' : 'medium'}`}>{item.score}</span>
              <span className="rule-text">{partyLabel(t, 'rule', item.rule)}</span>
            </div>
            <p className="parties">
              {item.a.displayName} <span aria-hidden="true">↔</span> {item.b.displayName}
            </p>
            <p className="explanation">{item.explanation}</p>
            <Button variant="secondary" disabled={busy} onClick={() => onCompare(item)}>
              {t('party.duplicates.compare')}
              <span className="visually-hidden">
                {' '}
                {item.a.displayName} / {item.b.displayName}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
