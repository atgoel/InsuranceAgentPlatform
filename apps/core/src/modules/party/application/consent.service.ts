import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { Party } from '../domain/party';
import { Channel, ContactPointFactory } from '../domain/contact-point';
import { ConsentChannel, ConsentPurpose, ConsentRecord } from '../domain/consent';
import { Suppression, SuppressionReason } from '../domain/suppression';
import { ContactabilityDecision, ContactabilityPolicy } from '../domain/contactability';
import { CONSENT_RECORDED, SUPPRESSION_ADDED } from '../domain/events';
import {
  CONSENT_REPOSITORY, ConsentInput, ConsentRepository, FIELD_CIPHER, FieldCipher, PARTY_REPOSITORY, PartyRepository, SUPPRESSION_REPOSITORY,
  SuppressionRepository, Transaction,
} from './ports';
import { PartyContext } from './party-context';
import { PartyService } from './party.service';

type ContactChannel = Exclude<ConsentChannel, 'ANY'>;

/** Which contact point a messaging channel uses. */
export function contactChannelFor(channel: ContactChannel): Channel {
  return channel === 'EMAIL' ? 'EMAIL' : 'MOBILE';
}

export type SuppressInput = { channel: ConsentChannel; reason: SuppressionReason; to?: string } & ({ value: string } | { contactHash: string });

/** Consent ledger, suppression and contactability decisions (F37, DPDP — M03 §3.4–3.6). */
@Injectable()
export class ConsentService {
  private readonly policy = new ContactabilityPolicy();
  private readonly contacts: ContactPointFactory;

  constructor(
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(SUPPRESSION_REPOSITORY) private readonly suppressions: SuppressionRepository,
    @Inject(PARTY_REPOSITORY) private readonly parties: PartyRepository,
    @Inject(FIELD_CIPHER) cipher: FieldCipher,
    private readonly partyService: PartyService,
    private readonly ctx: PartyContext,
  ) {
    this.contacts = new ContactPointFactory(cipher);
  }

  record(principal: Principal, partyId: string, input: ConsentInput): Promise<ConsentRecord> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const party = await this.partyService.requireInScope(tx, principal, partyId);
      return this.recordIn(tx, party, { partyId, ...input, capturedBy: principal.memberId ?? 'customer' });
    });
  }

  /** Appends to the ledger; withdrawing MARKETING also suppresses that channel's contact (AC-M03-05). */
  async recordIn(tx: Transaction, party: Party, input: Omit<ConsentRecord, 'id' | 'occurredAt'>): Promise<ConsentRecord> {
    const now = this.ctx.clock.now();
    const record: ConsentRecord = { ...input, id: this.ctx.ids.next('cns'), occurredAt: now.toISOString() };
    await this.consents.append(tx, record);
    if (input.purpose === 'MARKETING' && !input.granted) {
      for (const hash of this.hashesFor(party, input.channel)) await this.addSuppression(tx, { contactHash: hash, channel: input.channel, reason: 'OPT_OUT' }, input.capturedBy, now);
    }
    const data = { partyId: party.props.id, purpose: input.purpose, channel: input.channel, granted: input.granted, noticeVersion: input.noticeVersion };
    await this.ctx.recorder.record(tx, {
      event: { type: CONSENT_RECORDED, subject: party.props.id, data },
      audit: { action: CONSENT_RECORDED, entityType: 'party', entityId: party.props.id, metadata: { ...data, source: input.source } },
    });
    return record;
  }

  ledger(principal: Principal, partyId: string) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      await this.partyService.requireInScope(tx, principal, partyId);
      const ledger = await this.consents.ledger(tx, partyId);
      return { summary: ledger.summary(), history: [...ledger.history()] };
    });
  }

  contactability(principal: Principal, partyId: string, channel: ContactChannel, purpose: ConsentPurpose): Promise<ContactabilityDecision> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const party = await this.partyService.requireInScope(tx, principal, partyId);
      return this.decideIn(tx, party, channel, purpose, this.ctx.clock.now());
    });
  }

  async decideIn(tx: Transaction, party: Party, channel: ContactChannel, purpose: ConsentPurpose, at: Date): Promise<ContactabilityDecision> {
    const primary = party.primary(contactChannelFor(channel));
    const [ledger, suppressions] = await Promise.all([
      this.consents.ledger(tx, party.props.id),
      primary ? this.suppressions.activeFor(tx, primary.valueHash, at) : Promise.resolve([]),
    ]);
    const decision = this.policy.decide({ party, ledger, suppressions, channel, purpose, at });
    this.ctx.metrics
      .counter('party_contactability_decisions_total', 'Contactability decisions', ['purpose', 'channel', 'allowed'])
      .inc({ purpose, channel, allowed: String(decision.allowed) });
    return decision;
  }

  /** Operator / compliance suppression keyed by contact hash, so it holds across party records (F37). */
  suppress(principal: Principal, input: SuppressInput): Promise<Suppression> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const contactHash = 'contactHash' in input ? input.contactHash : await this.hashOfValue(tx, input.channel, input.value);
      return this.addSuppression(tx, { contactHash, channel: input.channel, reason: input.reason, to: input.to }, principal.memberId ?? principal.userRef, this.ctx.clock.now());
    });
  }

  private async addSuppression(tx: Transaction, s: { contactHash: string; channel: ConsentChannel; reason: SuppressionReason; to?: string }, createdBy: string, now: Date): Promise<Suppression> {
    const suppression: Suppression = { id: this.ctx.ids.next('sup'), ...s, from: now.toISOString(), createdBy };
    await this.suppressions.add(tx, suppression);
    await this.ctx.recorder.record(tx, {
      event: { type: SUPPRESSION_ADDED, subject: suppression.id, data: { id: suppression.id, channel: s.channel, reason: s.reason } },
      audit: { action: SUPPRESSION_ADDED, entityType: 'suppression', entityId: suppression.id, metadata: { channel: s.channel, reason: s.reason } },
    });
    return suppression;
  }

  private hashesFor(party: Party, channel: ConsentChannel): string[] {
    if (channel === 'ANY') return party.props.contactPoints.map((c) => c.valueHash);
    const primary = party.primary(contactChannelFor(channel));
    return primary ? [primary.valueHash] : [];
  }

  private async hashOfValue(tx: Transaction, channel: ConsentChannel, value: string): Promise<string> {
    if (channel === 'ANY') {
      const kind: Channel = value.includes('@') ? 'EMAIL' : 'MOBILE';
      return this.contacts.hashFor(tx.tenantId, kind, value);
    }
    return this.contacts.hashFor(tx.tenantId, contactChannelFor(channel), value);
  }

  /** Used by the facade (M04 send-time checks) without a principal. */
  async requireParty(tx: Transaction, partyId: string): Promise<Party> {
    const party = await this.parties.get(tx, partyId);
    if (!party) throw new NotFoundError('party', partyId);
    return party;
  }
}
