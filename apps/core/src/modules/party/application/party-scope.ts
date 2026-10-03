import { Party } from '../domain/party';
import { RecordScope } from './ports';

/** Record-scope check for one party (M02 scopes: OWN → owner, UNIT_SUBTREE → org units, TENANT → all). */
export function inScope(party: Party, scope: RecordScope): boolean {
  if (scope.kind === 'TENANT') return true;
  if (scope.kind === 'UNIT_SUBTREE') return !!party.props.orgUnitId && (scope.orgUnitIds ?? []).includes(party.props.orgUnitId);
  return !!scope.memberId && party.props.ownerMemberId === scope.memberId;
}
