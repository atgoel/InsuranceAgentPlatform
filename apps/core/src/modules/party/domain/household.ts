import { ConflictError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

export type Relation = 'SELF' | 'SPOUSE' | 'CHILD' | 'PARENT' | 'SIBLING' | 'OTHER';

export interface HouseholdMember {
  readonly partyId: string;
  readonly relation: Relation;
}

export class Household {
  private members_: HouseholdMember[];
  readonly id: string;
  readonly name: string;

  private constructor(id: string, name: string, members: HouseholdMember[]) {
    this.id = id;
    this.name = name;
    this.members_ = members;
  }

  static create(input: { id: string; name: string; head: string }): Household {
    const members: HouseholdMember[] = [{ partyId: input.head, relation: 'SELF' }];
    return new Household(input.id, input.name, members);
  }

  static restore(input: { id: string; name: string; members: readonly HouseholdMember[] }): Household {
    return new Household(input.id, input.name, input.members.map((m) => ({ ...m })));
  }

  get headPartyId(): string {
    return this.members_.find((m) => m.relation === 'SELF')?.partyId ?? '';
  }

  add(partyId: string, relation: Relation): void {
    if (this.members_.some((m) => m.partyId === partyId)) {
      throw new ConflictError('already_in_household', 'Party is already a member of this household');
    }
    if (relation === 'SELF' && this.members_.some((m) => m.relation === 'SELF')) {
      throw new BusinessRuleError('household_single_self', 'A household can only have one SELF member');
    }
    this.members_.push({ partyId, relation });
  }

  remove(partyId: string): void {
    const idx = this.members_.findIndex((m) => m.partyId === partyId);
    if (idx < 0) return;

    const selfMember = this.members_.find((m) => m.relation === 'SELF');
    const isHead = selfMember?.partyId === partyId;

    if (isHead && this.members_.length > 1) {
      throw new BusinessRuleError('household_head_removal', 'Cannot remove the head while other members remain');
    }

    this.members_.splice(idx, 1);
  }

  get members(): readonly HouseholdMember[] {
    return Object.freeze([...this.members_]);
  }
}
