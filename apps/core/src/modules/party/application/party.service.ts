import { Inject, Injectable } from '@nestjs/common';
import { ConflictError, NotFoundError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { CustomFieldDefinition, CustomFieldValidator, CustomFieldValues } from '../../../kernel/custom-fields';
import { Principal } from '../../../kernel/tenancy/principal';
import { Party } from '../domain/party';
import { Channel, ContactPointFactory } from '../domain/contact-point';
import { PARTY_UPDATED } from '../domain/events';
import {
  CreatePartyInput, DuplicateCandidate, FIELD_CIPHER, FieldCipher, HOUSEHOLD_REPOSITORY, HouseholdRepository, PARTY_REPOSITORY, PartyRepository,
  PreferredChannel, RECORD_SCOPE_PROVIDER, ROLE_LINK_REPOSITORY, RecordScopeProvider, RoleLinkRepository, Transaction,
} from './ports';
import { PartyContext } from './party-context';
import { PartyWriter } from './party-writer';
import { DuplicateDetector } from './duplicate-detector';
import { inScope } from './party-scope';

const REJECT_THRESHOLD = 90;

export interface PartyPatch {
  displayName?: string;
  preferredLanguage?: string;
  preferredChannel?: PreferredChannel;
  tags?: string[];
  addContact?: { channel: Channel; value: string; isPrimary?: boolean };
  removeContactHash?: string;
}

/** Party create / read / update with record scope (M03 §5). Search and lists live in PartyQueryService. */
@Injectable()
export class PartyService {
  private readonly contacts: ContactPointFactory;

  constructor(
    @Inject(PARTY_REPOSITORY) private readonly parties: PartyRepository,
    @Inject(HOUSEHOLD_REPOSITORY) private readonly households: HouseholdRepository,
    @Inject(ROLE_LINK_REPOSITORY) private readonly roles: RoleLinkRepository,
    @Inject(RECORD_SCOPE_PROVIDER) private readonly scopes: RecordScopeProvider,
    @Inject(FIELD_CIPHER) cipher: FieldCipher,
    private readonly writer: PartyWriter,
    private readonly detector: DuplicateDetector,
    private readonly ctx: PartyContext,
  ) {
    this.contacts = new ContactPointFactory(cipher);
  }

  create(principal: Principal, input: Omit<CreatePartyInput, 'customFields'> & { customFields?: unknown }, onDuplicate: 'create' | 'reject'): Promise<{ party: Party; candidates: DuplicateCandidate[] }> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      // Validated before anything is written (AC-CR001-08); absent → {}.
      const customFields = input.customFields === undefined ? undefined : CustomFieldValidator.validate(await this.ctx.defs.activeFor(tx, 'party'), input.customFields);
      const prepared = await this.writer.prepare(tx, { ...input, customFields }, { memberId: principal.memberId, orgUnitId: principal.orgUnitId, capturedBy: principal.memberId ?? 'customer' });
      const strong = prepared.candidates.filter((c) => c.score >= REJECT_THRESHOLD);
      if (onDuplicate === 'reject' && strong.length > 0) {
        throw new ConflictError('possible_duplicate', 'A matching customer already exists', {
          candidates: strong.map(({ id, partyAId, partyBId, score, rule, explanation }) => ({ id, partyAId, partyBId, score, rule, explanation })),
        });
      }
      await prepared.commit();
      return { party: prepared.party, candidates: prepared.candidates };
    });
  }

  /** Detail for CRM09: party plus household and role links. */
  detail(principal: Principal, id: string) {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const party = await this.requireInScope(tx, principal, id);
      const [household, roles] = await Promise.all([this.households.forParty(tx, id), this.roles.forParty(tx, id)]);
      return { party, household, roles };
    });
  }

  update(principal: Principal, id: string, patch: PartyPatch, expectedVersion: number): Promise<Party> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const party = await this.requireInScope(tx, principal, id);
      if (party.props.version !== expectedVersion) throw new PreconditionFailedError('version_mismatch', 'The customer was changed by someone else; reload and retry');
      const now = this.ctx.clock.now();
      if (patch.displayName !== undefined) party.rename(patch.displayName, now);
      if (patch.preferredLanguage !== undefined) party.setSensitiveField('preferredLanguage', patch.preferredLanguage);
      if (patch.preferredChannel !== undefined) party.setSensitiveField('preferredChannel', patch.preferredChannel);
      if (patch.tags !== undefined) party.setTags(patch.tags);
      if (patch.addContact) party.addContactPoint(await this.contacts.create(tx.tenantId, patch.addContact));
      if (patch.removeContactHash) party.removeContactPoint(patch.removeContactHash);
      party.touch(now);
      await this.parties.save(tx, party);
      if (patch.addContact) await this.detector.queue(tx, await this.detector.find(tx, party));
      const fields = (Object.keys(patch) as Array<keyof PartyPatch>).filter((k) => patch[k] !== undefined);
      await this.ctx.recorder.record(tx, {
        event: { type: PARTY_UPDATED, subject: id, data: { id, fields, version: party.props.version } },
        audit: { action: PARTY_UPDATED, entityType: 'party', entityId: id, metadata: { fields } },
      });
      return party;
    });
  }

  /**
   * Full replace of the custom-field set (M03 §11). `values` are validated against the active 'party' definitions; keys of
   * definitions that are no longer active are hidden but preserved. Audit carries keys only, never values. No domain event.
   */
  replaceCustomFields(principal: Principal, id: string, values: unknown, expectedVersion: number): Promise<Party> {
    return this.ctx.uow.run(principal.tenantId, async (tx) => {
      const party = await this.requireInScope(tx, principal, id);
      if (party.props.version !== expectedVersion) throw new PreconditionFailedError('version_mismatch', 'The customer was changed by someone else; reload and retry');
      const defs = await this.ctx.defs.activeFor(tx, 'party');
      const validated = CustomFieldValidator.validate(defs, values);
      const active = new Set(defs.map((d) => d.key));
      const preserved: CustomFieldValues = Object.fromEntries(Object.entries(party.props.customFields).filter(([k]) => !active.has(k)));
      party.replaceCustomFields({ ...preserved, ...validated }, this.ctx.clock.now());
      await this.parties.save(tx, party);
      await this.ctx.recorder.record(tx, {
        audit: { action: 'party.custom_fields.replaced', entityType: 'party', entityId: id, metadata: { keys: Object.keys(validated) } },
      });
      return party;
    });
  }

  /** Active 'party' definitions, for building views (detail shows visible values). */
  activeDefinitions(principal: Principal): Promise<CustomFieldDefinition[]> {
    return this.ctx.uow.run(principal.tenantId, (tx) => this.ctx.defs.activeFor(tx, 'party'));
  }

  /** Out-of-scope parties are reported as missing so their existence is not revealed (AC-M03-13). */
  async requireInScope(tx: Transaction, principal: Principal, id: string): Promise<Party> {
    const party = await this.parties.get(tx, id);
    if (!party || !inScope(party, await this.scopes.resolve(tx, principal))) throw new NotFoundError('party', id);
    return party;
  }
}
