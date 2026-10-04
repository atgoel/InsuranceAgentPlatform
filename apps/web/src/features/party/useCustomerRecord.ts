import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../../lib/api/api-error';
import type { ConsentSummaryItem, ContactabilityDecision, createPartyApi, HouseholdView, PartyRoleLink, PartyView } from './api';

type PartyApi = ReturnType<typeof createPartyApi>;

export type PartyDetail = PartyView & {
  household?: HouseholdView;
  roles: PartyRoleLink[];
  consentSummary: ConsentSummaryItem[];
};

export interface RecordDetail {
  party: PartyDetail;
  contactability: { whatsapp?: ContactabilityDecision; call?: ContactabilityDecision };
}

export interface CustomerRecordState {
  loading: boolean;
  error?: ApiError;
  detail?: RecordDetail;
  reload: () => void;
  setParty: (update: (party: PartyDetail) => PartyDetail) => void;
}

const unknown = () => undefined;

/** Loads the party and the Call / WhatsApp contactability decisions (a failed decision leaves the action enabled). */
export function useCustomerRecord(partyApi: PartyApi, id: string | undefined): CustomerRecordState {
  const [detail, setDetail] = useState<RecordDetail | undefined>();
  const [error, setError] = useState<ApiError | undefined>();
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!id) {
      return undefined;
    }
    let cancelled = false;
    Promise.all([
      partyApi.getParty(id),
      partyApi.checkContactability(id, 'WHATSAPP', 'SERVICE').catch(unknown),
      partyApi.checkContactability(id, 'CALL', 'SERVICE').catch(unknown),
    ]).then(
      ([party, whatsapp, call]) => {
        if (cancelled) return;
        setDetail({ party, contactability: { whatsapp, call } });
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
  }, [partyApi, id, attempt]);

  const reload = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  const setParty = useCallback((update: (party: PartyDetail) => PartyDetail) => {
    setDetail((prev) => (prev ? { ...prev, party: update(prev.party) } : prev));
  }, []);

  return { loading, error, detail, reload, setParty };
}
