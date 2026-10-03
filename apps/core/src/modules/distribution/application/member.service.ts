import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, NotFoundError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { EmailAddress, PhoneNumber } from '../../../kernel/domain';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { Principal } from '../../../kernel/tenancy/principal';
import { ENTITLEMENT_CHECKER, EntitlementChecker } from '../../tenancy/application/ports';
import { Member, SalespersonType } from '../domain/member';
import { OnboardingChecklist } from '../domain/onboarding';
import {
  CHECKLIST_REPOSITORY, ChecklistRepository, IDENTITY_ADMIN, IdentityAdmin, MEMBER_REPOSITORY, MemberRepository,
  ORG_UNIT_REPOSITORY, OrgUnitRepository, RECORD_SCOPE_PROVIDER, SELLER_DIRECTORY, SellerDirectory,
} from './ports';
import { DistributionContext } from './distribution-context';
import { RecordScopeResolver } from './record-scope.resolver';
import { inScope } from '../domain/roles';

export interface InviteInput {
  displayName: string;
  phone?: string;
  email?: string;
  roles: string[];
  salespersonType?: SalespersonType;
  orgUnitId: string;
}

export interface MemberPatch {
  roles?: string[];
  orgUnitId?: string;
  capacityPerDay?: number;
}

/** Tenant memberships: invite, update, (de)activate, exit (F02, F32, F92, F97; HLD K7 leavers). */
@Injectable()
export class MemberService {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(ORG_UNIT_REPOSITORY) private readonly units: OrgUnitRepository,
    @Inject(CHECKLIST_REPOSITORY) private readonly checklists: ChecklistRepository,
    @Inject(IDENTITY_ADMIN) private readonly identity: IdentityAdmin,
    @Inject(ENTITLEMENT_CHECKER) private readonly entitlements: EntitlementChecker,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
    @Inject(RECORD_SCOPE_PROVIDER) private readonly scopes: RecordScopeResolver,
    private readonly ctx: DistributionContext,
  ) {}

  invite(tenantId: string, input: InviteInput): Promise<Member> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      (await this.units.tree(tx)).get(input.orgUnitId); // unit must exist
      await this.assertSeatAvailable(tx);
      const member = Member.invite({
        id: this.ctx.ids.next('mem'), displayName: input.displayName, roles: input.roles, salespersonType: input.salespersonType,
        orgUnitId: input.orgUnitId, now: this.ctx.clock.now(),
        phone: input.phone ? PhoneNumber.parse(input.phone) : undefined, email: input.email ? EmailAddress.parse(input.email) : undefined,
      });
      await this.members.save(tx, member); // duplicate active contact in this tenant → 409 member_exists
      if (member.isSeller() && input.salespersonType) await this.checklists.save(tx, member.props.id, OnboardingChecklist.for(input.salespersonType));
      await this.identity.invite(tenantId, { memberId: member.props.id, contact: { phone: input.phone, email: input.email }, roles: input.roles });
      await this.record(tx, member, 'distribution.member.invited', { roles: input.roles, salespersonType: input.salespersonType ?? null });
      return member;
    });
  }

  get(tenantId: string, id: string, principal: Principal): Promise<Member> {
    return this.ctx.uow.run(tenantId, async (tx) => this.requireInScope(tx, id, principal));
  }

  list(tenantId: string, principal: Principal, filter: { status?: Member['props']['status']; role?: string; orgUnitId?: string; salespersonType?: SalespersonType; q?: string; cursor?: string; limit: number }) {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const scope = await this.scopes.resolve(tx, principal);
      const requested = filter.orgUnitId ? (await this.units.tree(tx)).subtreeIds(filter.orgUnitId) : undefined;
      const orgUnitIds = scope.kind === 'UNIT_SUBTREE' ? intersect(scope.orgUnitIds ?? [], requested) : requested;
      return this.members.list(tx, { ...filter, orgUnitIds, memberId: scope.kind === 'OWN' ? scope.memberId : undefined });
    });
  }

  update(tenantId: string, id: string, patch: MemberPatch, expectedVersion: number): Promise<Member> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const member = await this.require(tx, id);
      if (member.props.version !== expectedVersion) throw new PreconditionFailedError('version_mismatch', 'The member was changed by someone else; reload and retry');
      if (patch.orgUnitId) (await this.units.tree(tx)).get(patch.orgUnitId);
      if (patch.orgUnitId) member.moveTo(patch.orgUnitId);
      if (patch.capacityPerDay !== undefined) member.setCapacity(patch.capacityPerDay);
      if (patch.roles) await this.changeRoles(tenantId, member, patch.roles);
      await this.members.save(tx, member);
      await this.record(tx, member, 'distribution.member.updated', { fields: Object.keys(patch) });
      return member;
    });
  }

  transition(tenantId: string, id: string, to: 'active' | 'suspended', reason: string): Promise<Member> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const member = await this.require(tx, id);
      if (to === 'suspended') {
        member.suspend(this.ctx.clock.now());
        await this.cutAccess(tenantId, member);
        this.ctx.logger.security('security.member.suspended', 'Member suspended and sessions revoked', { memberId: id, reason });
      } else {
        member.activate(this.ctx.clock.now(), (await this.checklists.get(tx, id)) ?? OnboardingChecklist.restore([]));
      }
      await this.members.save(tx, member);
      await this.record(tx, member, `distribution.member.${to === 'suspended' ? 'suspended' : 'reactivated'}`, { reason });
      return member;
    });
  }

  exit(tenantId: string, id: string, input: { transferToMemberId?: string; reason: string }): Promise<Member> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const member = await this.require(tx, id);
      if (member.isSeller()) await this.assertTransferTarget(tx, id, input.transferToMemberId);
      member.exit(this.ctx.clock.now());
      await this.cutAccess(tenantId, member);
      await this.members.save(tx, member);
      // F97: customers stay with the tenant; consumers (M04) reassign records to the target. No export is produced.
      await this.record(tx, member, 'distribution.member.exited', { transferToMemberId: input.transferToMemberId ?? null, reason: input.reason });
      return member;
    });
  }

  async require(tx: Transaction, id: string): Promise<Member> {
    const member = await this.members.get(tx, id);
    if (!member) throw new NotFoundError('Member', id);
    return member;
  }

  private async requireInScope(tx: Transaction, id: string, principal: Principal): Promise<Member> {
    const member = await this.require(tx, id);
    const scope = await this.scopes.resolve(tx, principal);
    const self = principal.memberId === id;
    if (!self && !inScope(scope, { ownerMemberId: member.props.id, orgUnitId: member.props.orgUnitId })) throw new NotFoundError('Member', id);
    return member;
  }

  private async assertSeatAvailable(tx: Transaction): Promise<void> {
    const limit = await this.entitlements.limitFor(tx.tenantId, 'seats');
    if (limit !== null && (await this.members.countSeats(tx)) + 1 > limit) {
      throw new BusinessRuleError('seat_limit_reached', 'All seats on the current plan are in use', { limit });
    }
  }

  private async assertTransferTarget(tx: Transaction, exitingId: string, targetId?: string): Promise<void> {
    if (!targetId || targetId === exitingId) throw new BusinessRuleError('transfer_target_invalid', 'Choose an eligible active salesperson to take over this book');
    const eligible = await this.sellers.eligibleSellers(tx, { at: this.ctx.clock.now() });
    if (!eligible.some((s) => s.memberId === targetId)) throw new BusinessRuleError('transfer_target_invalid', 'The transfer target is not an eligible active salesperson');
  }

  private async changeRoles(tenantId: string, member: Member, roles: string[]): Promise<void> {
    member.changeRoles(roles);
    if (member.props.userRef) {
      await this.identity.updateRoles(tenantId, member.props.userRef, roles);
      await this.identity.revokeSessions(tenantId, member.props.userRef);
    }
    this.ctx.logger.security('security.member.roles_changed', 'Member roles changed; sessions revoked', { memberId: member.props.id, roles });
  }

  private async cutAccess(tenantId: string, member: Member): Promise<void> {
    if (!member.props.userRef) return;
    await this.identity.revokeSessions(tenantId, member.props.userRef);
    await this.identity.disable(tenantId, member.props.userRef);
  }

  private record(tx: Transaction, member: Member, type: string, data: Record<string, unknown>): Promise<void> {
    return this.ctx.recorder.record(tx, {
      event: { type, subject: member.props.id, data: { memberId: member.props.id, ...data } },
      audit: { action: type, entityType: 'member', entityId: member.props.id, metadata: data },
    });
  }
}

function intersect(scopeIds: string[], requested?: string[]): string[] {
  return requested ? scopeIds.filter((id) => requested.includes(id)) : scopeIds;
}
