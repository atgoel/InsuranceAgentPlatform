import { useState, useEffect } from 'react';
import { useApi } from '../../../lib/api';
import {
  Button,
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
  BottomSheet,
  StatusChip,
  EmptyState,
  DataGrid,
  type Column,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import {
  createPartyApi,
  DuplicateCandidateView,
  ComparisonResponse,
  SurvivorChoice,
} from '../api';
import '../styles/DuplicateQueueScreen.css';

interface QueueItem {
  id: string;
  score: number;
  rule: string;
  explanation: string;
  a: { displayName: string };
  b: { displayName: string };
}

interface ComparisonState {
  candidateId: string;
  comparison: ComparisonResponse;
  selectedSurvivor: 'A' | 'B';
  fieldChoices: Record<string, 'A' | 'B'>;
}

export function DuplicateQueueScreen() {
  const api = useApi();
  const partyApi = createPartyApi(api);
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [comparison, setComparison] = useState<ComparisonState | undefined>();
  const [merging, setMerging] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    loadQueue();
  }, []);

  const loadQueue = async () => {
    try {
      setLoading(true);
      setError(undefined);
      const result = await partyApi.listDuplicates({ limit: 25 });
      setQueue(
        result.items.map((item) => ({
          id: item.id,
          score: item.score,
          rule: item.rule,
          explanation: item.explanation,
          a: { displayName: item.a.displayName },
          b: { displayName: item.b.displayName },
        }))
      );
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError(err);
        } else {
          setError(err);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCompare = async (item: QueueItem) => {
    try {
      const comp = await partyApi.getDuplicateComparison(item.id);
      const choices: Record<string, 'A' | 'B'> = {};
      comp.fields.forEach((f) => {
        choices[f.field] = 'A';
      });
      setComparison({
        candidateId: item.id,
        comparison: comp,
        selectedSurvivor: 'A',
        fieldChoices: choices,
      });
    } catch (err) {
      console.error('Failed to load comparison', err);
    }
  };

  const handleFieldChoice = (field: string, value: 'A' | 'B') => {
    if (comparison) {
      setComparison({
        ...comparison,
        fieldChoices: { ...comparison.fieldChoices, [field]: value },
      });
    }
  };

  const handleMerge = async () => {
    if (!comparison) return;
    try {
      setMerging(true);
      const choices: SurvivorChoice[] = Object.entries(comparison.fieldChoices).map(
        ([field, from]) => ({
          field,
          from,
        })
      );
      await partyApi.mergeDuplicates(comparison.candidateId, {
        survivor: comparison.selectedSurvivor,
        choices,
      });
      setComparison(undefined);
      await loadQueue();
    } catch (err) {
      console.error('Merge failed', err);
    } finally {
      setMerging(false);
    }
  };

  const handleDismiss = async () => {
    if (!comparison) return;
    try {
      setDismissing(true);
      await partyApi.dismissDuplicate(comparison.candidateId);
      setComparison(undefined);
      await loadQueue();
    } catch (err) {
      console.error('Dismiss failed', err);
    } finally {
      setDismissing(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (error.status === 403) {
      return <PermissionDenied />;
    }
    return <ErrorState error={error} onRetry={loadQueue} />;
  }

  if (queue.length === 0) {
    return (
      <div className="duplicate-queue-screen">
        <EmptyState
          title={t('party.duplicates.queue_empty')}
          description={t('party.duplicates.queue_empty_description')}
          icon="✅"
        />
      </div>
    );
  }

  const columns: Column[] = [
    {
      key: 'score',
      label: t('party.duplicates.score'),
      render: (value) => (
        <span className={`score score-${value >= 90 ? 'high' : 'medium'}`}>{value}</span>
      ),
    },
    {
      key: 'rule',
      label: t('party.duplicates.rule'),
      render: (value) => value,
    },
    {
      key: 'explanation',
      label: t('party.duplicates.explanation'),
      render: (value) => value,
    },
    {
      key: 'a',
      label: t('party.duplicates.party_a'),
      render: (value: { displayName: string }) => value.displayName,
    },
    {
      key: 'b',
      label: t('party.duplicates.party_b'),
      render: (value: { displayName: string }) => value.displayName,
    },
  ];

  return (
    <div className="duplicate-queue-screen">
      <div className="screen-header">
        <h1>{t('party.duplicates.title')}</h1>
        <p>{t('party.duplicates.description')}</p>
      </div>

      <div className="queue-grid">
        {queue.map((item) => (
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
              size="sm"
              onClick={() => handleCompare(item)}
              className="compare-button"
            >
              {t('party.duplicates.compare')}
            </Button>
          </div>
        ))}
      </div>

      {comparison && (
        <BottomSheet
          isOpen={true}
          onClose={() => setComparison(undefined)}
          title={t('party.duplicates.comparison_title')}
        >
          <div className="comparison-content">
            <div className="comparison-table">
              {comparison.comparison.fields.map((field) => (
                <div key={field.field} className="comparison-row">
                  <div className="field-name">{field.field}</div>
                  <div className="field-options">
                    <label className="option">
                      <input
                        type="radio"
                        name={`choice-${field.field}`}
                        checked={comparison.fieldChoices[field.field] === 'A'}
                        onChange={() => handleFieldChoice(field.field, 'A')}
                      />
                      <span>{field.a ?? '–'}</span>
                    </label>
                    <label className="option">
                      <input
                        type="radio"
                        name={`choice-${field.field}`}
                        checked={comparison.fieldChoices[field.field] === 'B'}
                        onChange={() => handleFieldChoice(field.field, 'B')}
                      />
                      <span>{field.b ?? '–'}</span>
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div className="reversibility-notice">
              <strong>{t('party.duplicates.merge_reversible_title')}</strong>
              <p>{t('party.duplicates.merge_reversible_description')}</p>
            </div>

            <div className="sheet-actions">
              <Button
                variant="primary"
                loading={merging}
                onClick={handleMerge}
              >
                {t('party.duplicates.merge_button')}
              </Button>
              <Button
                variant="secondary"
                loading={dismissing}
                onClick={handleDismiss}
              >
                {t('party.duplicates.dismiss_button')}
              </Button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
