import { Inject, Injectable } from '@nestjs/common';
import { addDays } from '../../../kernel/domain/ist';
import { DUE_LOOKAHEAD_DAYS, DueClassification, DueEngine } from '../domain/due-engine';
import { LIFE_GRACE } from '../domain/premium-schedule';
import { PARTY_FACADE, PartyFacade } from '../../party/application/ports';
import { HeldPolicy, TERMINAL_STATUSES } from '../domain/held-policy';
import { HELD_POLICY_REPOSITORY, HeldPolicyRepository, PartyBookSegmentReader, RecordScope, Transaction } from './ports';
import { classifiedWindow } from './due-window';

const DUE_STATUSES: readonly string[] = ['DUE_TODAY', 'IN_GRACE', 'RENEWAL_DUE'];
const INSURED_ROLES: readonly string[] = ['INSURED', 'LIFE_ASSURED'];

/** M07 read port for the M03 "With dues" and "No policy" segments; runs on the caller's transaction (memory or Postgres RLS). */
@Injectable()
export class BookSegmentReader implements PartyBookSegmentReader {
  constructor(
    @Inject(HELD_POLICY_REPOSITORY) private readonly policies: HeldPolicyRepository,
    @Inject(PARTY_FACADE) private readonly parties: Pick<PartyFacade, 'rolesForSubject'>,
  ) {}

  private readonly engine = new DueEngine(LIFE_GRACE);

  async partyIdsWithDues(tx: Transaction, scope: RecordScope, today: string): Promise<string[]> {
    const window = await classifiedWindow(this.policies, this.engine, tx, today, scope);
    const horizon = addDays(today, DUE_LOOKAHEAD_DAYS);
    const ids = new Set<string>();
    for (const { policy, due } of window) {
      if (isDue(policy, due, horizon)) ids.add(policy.props.proposerPartyId);
    }
    return [...ids];
  }

  /** Not scoped: "No policy" must be true for the party even when its policy is serviced outside the caller's scope. */
  async partyIdsWithAnyPolicy(tx: Transaction, _scope: RecordScope): Promise<string[]> {
    const ids = new Set<string>();
    for (const policy of await this.policies.all(tx)) {
      ids.add(policy.props.proposerPartyId);
      const roles = await this.parties.rolesForSubject(tx, 'HELD_POLICY', policy.props.id);
      for (const role of roles) {
        if (INSURED_ROLES.includes(role.role)) ids.add(role.partyId);
      }
    }
    return [...ids];
  }
}

function isDue(policy: HeldPolicy, due: DueClassification, horizon: string): boolean {
  if (TERMINAL_STATUSES.includes(policy.props.status)) return false;
  if (DUE_STATUSES.includes(due.status)) return true;
  return due.status === 'UPCOMING' && !!due.dueDate && due.dueDate <= horizon;
}
