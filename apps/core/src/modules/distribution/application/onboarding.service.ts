import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { Member } from '../domain/member';
import { ChecklistItemKey, OnboardingChecklist } from '../domain/onboarding';
import { CHECKLIST_REPOSITORY, ChecklistRepository, INSURER_CODE_REPOSITORY, InsurerCodeRepository, MEMBER_REPOSITORY, MemberRepository, SELLER_DIRECTORY, SellerDirectory } from './ports';
import { DistributionContext } from './distribution-context';
import { MemberService } from './member.service';

/** ISP/POSP onboarding evidence and activation (F32, F92). Evidence references only — never PAN or documents. */
@Injectable()
export class OnboardingService {
  constructor(
    @Inject(CHECKLIST_REPOSITORY) private readonly checklists: ChecklistRepository,
    @Inject(INSURER_CODE_REPOSITORY) private readonly codes: InsurerCodeRepository,
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
    private readonly memberService: MemberService,
    private readonly ctx: DistributionContext,
  ) {}

  get(tenantId: string, memberId: string) {
    return this.ctx.uow.run(tenantId, async (tx) => (await this.require(tx, memberId)).items());
  }

  recordEvidence(tenantId: string, memberId: string, key: ChecklistItemKey, input: { evidenceRef: string; note?: string }) {
    return this.mutate(tenantId, memberId, `evidence.${key}`, (c) => c.recordEvidence(key, input, this.ctx.clock.now()));
  }

  logTraining(tenantId: string, memberId: string, input: { hours: number; evidenceRef: string }) {
    return this.mutate(tenantId, memberId, 'training', (c) => c.logTraining(input.hours, input.evidenceRef, this.ctx.clock.now()));
  }

  mapInsurerCode(tenantId: string, memberId: string, insurerId: string, code: string) {
    return this.ctx.uow.run(tenantId, async (tx) => {
      await this.memberService.require(tx, memberId);
      await this.codes.put(tx, memberId, insurerId, code);
      const checklist = await this.checklists.get(tx, memberId);
      if (checklist?.items().some((i) => i.key === 'INSURER_CODE')) {
        checklist.markInsurerCodeMapped(this.ctx.clock.now());
        await this.checklists.save(tx, memberId, checklist);
      }
      await this.ctx.recorder.record(tx, { audit: { action: 'distribution.insurer_code.mapped', entityType: 'member', entityId: memberId, metadata: { insurerId } } });
      return { insurerId, code };
    });
  }

  activate(tenantId: string, memberId: string): Promise<Member> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const member = await this.memberService.require(tx, memberId);
      const checklist = (await this.checklists.get(tx, memberId)) ?? OnboardingChecklist.restore([]);
      if (member.isSeller() && !checklist.isComplete()) {
        throw new BusinessRuleError('onboarding_incomplete', 'Complete the onboarding checklist before activation', { missing: checklist.missing() });
      }
      member.activate(this.ctx.clock.now(), checklist);
      await this.members.save(tx, member);
      const scope = await this.sellers.sellingScope(tx, memberId, this.ctx.clock.now());
      await this.ctx.recorder.record(tx, {
        event: { type: 'distribution.member.activated', subject: memberId, data: { memberId, salespersonType: member.props.salespersonType ?? null, sellingScope: scope ?? null } },
        audit: { action: 'distribution.member.activate', entityType: 'member', entityId: memberId },
      });
      return member;
    });
  }

  private mutate(tenantId: string, memberId: string, what: string, change: (c: OnboardingChecklist) => void) {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const checklist = await this.require(tx, memberId);
      change(checklist);
      await this.checklists.save(tx, memberId, checklist);
      await this.ctx.recorder.record(tx, { audit: { action: `distribution.onboarding.${what}`, entityType: 'member', entityId: memberId } });
      return checklist.items();
    });
  }

  private async require(tx: Transaction, memberId: string): Promise<OnboardingChecklist> {
    await this.memberService.require(tx, memberId);
    const checklist = await this.checklists.get(tx, memberId);
    if (!checklist) throw new BusinessRuleError('onboarding_not_applicable', 'This member has no onboarding checklist');
    return checklist;
  }
}
