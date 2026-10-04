import { Button, Card } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import { useLabel } from '../../../lib/i18n/labels';
import type { LineOfBusiness, TieUp, TieUpsResponse } from '../api';

export interface TieUpsCardProps {
  lines: TieUpsResponse['lines'];
  edited: TieUp[];
  drafts: Record<string, string>;
  saveError?: string;
  onAdd(line: LineOfBusiness): void;
  onRemove(insurerId: string, line: LineOfBusiness): void;
  onDraftChange(line: LineOfBusiness, value: string): void;
}

interface LineSectionProps extends Omit<TieUpsCardProps, 'lines' | 'saveError'> {
  line: TieUpsResponse['lines'][number];
}

function LineSection({ line, edited, drafts, onAdd, onRemove, onDraftChange }: LineSectionProps) {
  const { t } = useT();
  const name = useLabel('line', line.line);
  const current = edited.filter((tieUp) => tieUp.line === line.line);
  const isFull = line.max !== null && current.length >= line.max;
  return (
    <div className="line-section">
      <div className="line-header">
        <strong>{name}</strong>
        <span className="limit-text">{`${current.length}${line.max !== null ? `/${line.max}` : ''}`}</span>
      </div>
      {isFull && <div className="limit-warning">{t('tenancy.setup.tie_up_limit_reached')}</div>}
      <ul className="insurers-list">
        {current.map((tieUp) => (
          <li key={tieUp.insurerId} className="insurer-chip">
            {tieUp.insurerId}
            <button
              type="button"
              className="remove-btn"
              onClick={() => onRemove(tieUp.insurerId, line.line)}
              aria-label={t('tenancy.setup.remove_insurer', { insurer: tieUp.insurerId, line: name })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {!isFull && (
        <div className="add-insurer">
          <input
            type="text"
            aria-label={t('tenancy.setup.insurer_id_for', { line: name })}
            placeholder={t('tenancy.setup.insurer_id')}
            value={drafts[line.line] ?? ''}
            onChange={(e) => onDraftChange(line.line, e.target.value)}
          />
          <Button variant="secondary" size="md" onClick={() => onAdd(line.line)}>
            {t('tenancy.setup.add_insurer')}
          </Button>
        </div>
      )}
    </div>
  );
}

export function TieUpsCard({ lines, saveError, ...rest }: TieUpsCardProps) {
  const { t } = useT();
  return (
    <Card title={t('tenancy.setup.tieups_title')}>
      <div className="tieups-section">
        {saveError && (
          <p role="alert" className="error-banner">
            {saveError}
          </p>
        )}
        {lines.map((line) => (
          <LineSection key={line.line} line={line} {...rest} />
        ))}
      </div>
    </Card>
  );
}
