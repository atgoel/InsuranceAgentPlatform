import { useEffect, useState } from 'react';
import type { CrmApi, LeadStats } from '../../api';

/**
 * Header counts for the saved-view chips (BUG-10). A failed stats call only hides the counts: the list is the screen,
 * the counts are decoration, so the failure is not an error state.
 */
export function useLeadStats(crmApi: CrmApi, reload: number): LeadStats | undefined {
  const [stats, setStats] = useState<LeadStats | undefined>();
  useEffect(() => {
    let cancelled = false;
    crmApi.getLeadStats().then(
      (result) => !cancelled && setStats(result),
      () => !cancelled && setStats(undefined),
    );
    return () => {
      cancelled = true;
    };
  }, [crmApi, reload]);
  return stats;
}

/** Follows `value` after it has been stable for `delayMs`, so typing does not send a request per keystroke. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
