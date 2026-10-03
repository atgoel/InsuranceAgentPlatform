import { Button, BottomSheet } from '../../../design-system';
import { ComparisonResponse } from '../api';
import { useT } from '../../../lib/i18n';

interface DuplicateComparisonProps {
  open: boolean;
  onClose: () => void;
  comparison: ComparisonResponse | undefined;
  fieldChoices: Record<string, 'A' | 'B'>;
  onFieldChoice: (field: string, value: 'A' | 'B') => void;
  onMerge: () => void;
  onDismiss: () => void;
  merging: boolean;
  dismissing: boolean;
}

export function DuplicateComparison({
  open,
  onClose,
  comparison,
  fieldChoices,
  onFieldChoice,
  onMerge,
  onDismiss,
  merging,
  dismissing,
}: DuplicateComparisonProps) {
  const { t } = useT();

  return (
    <BottomSheet open={open} onClose={onClose} title={t('party.duplicates.comparison_title')}>
      <div className="comparison-content">
        {comparison && (
          <>
            <div className="comparison-table">
              {comparison.fields.map((field) => (
                <div key={field.field} className="comparison-row">
                  <div className="field-name">{field.field}</div>
                  <div className="field-options">
                    <label className="option">
                      <input
                        type="radio"
                        name={`choice-${field.field}`}
                        checked={fieldChoices[field.field] === 'A'}
                        onChange={() => onFieldChoice(field.field, 'A')}
                      />
                      <span>{String(field.a ?? '–')}</span>
                    </label>
                    <label className="option">
                      <input
                        type="radio"
                        name={`choice-${field.field}`}
                        checked={fieldChoices[field.field] === 'B'}
                        onChange={() => onFieldChoice(field.field, 'B')}
                      />
                      <span>{String(field.b ?? '–')}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="reversibility-notice">
              <strong>Merges are reversible for 30 days</strong>
              <p>You can undo this merge within 30 days. After that, the merge cannot be reversed.</p>
            </div>

            <div className="sheet-actions">
              <Button
                variant="primary"
                loading={merging}
                onClick={onMerge}
              >
                {t('party.duplicates.merge_button')}
              </Button>
              <Button
                variant="secondary"
                loading={dismissing}
                onClick={onDismiss}
              >
                {t('party.duplicates.dismiss_button')}
              </Button>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
