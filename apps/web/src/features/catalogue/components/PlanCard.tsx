import { Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ScopedVersion, VersionDetail } from '../api';

interface PlanCardProps {
  version: ScopedVersion;
  selected: boolean;
  /** Key facts, once loaded for the selected plan. */
  detail?: VersionDetail;
  onToggle: (versionId: string) => void;
}

/** One in-scope plan on the compare screen. Plans come only from the API's scope evaluation. */
export function PlanCard({ version, selected, detail, onToggle }: PlanCardProps) {
  const { t } = useT();
  return (
    <article className={`compare-card ${selected ? 'selected' : ''}`} aria-label={version.productName}>
      <div className="card-header">
        <div className="card-title">
          <h3>{version.productName}</h3>
          <p className="insurer-name">{version.insurerName}</p>
        </div>
      </div>
      {detail && detail.keyFacts.length > 0 && (
        <div className="card-details key-facts">
          <h4>{t('catalogue.compare.key_facts')}</h4>
          <dl className="facts-grid">
            {detail.keyFacts.map((fact) => (
              <div key={fact.label} className="fact-item">
                <dt className="fact-label">{fact.label}</dt>
                <dd className="fact-value">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <Button variant={selected ? 'primary' : 'secondary'} aria-pressed={selected} onClick={() => onToggle(version.versionId)}>
        {t(selected ? 'catalogue.compare.selected' : 'catalogue.compare.select')}
      </Button>
      {selected && <p className="card-action action-text">{t('catalogue.compare.quotes_coming')}</p>}
    </article>
  );
}
