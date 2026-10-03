import { RecordScope } from './ports';

/** Record scope for owned CRM records (M02 scopes): OWN → owner, UNIT_SUBTREE → owner's unit, TENANT → all. */
export function inScope(record: { ownerMemberId?: string; orgUnitId?: string }, scope: RecordScope): boolean {
  if (scope.kind === 'TENANT') return true;
  if (scope.kind === 'UNIT_SUBTREE') return !!record.orgUnitId && (scope.orgUnitIds ?? []).includes(record.orgUnitId);
  return !!scope.memberId && record.ownerMemberId === scope.memberId;
}

/** Start of the IST calendar day containing `at` (fixed +05:30, India has no DST). */
export function istDayStart(at: Date): Date {
  const offset = 330 * 60_000;
  const local = new Date(at.getTime() + offset);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - offset);
}
