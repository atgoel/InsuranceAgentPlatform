import { RecordScope } from './ports';

/** Record scope for owned CRM records (M02 scopes): OWN → owner, UNIT_SUBTREE → owner's unit, TENANT → all. */
export function inScope(record: { ownerMemberId?: string; orgUnitId?: string }, scope: RecordScope): boolean {
  if (scope.kind === 'TENANT') return true;
  if (scope.kind === 'UNIT_SUBTREE') return !!record.orgUnitId && (scope.orgUnitIds ?? []).includes(record.orgUnitId);
  return !!scope.memberId && record.ownerMemberId === scope.memberId;
}

export { istDayStart } from '../../../kernel/domain/ist';
