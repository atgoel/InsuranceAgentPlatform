import { useState } from 'react';
import { BottomSheet, Button } from '../../../design-system';
import { useT } from '../../../lib/i18n';
import type { ComparisonField, ComparisonResponse } from '../api';
import { partyLabel } from '../partyLabels';

interface DuplicateComparisonProps {
  comparison: ComparisonResponse;
  choices: Record<string, 'A' | 'B'>;
  busy?: 'compare' | 'merge' | 'dismiss';
  failure?: string;
  onChoose: (field: string, side: 'A' | 'B') => void;
  onMerge: () => void;
  onDismiss: () => void;
  onClose: () => void;
}

type Translate = ReturnType<typeof useT>['t'];

const NONE = '–';

/** Language and channel preferences arrive as codes; everything else is the masked value the server sends. */
function valueText(t: Translate, field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return NONE;
  if (field === 'preferredLanguage') return partyLabel(t, 'language', String(value));
  if (field === 'preferredChannel') return partyLabel(t, 'preferredChannel', String(value));
  return String(value);
}

function sourceText(t: Translate, source: ComparisonResponse['sourceA']): string {
  return partyLabel(t, 'source', source.kind);
}

interface FieldRowProps {
  field: ComparisonField;
  choice: 'A' | 'B' | undefined;
  onChoose: (side: 'A' | 'B') => void;
}

function FieldRow({ field, choice, onChoose }: FieldRowProps) {
  const { t } = useT();
  const name = partyLabel(t, 'field', field.field);

  return (
    <tr>
      <th scope="row">{name}</th>
      {(['A', 'B'] as const).map((side) => (
        <td key={side}>
          <label className="option">
            <input
              type="radio"
              name={`choice-${field.field}`}
              aria-label={t('party.duplicates.keep_value', { field: name, side })}
              checked={choice === side}
              onChange={() => onChoose(side)}
            />
            <span>{valueText(t, field.field, side === 'A' ? field.a : field.b)}</span>
          </label>
        </td>
      ))}
    </tr>
  );
}

/** Field-by-field comparison with an A/B choice per field; merging asks for confirmation first (reversible for 30 days). */
export function DuplicateComparison({ comparison, choices, busy, failure, onChoose, onMerge, onDismiss, onClose }: DuplicateComparisonProps) {
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="comparison-panel" aria-label={t('party.duplicates.comparison_title')}>
      <h2>{t('party.duplicates.comparison_title')}</h2>
      <div className="comparison-scroll">
        <table className="comparison-table">
          <thead>
            <tr>
              <th scope="col">{t('party.duplicates.col_field')}</th>
              <th scope="col">{t('party.duplicates.record_a', { source: sourceText(t, comparison.sourceA) })}</th>
              <th scope="col">{t('party.duplicates.record_b', { source: sourceText(t, comparison.sourceB) })}</th>
            </tr>
          </thead>
          <tbody>
            {comparison.fields.map((field) => (
              <FieldRow key={field.field} field={field} choice={choices[field.field]} onChoose={(side) => onChoose(field.field, side)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="comparison-note">{t('party.duplicates.kept_note')}</p>
      {failure && (
        <p role="alert" className="comparison-error">
          {t('party.duplicates.action_failed', { reason: failure })}
        </p>
      )}
      <div className="sheet-actions">
        <Button variant="primary" disabled={busy !== undefined} onClick={() => setConfirming(true)}>
          {t('party.duplicates.merge_button')}
        </Button>
        <Button variant="secondary" loading={busy === 'dismiss'} disabled={busy !== undefined} onClick={onDismiss}>
          {t('party.duplicates.dismiss_button')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
      <BottomSheet open={confirming} title={t('party.duplicates.confirm_title')} onClose={() => setConfirming(false)}>
        <p>{t('party.duplicates.reversible_notice')}</p>
        <div className="sheet-actions">
          <Button
            variant="primary"
            loading={busy === 'merge'}
            onClick={() => {
              setConfirming(false);
              onMerge();
            }}
          >
            {t('party.duplicates.confirm_merge')}
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </BottomSheet>
    </section>
  );
}
