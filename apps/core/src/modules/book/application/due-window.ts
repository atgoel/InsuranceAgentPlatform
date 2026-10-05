import { addDays } from '../../../kernel/domain/ist';
import { DUE_LOOKAHEAD_DAYS, DueClassification, DueEngine } from '../domain/due-engine';
import { HeldPolicy } from '../domain/held-policy';
import { HeldPolicyRepository, RecordScope, Transaction } from './ports';

/** The policies the today worklist considers, each classified against `today`; shared by DueService.today and the M03 segment reader. */
export async function classifiedWindow(
  policies: HeldPolicyRepository,
  engine: DueEngine,
  tx: Transaction,
  today: string,
  scope: RecordScope,
): Promise<{ policy: HeldPolicy; due: DueClassification }[]> {
  const found = await policies.dueBetween(tx, addDays(today, -30), addDays(today, DUE_LOOKAHEAD_DAYS), scope);
  return found.map((policy) => ({ policy, due: engine.classify(policy.props, today) }));
}
