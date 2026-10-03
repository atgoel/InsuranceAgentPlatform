import { Button } from '../../../design-system';
import { DuplicateCandidateView } from '../api';
import { useT } from '../../../lib/i18n';

interface DuplicateQueueListProps {
  items: DuplicateCandidateView[];
  onCompare: (item: DuplicateCandidateView) => void;
}

export function DuplicateQueueList({ items, onCompare }: DuplicateQueueListProps) {
  const { t } = useT();

  return (
    <div className="queue-grid">
      {items.map((item) => (
        <div key={item.id} className="queue-item-card">
          <div className="item-header">
            <span className={`score-badge score-${item.score >= 90 ? 'high' : 'medium'}`}>
              {item.score}
            </span>
            <span className="rule-text">{item.rule}</span>
          </div>
          <p className="explanation">{item.explanation}</p>
          <div className="parties">
            <span>{item.a.displayName}</span>
            <span className="separator">⟷</span>
            <span>{item.b.displayName}</span>
          </div>
          <Button
            variant="primary"
            onClick={() => onCompare(item)}
            className="compare-button"
          >
            {t('party.duplicates.compare')}
          </Button>
        </div>
      ))}
    </div>
  );
}
