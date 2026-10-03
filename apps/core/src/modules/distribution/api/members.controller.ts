import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentPrincipal, RequirePermission } from '../../../kernel/tenancy/decorators';
import { Principal } from '../../../kernel/tenancy/principal';
import { Idempotent } from '../../../kernel/idempotency/idempotency.interceptor';
import { ZodValidationPipe } from '../../../kernel/http/zod-validation.pipe';
import { parseIfMatch } from '../../../kernel/http/if-match';
import { ForbiddenError } from '../../../kernel/errors/domain-errors';
import { TENANT_PERMISSION_POLICY } from '../../../kernel/tokens';
import { hasPermission, TenantPermissionPolicy } from '../../../kernel/tenancy/permissions';
import { Member } from '../domain/member';
import { MemberService } from '../application/member.service';
import { OnboardingService } from '../application/onboarding.service';
import { LicenceService } from '../application/licence.service';
import { LeaveService } from '../application/leave.service';
import { RoleCatalogueCache } from '../application/role.service';
import { OrgUnitService } from '../application/org-unit.service';
import { SELLER_DIRECTORY, SellerDirectory } from '../application/ports';
import { DistributionContext } from '../application/distribution-context';
import { memberView } from './member-view';
import {
  EvidenceSchema, ExitMemberSchema, InsurerCodeSchema, InviteMemberSchema, LeaveSchema, LicenceSchema, ListMembersQuery,
  MemberTransitionSchema, PatchMemberSchema, TrainingSchema,
} from './schemas';

/** Members, onboarding, licences and leave (W02, W10). Tenant always from the verified principal. */
@Controller('api/v1/members')
export class MembersController {
  constructor(
    private readonly members: MemberService,
    private readonly onboarding: OnboardingService,
    private readonly licences: LicenceService,
    private readonly leave: LeaveService,
    private readonly roles: RoleCatalogueCache,
    private readonly units: OrgUnitService,
    @Inject(TENANT_PERMISSION_POLICY) private readonly policy: TenantPermissionPolicy,
  ) {}

  @Get()
  @RequirePermission('distribution.member.read')
  async list(@CurrentPrincipal() p: Principal, @Query(new ZodValidationPipe(ListMembersQuery)) q: z.infer<typeof ListMembersQuery>) {
    const page = await this.members.list(p.tenantId, p, q);
    return { items: await this.views(p.tenantId, page.items), nextCursor: page.nextCursor };
  }

  @Post()
  @Idempotent()
  @RequirePermission('distribution.member.write')
  async invite(@CurrentPrincipal() p: Principal, @Body(new ZodValidationPipe(InviteMemberSchema)) body: z.infer<typeof InviteMemberSchema>) {
    return this.view(p.tenantId, await this.members.invite(p.tenantId, body));
  }

  @Get(':id')
  async get(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    const member = await this.members.get(p.tenantId, id, p);
    const [licences, checklist] = await Promise.all([this.licences.listForMember(p.tenantId, id), this.onboarding.get(p.tenantId, id).catch(() => undefined)]);
    return { ...(await this.view(p.tenantId, member)), licences, checklist };
  }

  @Patch(':id')
  @RequirePermission('distribution.member.write')
  async update(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Headers('if-match') ifMatch: string | undefined, @Body(new ZodValidationPipe(PatchMemberSchema)) body: z.infer<typeof PatchMemberSchema>) {
    return this.view(p.tenantId, await this.members.update(p.tenantId, id, body, parseIfMatch(ifMatch)));
  }

