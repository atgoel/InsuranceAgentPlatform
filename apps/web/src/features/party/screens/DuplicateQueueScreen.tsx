import { useState, useEffect, useCallback } from 'react';
import { useApi } from '../../../lib/api';
import {
  LoadingSkeleton,
  ErrorState,
  PermissionDenied,
  EmptyState,
} from '../../../design-system';
import { ApiError } from '../../../lib/api/api-error';
import { useT } from '../../../lib/i18n';
import {
  createPartyApi,
  DuplicateCandidateView,
  ComparisonResponse,
  SurvivorChoice,
} from '../api';
import { DuplicateQueueList } from '../components/DuplicateQueueList';
import { DuplicateComparison } from '../components/DuplicateComparison';
import '../styles/DuplicateQueueScreen.css';

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
  const [queue, setQueue] = useState<DuplicateCandidateView[]>([]);
  const [comparison, setComparison] = useState<ComparisonState | undefined>();
  const [merging, setMerging] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const loadQueue = useCallback(async () => {
    try {
      setLoading(true);
      setError(undefined);
      const result = await partyApi.listDuplicates({ limit: 25 });
      setQueue(result.items);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, [partyApi]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadQueue();
  }, [loadQueue]);

  const handleCompare = async (item: DuplicateCandidateView) => {
    try {
      const comp = await partyApi.getDuplicateComparison(item.id);
      const choices: Record<string, 'A' | 'B'> = {};
      comp.fields.forEach((f) => { choices[f.field] = 'A'; });
      setComparison({ candidateId: item.id, comparison: comp, selectedSurvivor: 'A', fieldChoices: choices });
    } catch {
      // Silently handle comparison load failure
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
      const choices: SurvivorChoice[] = Object.entries(comparison.fieldChoices).map(([field, from]) => ({ field, from }));
      await partyApi.mergeDuplicates(comparison.candidateId, { survivor: comparison.selectedSurvivor, choices });
      setComparison(undefined);
      await loadQueue();
    } catch {
      // Silently handle merge failure
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
    } catch {
      // Silently handle dismiss failure
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
          body={t('party.duplicates.queue_empty_description')}
        />
      </div>
    );
  }

  return (
    <div className="duplicate-queue-screen">
      <div className="screen-header">
        <h1>{t('party.duplicates.title')}</h1>
        <p>{t('party.duplicates.description')}</p>
      </div>

      <DuplicateQueueList items={queue} onCompare={handleCompare} />

      <DuplicateComparison
        open={!!comparison}
        onClose={() => setComparison(undefined)}
        comparison={comparison?.comparison}
        fieldChoices={comparison?.fieldChoices ?? {}}
        onFieldChoice={handleFieldChoice}
        onMerge={handleMerge}
        onDismiss={handleDismiss}
        merging={merging}
        dismissing={dismissing}
      />
    </div>
  );
}
