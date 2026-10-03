import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { Household, Relation } from '../domain/household';
import { HOUSEHOLD_CHANGED } from '../domain/events';
import { HOUSEHOLD_REPOSITORY, HouseholdRepository, Transaction } from './ports';
import { PartyContext } from './party-context';
import { PartyService } from './party.service';

/** Optional household linking: one SELF, a party in at most one household (AC-M03-12). */
@Injectable()
export class HouseholdService {
  constructor(
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    private readonly parties: PartyService,
    private readonly ctx: PartyContext,
  ) {}

  create(principal: Principal, input: { name: string; headPartyId: string }): Promise<Household> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      await this.parties.requireInScope(tx, principal, input.headPartyId);
      await this.assertNotInHousehold(tx, input.headPartyId);
      const household = Household.create({ id: this.ctx.ids.next('hh'), name: input.name, head: input.headPartyId });
      await this.households.save(tx, household);
      await this.changed(tx, household, 'created');
      return household;
    });
  }

  addMember(principal: Principal, householdId: string, partyId: string, relation: Relation): Promise<Household> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const household = await this.require(tx, householdId);
      await this.parties.requireInScope(tx, principal, partyId);
      await this.assertNotInHousehold(tx, partyId);
      household.add(partyId, relation);
      await this.households.save(tx, household);
      await this.changed(tx, household, 'member_added');
      return household;
    });
  }

  removeMember(principal: Principal, householdId: string, partyId: string): Promise<void> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const household = await this.require(tx, householdId);
      await this.parties.requireInScope(tx, principal, partyId);
      household.remove(partyId);
      await this.households.save(tx, household);
      await this.changed(tx, household, 'member_removed');
    });
  }

  private async assertNotInHousehold(tx: Transaction, partyId: string): Promise<void> {
    if (await this.households.forParty(tx, partyId)) throw new ConflictError('already_in_household', 'This customer already belongs to a household');
  }

  private async require(tx: Transaction, id: string): Promise<Household> {
    const h = await this.households.get(tx, id);
    if (!h) throw new NotFoundError('household', id);
    return h;
  }

  private changed(tx: Transaction, h: Household, change: string): Promise<void> {
    return this.ctx.recorder.record(tx, {
      event: { type: HOUSEHOLD_CHANGED, subject: h.id, data: { householdId: h.id, change, members: h.members.length } },
      audit: { action: HOUSEHOLD_CHANGED, entityType: 'household', entityId: h.id, metadata: { change } },
    });
  }
}
