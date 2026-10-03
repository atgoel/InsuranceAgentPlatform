import { Inject, Injectable } from '@nestjs/common';
import { CustomFieldDefinition, CustomFieldValidator } from '../../../kernel/custom-fields';
import { Lead, LeadProps, LeadStage } from '../domain/lead';
import { StageRuleSet } from '../domain/stage-rules';
import { Activity } from '../domain/activity';
import { ACTIVITY_REPOSITORY, ActivityRepository, PARTY_FACADE, PartyFacade, SELLER_DIRECTORY, STAGE_RULES, SellerDirectory, TASK_REPOSITORY, TaskRepository, Transaction } from './ports';
import { CrmContext } from './crm-context';
import { CRM_SYNC_STATE_REPOSITORY, CrmSyncStateRepository } from './twenty-sync.ports';

const MARKETING_CHANNELS = ['CALL', 'WHATSAPP', 'SMS'] as const;

/** Builds masked lead views from Core records plus M03 (party) and M02 (owner names). Never raw contacts. */
@Injectable()
export class LeadViews {
  constructor(
    @Inject(PARTY_FACADE) private readonly parties: PartyFacade,
    @Inject(SELLER_DIRECTORY) private readonly sellers: SellerDirectory,
    @Inject(ACTIVITY_REPOSITORY) private readonly activities: ActivityRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(STAGE_RULES) private readonly stageRules: StageRuleSet,
    @Inject(CRM_SYNC_STATE_REPOSITORY) private readonly sync: CrmSyncStateRepository,
    private readonly ctx: CrmContext,
  ) {}

  async listItems(tx: Transaction, leads: Lead[]) {
    const names = await this.sellers.displayNames(tx, leads.flatMap((l) => (l.props.ownerMemberId ? [l.props.ownerMemberId] : [])));
    const defs = await this.ctx.defs.activeFor(tx, 'lead');
    return Promise.all(leads.map((l) => this.listItem(tx, l, names, defs)));
  }

  async detail(tx: Transaction, lead: Lead) {
    const p = lead.props;
    const [[item], party, activities, openTasks, possibleMatches, consentSummary, consentRecorded] = await Promise.all([
      this.listItems(tx, [lead]),
      this.parties.summary(tx, p.partyId),
      this.activities.forSubject(tx, 'LEAD', p.id, 50),
      this.tasks.openForSubject(tx, 'LEAD', p.id),
      this.parties.candidatesFor(tx, p.partyId),
      this.parties.consentSummary(tx, p.partyId),
      this.consentRecorded(tx, p.partyId),
    ]);
    return {
      ...item,
      contact: { mobileMasked: party?.primaryMobileMasked, emailMasked: party?.primaryEmailMasked, preferredChannel: party?.preferredChannel },
      pincode: p.pincode, qualification: p.qualification, attribution: p.attribution, stageHistory: p.stageHistory,
      stageRules: this.stageRuleStatus(p, activities, consentRecorded),
      possibleMatches, consentSummary, activities,
      openTasks: openTasks.map((t) => t.props),
      convertedOpportunityId: p.convertedOpportunityId, version: p.version,
      // Detail: visible (unmasked) values of active definitions; the list item carries the masked set.
      customFields: CustomFieldValidator.visible(await this.ctx.defs.activeFor(tx, 'lead'), p.customFields),
    };
  }

  /** consentRecorded for stage rules: contact for SERVICE by call is not refused (M04 §5.2). */
  async consentRecorded(tx: Transaction, partyId: string): Promise<boolean> {
    return (await this.parties.contactability(tx, partyId, 'CALL', 'SERVICE', this.ctx.clock.now())).allowed;
  }

  private stageRuleStatus(lead: LeadProps, activities: Activity[], consentRecorded: boolean) {
    const ctx = { activities, lead, consentRecorded };
    const status: Partial<Record<LeadStage, { met: boolean; missing: string[] }>> = {};
    for (const stage of ['CONTACTED', 'QUALIFIED'] as const) {
      const missing = this.stageRules.missingFor(stage, ctx);
      status[stage] = { met: missing.length === 0, missing };
    }
    return status;
  }

  private async listItem(tx: Transaction, lead: Lead, ownerNames: Record<string, string>, defs: readonly CustomFieldDefinition[]) {
    const p = lead.props;
    const now = this.ctx.clock.now();
    const [sync, party, ...marketing] = await Promise.all([
      this.sync.get(tx, 'lead', p.id),
      this.parties.summary(tx, p.partyId),
      ...MARKETING_CHANNELS.map((c) => this.parties.contactability(tx, p.partyId, c, 'MARKETING', now)),
    ]);
    return {
      id: p.id, partyId: p.partyId, name: party?.displayName ?? '', mobileMasked: party?.primaryMobileMasked,
      productInterest: p.productInterest, source: p.attribution.source, campaignId: p.attribution.campaignId,
      ownerMemberId: p.ownerMemberId, ownerName: p.ownerMemberId ? ownerNames[p.ownerMemberId] : undefined,
      stage: p.stage, temperature: p.temperature, slaState: lead.slaState(now), slaDueAt: p.slaDueAt,
      consent: marketing.some((d) => d.allowed) ? ('granted' as const) : ('not_given' as const), createdAt: p.createdAt,
      syncState: sync?.state ?? p.syncState,
      customFields: CustomFieldValidator.mask(defs, p.customFields),
    };
  }
}