  @Post(':id/status-transitions')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('distribution.member.write')
  async transition(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(MemberTransitionSchema)) body: z.infer<typeof MemberTransitionSchema>) {
    return this.view(p.tenantId, await this.members.transition(p.tenantId, id, body.to, body.reason));
  }

  @Post(':id/exit')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('distribution.member.write')
  async exit(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(ExitMemberSchema)) body: z.infer<typeof ExitMemberSchema>) {
    return this.view(p.tenantId, await this.members.exit(p.tenantId, id, body));
  }

  @Post(':id/onboarding/evidence')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('distribution.onboarding.write')
  async evidence(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(EvidenceSchema)) body: z.infer<typeof EvidenceSchema>) {
    return { checklist: await this.onboarding.recordEvidence(p.tenantId, id, body.key, body) };
  }

  @Post(':id/onboarding/training')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('distribution.onboarding.write')
  async training(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(TrainingSchema)) body: z.infer<typeof TrainingSchema>) {
    return { checklist: await this.onboarding.logTraining(p.tenantId, id, body) };
  }

  @Put(':id/insurer-codes/:insurerId')
  @RequirePermission('distribution.onboarding.write')
  insurerCode(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Param('insurerId') insurerId: string, @Body(new ZodValidationPipe(InsurerCodeSchema)) body: z.infer<typeof InsurerCodeSchema>) {
    return this.onboarding.mapInsurerCode(p.tenantId, id, insurerId, body.code);
  }

  @Post(':id/activation')
  @HttpCode(200)
  @Idempotent()
  @RequirePermission('distribution.onboarding.approve')
  async activate(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.view(p.tenantId, await this.onboarding.activate(p.tenantId, id));
  }

  @Post(':id/licences')
  @Idempotent()
  @RequirePermission('distribution.licence.write')
  recordLicence(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(LicenceSchema)) body: z.infer<typeof LicenceSchema>) {
    return this.licences.record(p.tenantId, id, body);
  }

  @Post(':id/leave')
  @HttpCode(204)
  @Idempotent()
  async addLeave(@CurrentPrincipal() p: Principal, @Param('id') id: string, @Body(new ZodValidationPipe(LeaveSchema)) body: z.infer<typeof LeaveSchema>) {
    const canWrite = hasPermission(await this.policy.permissionsFor(p.roles, p.tenantId), 'distribution.member.write');
    if (p.memberId !== id && !canWrite) throw new ForbiddenError('permission_denied', 'Only the member or a member administrator can record leave');
    await this.leave.add(p.tenantId, id, body.from, body.to);
  }

  private async views(tenantId: string, members: Member[]) {
    return Promise.all(members.map((m) => this.view(tenantId, m)));
  }

  private async view(tenantId: string, member: Member) {
    const [catalogue, tree] = await Promise.all([this.roles.get(tenantId), this.units.tree(tenantId)]);
    return memberView(member, findName(tree.root, member.props.orgUnitId), catalogue);
  }
}

/** Licence expiry list and the caller's own selling scope. */
@Controller('api/v1')
export class DistributionQueriesController {
  constructor(
    private readonly licences: LicenceService,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
    private readonly ctx: DistributionContext,
  ) {}

  @Get('licences/expiring')
  @RequirePermission('distribution.licence.read')
  expiring(@CurrentPrincipal() p: Principal, @Query('withinDays') withinDays?: string) {
    return this.licences.expiring(p.tenantId, Math.min(365, Math.max(1, Number(withinDays ?? 60) || 60)));
  }

  @Get('me/selling-scope')
  async sellingScope(@CurrentPrincipal() p: Principal) {
    if (!p.memberId) throw new ForbiddenError('member_required', 'This action needs a member identity');
    const memberId = p.memberId;
    const scope = await this.ctx.uow.run(p.tenantId, (tx) => this.sellers.sellingScope(tx, memberId, this.ctx.clock.now()));
    if (!scope) throw new ForbiddenError('not_an_active_seller', 'Only active salespeople have a selling scope');
    return scope;
  }
}

function findName(node: { id: string; name: string; children: Array<{ id: string; name: string; children: unknown[] }> }, id: string): string | undefined {
  if (node.id === id) return node.name;
  for (const child of node.children) {
    const found = findName(child as typeof node, id);
    if (found) return found;
  }
  return undefined;
}
