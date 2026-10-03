import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { Party } from '../domain/party';
import { Household } from '../domain/household';
import { MergePlan, MergeRecord, SurvivorChoice } from '../domain/merge';
import { PARTY_MERGED } from '../domain/events';
import {
  CONSENT_REPOSITORY, ConsentRepository, DUPLICATE_REPOSITORY, DuplicateCandidate, DuplicateRepository, HOUSEHOLD_REPOSITORY, HouseholdRepository,
  PARTY_REPOSITORY, PartyRepository, RECORD_SCOPE_PROVIDER, ROLE_LINK_REPOSITORY, RecordScopeProvider, RoleLinkRepository, Transaction,
} from './ports';
import { inScope } from './party-scope';
import { PartyContext } from './party-context';
import { PartyQueryService } from './party-query.service';

const REVERSIBLE_DAYS = 30;
const DAY_MS = 86_400_000;

/** Reviewed duplicate queue, merge and 30-day reversal (AC-M03-09). Every merge is a human decision. */
@Injectable()
export class DuplicateService {
  constructor(
    @Inject(DUPLICATE_REPOSITORY) private readonly duplicates: DuplicateRepository,
    @Inject(PARTY_REPOSITORY) private readonly parties: PartyRepository,
    @Inject(ROLE_LINK_REPOSITORY) private readonly roles: RoleLinkRepository,
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(RECORD_SCOPE_PROVIDER) private readonly scopes: RecordScopeProvider,
    private readonly queries: PartyQueryService,
    private readonly ctx: PartyContext,
  ) {}

