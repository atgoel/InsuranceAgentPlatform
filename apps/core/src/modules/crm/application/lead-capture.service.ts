import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '../../../kernel/errors/domain-errors';
import { CustomFieldValidator, CustomFieldValues } from '../../../kernel/custom-fields';
import { Principal } from '../../../kernel/tenancy/principal';
import { Attribution, Lead, LeadSource, ProductLine } from '../domain/lead';
import { CRM_EVENTS } from '../domain/events';
import {
  ACTIVITY_REPOSITORY, ActivityRepository, CRM_PORT_FACTORY, ENTITLEMENT_CHECKER, EntitlementChecker, LEAD_REPOSITORY, LeadRepository,
  PARTY_FACADE, PUBLIC_LEAD_GUARD, PartyFacade, PublicLeadGuard, Transaction,
} from './ports';
import { DefaultCrmPortFactory } from './crm-port';
import { CrmContext } from './crm-context';
import { LeadAssignment } from './lead-assignment';

const DEDUP_WINDOW_MS = 30 * 86_400_000;

export type ConsentChannel = 'CALL' | 'WHATSAPP' | 'SMS' | 'EMAIL';

export interface CaptureLeadInput {
  fullName: string;
  mobile?: string;
  email?: string;
  productInterest: ProductLine;
  pincode?: string;
  language?: string;
  source: LeadSource;
  campaignId?: string;
  referrerPartyId?: string;
  micrositeMemberId?: string;
  touchRef?: string;
  /** CR-001: authenticated POST /leads only; /public/leads and imports never set it. Validated before any write. */
  customFields?: Record<string, string | number | boolean | null>;
  consent: { granted: boolean; noticeVersion: string; channels: ConsentChannel[]; purposes: Array<'SERVICE' | 'MARKETING'>; evidenceRef?: string };
}

export type CaptureOrigin = { kind: 'STAFF'; principal: Principal } | { kind: 'PUBLIC'; tenantId: string; ipHash: string; honeypot?: string };

export interface CaptureLeadResult {
  leadId: string;
  partyId: string;
  deduplicated: boolean;
  ownerMemberId?: string;
  routingReason: string;
  possibleMatches: number;
}

/** LA-2: every lead is validated, deduplicated, consented, attributed and assigned — in one unit of work. */
@Injectable()
export class LeadCaptureService {
  constructor(
    @Inject(PARTY_FACADE) private readonly parties: PartyFacade,
    @Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository,
    @Inject(ACTIVITY_REPOSITORY) private readonly activities: ActivityRepository,
    @Inject(PUBLIC_LEAD_GUARD) private readonly guard: PublicLeadGuard,
    @Inject(ENTITLEMENT_CHECKER) private readonly entitlements: EntitlementChecker,
    @Inject(CRM_PORT_FACTORY) private readonly ports: DefaultCrmPortFactory,
    private readonly assignment: LeadAssignment,
    private readonly ctx: CrmContext,
  ) {}

  capture(input: CaptureLeadInput, origin: CaptureOrigin): Promise<CaptureLeadResult> {
    const tenantId = origin.kind === 'STAFF' ? origin.principal.tenantId : origin.tenantId;
    return this.ctx.uow.run(tenantId, (tx) => this.captureIn(tx, input, origin));
  }

  /** Inside the caller's transaction (also used row by row by the lead import). */
  async captureIn(tx: Transaction, input: CaptureLeadInput, origin: CaptureOrigin): Promise<CaptureLeadResult> {
    const now = this.ctx.clock.now();
    await this.screen(tx, input, origin, now);
    // Staff capture only; validated before the party or lead is written (AC-CR001-08). Public forms and imports start as {}.
    const customFields = origin.kind === 'STAFF' && input.customFields !== undefined
      ? CustomFieldValidator.validate(await this.ctx.defs.activeFor(tx, 'lead'), input.customFields)
      : undefined;
    const by = origin.kind === 'STAFF' ? (origin.principal.memberId ?? 'staff') : 'customer';
    const party = await this.parties.findOrCreate(tx, {
      kind: 'PERSON', displayName: input.fullName, contacts: contactsOf(input), preferredLanguage: input.language,
      source: { kind: input.source === 'IMPORT' ? 'IMPORT' : 'LEAD' }, onDuplicate: 'link',
    });
    const existing = await this.leads.findOpenByParties(tx, relatedParties(party), new Date(now.getTime() - DEDUP_WINDOW_MS));
    const result = existing
      ? await this.reEnquiry(tx, existing, input, now, by)
      : await this.newLead(tx, { input, partyId: party.partyId, now, by, solo: await this.ports.isSolo(tx.tenantId), customFields });
    await this.recordConsents(tx, result.partyId, input, origin, by);
    if (party.created && (await this.ports.isSolo(tx.tenantId))) await this.entitlements.consume(tx.tenantId, 'customers', 1);
    this.ctx.metrics
      .counter('crm_leads_captured_total', 'Leads captured', ['source', 'deduplicated'])
      .inc({ source: input.source, deduplicated: String(result.deduplicated) });
    return { ...result, possibleMatches: party.candidates.length };
  }

