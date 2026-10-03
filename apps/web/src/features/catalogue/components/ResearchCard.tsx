import { Button, StatusChip } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { LineOfBusiness, ResearchItem } from '../api';

interface ResearchCardProps {
  item: ResearchItem;
  onCompare: (line: LineOfBusiness) => void;
}

/** One approved research summary (M07 library): stale banner, POSP chip, points, source and date. */
export function ResearchCard({ item, onCompare }: ResearchCardProps) {
  const { t } = useT();
  return (
    <article className="research-card" aria-label={item.productName}>
      {item.stale && <div className="stale-banner">{t('catalogue.research.stale_banner')}</div>}
      <div className="card-header">
        <div className="card-title">
          <h3>{item.productName}</h3>
          <p className="insurer-name">{item.insurerName}</p>
        </div>
        {item.posEligible && <StatusChip tone="ok">{t('catalogue.research.posp_eligible')}</StatusChip>}
      </div>
      <p className="card-summary">{item.summary}</p>
      {item.points.length > 0 && (
        <ul className="card-points">
          {item.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      )}
      <div className="card-footer">
        <p className="card-source">
          {t('catalogue.research.source')}: {item.sourceRef} · {item.sourceDate}
        </p>
        <Button variant="secondary" onClick={() => onCompare(item.line)}>
          {t('catalogue.research.compare_button')}
        </Button>
      </div>
    </article>
  );
}
