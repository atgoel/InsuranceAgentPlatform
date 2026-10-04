import { normaliseName } from '../domain/name-matching';
import { Inject, Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../kernel/errors/domain-errors';
import { ConsentChannel, ConsentPurpose, ConsentRecord } from '../domain/consent';
import { ContactabilityDecision } from '../domain/contactability';
import { PartyRoleLink } from '../domain/party-role';
import { Party } from '../domain/party';
import {
  CreatePartyInput, DuplicateCandidate, DuplicateCandidateView, PARTY_REPOSITORY, PartyFacade, PartyRepository, PartySummary, ROLE_LINK_REPOSITORY,
  RoleLinkRepository, Transaction,
} from './ports';
import { PartyContext } from './party-context';
import { PartyWriter } from './party-writer';
import { ConsentService } from './consent.service';
import { DuplicateService } from './duplicate.service';
import { partySummary } from './party-views';

const LINK_THRESHOLD = 90;

const view = ({ id, partyAId, partyBId, score, rule, explanation }: DuplicateCandidate): DuplicateCandidateView => ({ id, partyAId, partyBId, score, rule, explanation });

/** Facade published to M04+ — runs inside the caller's transaction; callers are trusted modules, not principals. */
@Injectable()
export class PartyFacadeService implements PartyFacade {
  constructor(
    @Inject(PARTY_REPOSITORY) private readonly parties: PartyRepository,
    @Inject(ROLE_LINK_REPOSITORY) private readonly roles: RoleLinkRepository,
    private readonly writer: PartyWriter,
    private readonly consents: ConsentService,
    private readonly duplicates: DuplicateService,
    private readonly ctx: PartyContext,
  ) {}

  async findOrCreate(tx: Transaction, input: CreatePartyInput & { onDuplicate: 'link' | 'create' }) {
    const prepared = await this.writer.prepare(tx, input, { memberId: input.ownerMemberId, orgUnitId: input.orgUnitId, capturedBy: input.ownerMemberId ?? 'customer' });
    const strong = prepared.candidates.find((c) => c.score >= LINK_THRESHOLD);
    if (input.onDuplicate === 'link' && strong) {
      const existing = strong.partyAId === prepared.party.props.id ? strong.partyBId : strong.partyAId;
      return { partyId: existing, created: false, candidates: prepared.candidates.map(view) };
    }
    await prepared.commit();
    return { partyId: prepared.party.props.id, created: true, candidates: prepared.candidates.map(view) };
  }

  async linkRole(tx: Transaction, link: Omit<PartyRoleLink, 'createdAt'>): Promise<void> {
    await this.require(tx, link.partyId);
    await this.roles.add(tx, { ...link, createdAt: this.ctx.clock.now().toISOString() });
  }

  async contactability(tx: Transaction, partyId: string, channel: Exclude<ConsentChannel, 'ANY'>, purpose: ConsentPurpose, at: Date): Promise<ContactabilityDecision> {
    return this.consents.decideIn(tx, await this.require(tx, partyId), channel, purpose, at);
  }

  async recordConsent(tx: Transaction, input: Omit<ConsentRecord, 'id' | 'occurredAt'>): Promise<ConsentRecord> {
    return this.consents.recordIn(tx, await this.require(tx, input.partyId), input);
  }

  async searchByName(tx: Transaction, name: string): Promise<PartySummary[]> {
    const normalized = normaliseName(name);
    const matches = await this.parties.searchByName(tx, normalized, 100);
    return matches.filter(p => normaliseName(p.props.displayName) === normalized).map(partySummary);
  }

  rolesForSubject(tx: Transaction, subjectType: PartyRoleLink['subjectType'], subjectId: string): Promise<PartyRoleLink[]> {
    return this.roles.forSubject(tx, subjectType, subjectId);
  }

  async summary(tx: Transaction, partyId: string): Promise<PartySummary | undefined> {
    const party = await this.parties.get(tx, partyId);
    return party ? partySummary(party) : undefined;
  }

  async absorb(tx: Transaction, fromPartyId: string, intoPartyId: string): Promise<{ mergeId: string }> {
    const [from, into] = await Promise.all([this.require(tx, fromPartyId), this.require(tx, intoPartyId)]);
    const record = await this.duplicates.mergeIn(tx, into, from, 'A', [], 'system');
    return { mergeId: record.id };
  }

  async candidatesFor(tx: Transaction, partyId: string): Promise<DuplicateCandidateView[]> {
    return (await this.duplicates.candidatesFor(tx, partyId)).map(view);
  }

  async consentSummary(tx: Transaction, partyId: string) {
    return this.consents.summaryIn(tx, partyId);
  }

  private async require(tx: Transaction, id: string): Promise<Party> {
    const p = await this.parties.get(tx, id);
    if (!p) throw new NotFoundError('party', id);
    return p;
  }
}
