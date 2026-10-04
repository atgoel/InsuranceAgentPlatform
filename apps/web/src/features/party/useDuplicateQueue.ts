import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api/api-error';
import type { ComparisonResponse, createPartyApi, DuplicateCandidateView, SurvivorChoice } from './api';

type PartyApi = ReturnType<typeof createPartyApi>;

export interface DuplicateQueueState {
  loading: boolean;
  error?: ApiError;
  items: DuplicateCandidateView[];
  reload: () => void;
}

const QUEUE_PAGE = 25;

/** GET /duplicates. The queue stays on screen while it reloads after a merge or dismissal. */
export function useDuplicateQueue(partyApi: PartyApi): DuplicateQueueState {
  const [items, setItems] = useState<DuplicateCandidateView[]>([]);
  const [error, setError] = useState<ApiError | undefined>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    partyApi.listDuplicates({ limit: QUEUE_PAGE }).then(
      (result) => {
        if (cancelled) return;
        setItems(result.items);
        setError(undefined);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err : new ApiError(0, 'network_error', ''));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [partyApi, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  return { loading, error, items, reload };
}

export interface ReviewState {
  candidateId: string;
  comparison: ComparisonResponse;
  choices: Record<string, 'A' | 'B'>;
}

export interface DuplicateReview {
  review?: ReviewState;
  busy?: 'compare' | 'merge' | 'dismiss';
  failure?: string;
  open: (candidateId: string) => Promise<void>;
  choose: (field: string, side: 'A' | 'B') => void;
  merge: () => Promise<void>;
  dismiss: () => Promise<void>;
  close: () => void;
}

/** One pair under review: compare, choose surviving values, merge or dismiss. A failed action is reported, not thrown. */
export function useDuplicateReview(partyApi: PartyApi, onDone: () => void, fallbackTitle: string): DuplicateReview {
  const [review, setReview] = useState<ReviewState | undefined>();
  const [busy, setBusy] = useState<DuplicateReview['busy']>();
  const [failure, setFailure] = useState<string | undefined>();

  const run = async (kind: 'compare' | 'merge' | 'dismiss', work: () => Promise<void>) => {
    setBusy(kind);
    setFailure(undefined);
    try {
      await work();
    } catch (err) {
      setFailure(err instanceof ApiError && err.title ? err.title : fallbackTitle);
    } finally {
      setBusy(undefined);
    }
  };

  const finish = () => {
    setReview(undefined);
    onDone();
  };

  const open = (candidateId: string) =>
    run('compare', async () => {
      const comparison = await partyApi.getDuplicateComparison(candidateId);
      const choices: Record<string, 'A' | 'B'> = {};
      comparison.fields.forEach((f) => {
        choices[f.field] = 'A';
      });
      setReview({ candidateId, comparison, choices });
    });

  const merge = () =>
    run('merge', async () => {
      if (!review) return;
      const choices: SurvivorChoice[] = Object.entries(review.choices).map(([field, from]) => ({ field, from }));
      await partyApi.mergeDuplicates(review.candidateId, { survivor: 'A', choices });
      finish();
    });

  const dismiss = () =>
    run('dismiss', async () => {
      if (!review) return;
      await partyApi.dismissDuplicate(review.candidateId);
      finish();
    });

  const choose = (field: string, side: 'A' | 'B') => {
    setReview((prev) => (prev ? { ...prev, choices: { ...prev.choices, [field]: side } } : prev));
  };

  const close = () => {
    setReview(undefined);
    setFailure(undefined);
  };

  return { review, busy, failure, open, choose, merge, dismiss, close };
}