  queue(principal: Principal, page: { cursor?: string; limit: number }) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const scope = await this.scopes.resolve(tx, principal);
      const { items, nextCursor } = await this.duplicates.list(tx, { status: 'open', cursor: page.cursor, limit: page.limit });
      const views = [];
      for (const c of items) {
        const pair = await Promise.all([this.requireParty(tx, c.partyAId), this.requireParty(tx, c.partyBId)]);
        if (!pair.every((p) => inScope(p, scope))) continue; // both records must be visible to the reviewer
        const [a, b] = await this.queries.listItems(tx, pair);
        views.push({ id: c.id, a, b, score: c.score, rule: c.rule, explanation: c.explanation });
      }
      return { items: views, nextCursor };
    });
  }

  /** Field-by-field comparison; contacts masked, DOB as year only, PAN as last four. */
  comparison(principal: Principal, candidateId: string) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const [, a, b] = await this.requireReviewable(tx, principal, candidateId);
      const row = (field: string, f: (p: Party) => unknown) => ({ field, a: f(a) ?? null, b: f(b) ?? null });
      return {
        fields: [
          row('displayName', (p) => p.props.displayName),
          row('mobile', (p) => p.primary('MOBILE')?.masked),
          row('email', (p) => p.primary('EMAIL')?.masked),
          row('dateOfBirth', (p) => p.props.dobYear),
          row('pan', (p) => (p.props.panLast4 ? `XXXXXX${p.props.panLast4}` : undefined)),
          row('preferredLanguage', (p) => p.props.preferredLanguage),
          row('preferredChannel', (p) => p.props.preferredChannel),
          row('ownerMemberId', (p) => p.props.ownerMemberId),
        ],
        sourceA: a.props.source,
        sourceB: b.props.source,
      };
    });
  }

  merge(principal: Principal, candidateId: string, input: { survivor: 'A' | 'B'; choices: SurvivorChoice[] }): Promise<MergeRecord> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const [, a, b] = await this.requireReviewable(tx, principal, candidateId);
      const record = await this.mergeIn(tx, a, b, input.survivor, input.choices, principal.memberId ?? principal.userRef);
      await this.duplicates.setStatus(tx, candidateId, 'merged');
      return record;
    });
  }

  /** Merge inside the caller's transaction (also used by PartyFacade.absorb). */
  async mergeIn(tx: Transaction, a: Party, b: Party, survivorSide: 'A' | 'B', choices: SurvivorChoice[], mergedBy: string): Promise<MergeRecord> {
    const now = this.ctx.clock.now();
    const { survivor, merged } = MergePlan.build(a, b, choices, survivorSide).apply(now);
    const mergeId = this.ctx.ids.next('mrg');
    const roleLinkKeys = await this.roles.repoint(tx, merged.props.id, survivor.props.id);
    const consents = await this.copyConsents(tx, merged.props.id, survivor.props.id, mergeId);
    const household = await this.moveHousehold(tx, merged.props.id, survivor.props.id);
    survivor.touch(now);
    await this.parties.save(tx, survivor);
    await this.parties.save(tx, merged);
    const record: MergeRecord = {
      id: mergeId, survivorId: survivor.props.id, mergedId: merged.props.id, choices,
      movedLinks: { roleLinks: roleLinkKeys.length, consents, household: household?.id, householdRelation: household?.relation, roleLinkKeys },
      mergedAt: now.toISOString(), mergedBy, reversibleUntil: new Date(now.getTime() + REVERSIBLE_DAYS * DAY_MS).toISOString(),
    };
    await this.duplicates.saveMerge(tx, record);
    const data = { survivorId: record.survivorId, mergedId: record.mergedId, mergeId };
    await this.ctx.recorder.record(tx, {
      event: { type: PARTY_MERGED, subject: record.survivorId, data },
      audit: { action: PARTY_MERGED, entityType: 'party', entityId: record.survivorId, metadata: { ...data, roleLinks: roleLinkKeys.length, consents, household: household?.id } },
    });
    return record;
  }

  dismiss(principal: Principal, candidateId: string): Promise<void> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      await this.requireReviewable(tx, principal, candidateId);
      await this.duplicates.setStatus(tx, candidateId, 'dismissed');
      await this.ctx.recorder.record(tx, { audit: { action: 'party.duplicate.dismissed', entityType: 'duplicate_candidate', entityId: candidateId } });
    });
  }

  reverse(principal: Principal, mergeId: string): Promise<{ restoredPartyId: string }> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const record = await this.duplicates.getMerge(tx, mergeId);
      if (!record) throw new NotFoundError('merge', mergeId);
      if (record.reversedAt) throw new ConflictError('merge_already_reversed', 'This merge has already been reversed');
      const now = this.ctx.clock.now();
      if (now.getTime() > Date.parse(record.reversibleUntil)) throw new BusinessRuleError('merge_not_reversible', 'Merges can only be reversed within 30 days');
      const merged = await this.requireParty(tx, record.mergedId);
      merged.restoreFromMerge(now);
      await this.parties.save(tx, merged);
      await this.roles.repoint(tx, record.survivorId, record.mergedId, record.movedLinks.roleLinkKeys ?? []);
      if (record.movedLinks.household) await this.swapHouseholdMember(tx, record.movedLinks.household, record.survivorId, record.mergedId);
      await this.duplicates.saveMerge(tx, { ...record, reversedAt: now.toISOString() });
      await this.ctx.recorder.record(tx, { audit: { action: 'party.merge.reversed', entityType: 'party', entityId: record.mergedId, metadata: { mergeId, survivorId: record.survivorId } } });
      this.ctx.logger.info('party.merge.reversed', 'Merge reversed', { mergeId });
      return { restoredPartyId: record.mergedId };
    });
  }

  candidatesFor(tx: Transaction, partyId: string): Promise<DuplicateCandidate[]> {
    return this.duplicates.list(tx, { status: 'open', partyId, limit: 50 }).then((p) => p.items);
  }

  /** Consent history is copied, never rewritten: copies carry the merge as evidence. */
  private async copyConsents(tx: Transaction, fromId: string, toId: string, mergeId: string): Promise<number> {
    const history = (await this.consents.ledger(tx, fromId)).history();
    for (const r of history) await this.consents.append(tx, { ...r, id: this.ctx.ids.next('cns'), partyId: toId, evidenceRef: `merge:${mergeId}` });
    return history.length;
  }

  /** The survivor takes the merged party's household place when it has none of its own. */
  private async moveHousehold(tx: Transaction, mergedId: string, survivorId: string) {
    const [theirs, ours] = await Promise.all([this.households.forParty(tx, mergedId), this.households.forParty(tx, survivorId)]);
    if (!theirs || ours) return undefined;
    const relation = theirs.members.find((m) => m.partyId === mergedId)?.relation;
    await this.swapHouseholdMember(tx, theirs.id, mergedId, survivorId);
    return { id: theirs.id, relation };
  }

  private async swapHouseholdMember(tx: Transaction, householdId: string, fromId: string, toId: string): Promise<void> {
    const h = await this.households.get(tx, householdId);
    if (!h) return;
    await this.households.save(tx, Household.restore({ id: h.id, name: h.name, members: h.members.map((m) => (m.partyId === fromId ? { ...m, partyId: toId } : m)) }));
  }

  /** Open candidate whose two parties are both in the reviewer's record scope (else reported missing). */
  private async requireReviewable(tx: Transaction, principal: Principal, id: string): Promise<[DuplicateCandidate, Party, Party]> {
    const c = await this.requireOpen(tx, id);
    const [a, b] = await Promise.all([this.requireParty(tx, c.partyAId), this.requireParty(tx, c.partyBId)]);
    const scope = await this.scopes.resolve(tx, principal);
    if (!inScope(a, scope) || !inScope(b, scope)) throw new NotFoundError('duplicate_candidate', id);
    return [c, a, b];
  }

  private async requireOpen(tx: Transaction, id: string): Promise<DuplicateCandidate> {
    const c = await this.duplicates.get(tx, id);
    if (!c) throw new NotFoundError('duplicate_candidate', id);
    if (c.status !== 'open') throw new ConflictError('candidate_closed', `This candidate is already ${c.status}`);
    return c;
  }

  private async requireParty(tx: Transaction, id: string): Promise<Party> {
    const p = await this.parties.get(tx, id);
    if (!p) throw new NotFoundError('party', id);
    return p;
  }
}
