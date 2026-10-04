import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api/api-error';
import type { createPartyApi, HouseholdView, PartyListItem } from './api';

export interface HouseholdMemberRow {
  partyId: string;
  relation: string;
  name: string;
  roles: string[];
}

export type Loadable<T> =
  | { status: 'loading' }
  | { status: 'failed'; title: string }
  | { status: 'ready'; value: T };

type PartyApi = ReturnType<typeof createPartyApi>;

function failure(err: unknown): { status: 'failed'; title: string } {
  return { status: 'failed', title: err instanceof ApiError ? err.title : '' };
}

function toRows(household: HouseholdView, people: PartyListItem[]): HouseholdMemberRow[] {
  return household.members.map((member) => {
    const person = people.find((p) => p.id === member.partyId);
    return {
      partyId: member.partyId,
      relation: member.relation,
      name: person?.displayName ?? member.partyId,
      roles: person?.rolesSummary ?? [],
    };
  });
}

/** The household of one party (GET /parties/{id}); `undefined` value means the party has no household. */
export function usePartyHousehold(partyApi: PartyApi, partyId: string): Loadable<HouseholdView | undefined> {
  const [state, setState] = useState<{ partyId: string; result: Loadable<HouseholdView | undefined> }>();

  useEffect(() => {
    let cancelled = false;
    partyApi.getParty(partyId).then(
      (party) => !cancelled && setState({ partyId, result: { status: 'ready', value: party.household } }),
      (err: unknown) => !cancelled && setState({ partyId, result: failure(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [partyApi, partyId]);

  return state?.partyId === partyId ? state.result : { status: 'loading' };
}

/** Names and roles of the household members (GET /parties?householdId=), joined with the relation from the household. */
export function useHouseholdPeople(partyApi: PartyApi, household: HouseholdView): Loadable<HouseholdMemberRow[]> {
  const [state, setState] = useState<{ householdId: string; result: Loadable<HouseholdMemberRow[]> }>();

  useEffect(() => {
    let cancelled = false;
    partyApi.listParties({ householdId: household.id }).then(
      (people) => !cancelled && setState({ householdId: household.id, result: { status: 'ready', value: toRows(household, people.items) } }),
      (err: unknown) => !cancelled && setState({ householdId: household.id, result: failure(err) }),
    );
    return () => {
      cancelled = true;
    };
  }, [partyApi, household]);

  return state?.householdId === household.id ? state.result : { status: 'loading' };
}
