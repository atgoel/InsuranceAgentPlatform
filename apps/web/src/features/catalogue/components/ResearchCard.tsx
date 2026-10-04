import { Button, StatusChip, formatIstDate } from '../../../design-system';
import { useLabel } from '../../../lib/i18n/labels';
import { useT } from '../../../lib/i18n';
import type { LineOfBusiness, ResearchItem } from '../api';

interface ResearchCardProps {
  item: ResearchItem;
  onCompare: (line: LineOfBusiness) => void;
}

/** One approved research summary (M07 library): stale banner, POSP chip, points, source and date. */
export function ResearchCard({ item, onCompare }: ResearchCardProps) {
  const { t, lang } = useT();
  const line = useLabel('line', item.line);
  return (
    <article className="research-card" aria-label={item.productName}>
      {item.stale && <div className="stale-banner">{t('catalogue.research.stale_banner')}</div>}
      <div className="plan-card-header">
        <div className="plan-card-title">
          <h3>{item.productName}</h3>
          <p className="insurer-name">{item.insurerName}</p>
          <p className="insurer-name">{line}</p>
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
          {t('catalogue.research.source')}: {item.sourceRef} · {formatIstDate(item.sourceDate, lang)}
        </p>
        <Button variant="secondary" onClick={() => onCompare(item.line)}>
          {t('catalogue.research.compare_button')}
        </Button>
      </div>
    </article>
  );
}