  private async screen(tx: Transaction, input: CaptureLeadInput, origin: CaptureOrigin, now: Date): Promise<void> {
    if (!input.mobile && !input.email) throw new ValidationError('contact_required', 'Give a mobile number or an e-mail address');
    if (origin.kind !== 'PUBLIC') return;
    await this.guard.check(tx, { ipHash: origin.ipHash, honeypot: origin.honeypot, at: now });
    if (!input.consent.granted) throw new ValidationError('consent_required', 'Consent to be contacted is required');
  }

  private async newLead(tx: Transaction, a: { input: CaptureLeadInput; partyId: string; now: Date; by: string; solo: boolean; customFields?: CustomFieldValues }): Promise<Omit<CaptureLeadResult, 'possibleMatches'>> {
    const port = await this.ports.forTenant(tx.tenantId);
    const lead = Lead.capture({
      id: this.ctx.ids.next('lead'), partyId: a.partyId, productInterest: a.input.productInterest, attribution: attributionOf(a.input, a.now),
      pincode: a.input.pincode, language: a.input.language, customFields: a.customFields, now: a.now, by: a.by,
    });
    const p = lead.props;
    await this.ctx.recorder.record(tx, {
      event: { type: CRM_EVENTS.LEAD_CREATED, subject: p.id, data: { leadId: p.id, partyId: p.partyId, source: p.attribution.source, campaignId: p.attribution.campaignId ?? null, productInterest: p.productInterest } },
      audit: { action: CRM_EVENTS.LEAD_CREATED, entityType: 'lead', entityId: p.id, metadata: { source: p.attribution.source } },
    });
    const decision = await this.assignment.route(tx, lead, port, { solo: a.solo });
    return { leadId: p.id, partyId: p.partyId, deduplicated: false, ownerMemberId: decision.memberId, routingReason: decision.reason };
  }

  /** Same person within 30 days: a RE_ENQUIRY on the open lead — no new lead, no re-routing (AC-M04-12). */
  private async reEnquiry(tx: Transaction, lead: Lead, input: CaptureLeadInput, now: Date, by: string): Promise<Omit<CaptureLeadResult, 'possibleMatches'>> {
    lead.touch({ channel: input.source, ref: input.touchRef, at: now.toISOString() });
    await (await this.ports.forTenant(tx.tenantId)).saveLead(tx, lead);
    await this.activities.add(tx, {
      id: this.ctx.ids.next('act'), subjectType: 'LEAD', subjectId: lead.props.id, kind: 'RE_ENQUIRY', occurredAt: now.toISOString(),
      actorMemberId: by === 'customer' ? undefined : by, summary: `Re-enquiry via ${input.source}${input.campaignId ? ` (${input.campaignId})` : ''}`,
    });
    return { leadId: lead.props.id, partyId: lead.props.partyId, deduplicated: true, ownerMemberId: lead.props.ownerMemberId, routingReason: 'Existing open lead' };
  }

  /** One ledger record per purpose × channel; staff capture without consent records a marketing withdrawal. */
  private async recordConsents(tx: Transaction, partyId: string, input: CaptureLeadInput, origin: CaptureOrigin, by: string): Promise<void> {
    const c = input.consent;
    const purposes = c.granted ? c.purposes : (['MARKETING'] as const);
    for (const purpose of purposes) {
      for (const channel of c.channels) {
        await this.parties.recordConsent(tx, {
          partyId, purpose, channel, granted: c.granted, noticeVersion: c.noticeVersion, evidenceRef: c.evidenceRef,
          source: origin.kind === 'PUBLIC' ? 'WEB_FORM' : input.source === 'IMPORT' ? 'IMPORT' : 'ASSISTED', capturedBy: by,
        });
      }
    }
  }
}

function contactsOf(input: CaptureLeadInput): Array<{ channel: 'MOBILE' | 'EMAIL'; value: string }> {
  return [
    ...(input.mobile ? [{ channel: 'MOBILE' as const, value: input.mobile }] : []),
    ...(input.email ? [{ channel: 'EMAIL' as const, value: input.email }] : []),
  ];
}

function relatedParties(party: { partyId: string; candidates: Array<{ partyAId: string; partyBId: string }> }): string[] {
  return [...new Set([party.partyId, ...party.candidates.flatMap((c) => [c.partyAId, c.partyBId])])];
}

function attributionOf(input: CaptureLeadInput, now: Date): Attribution {
  const touch = { channel: input.source, ref: input.touchRef, at: now.toISOString() };
  return {
    source: input.source, campaignId: input.campaignId, firstTouch: touch, lastTouch: touch,
    referrerPartyId: input.referrerPartyId, micrositeMemberId: input.micrositeMemberId,
  };
}
