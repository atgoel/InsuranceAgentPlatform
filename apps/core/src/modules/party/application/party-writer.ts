import { Inject, Injectable } from '@nestjs/common';
import { ValidationError } from '../../../kernel/errors/domain-errors';
import { Party } from '../domain/party';
import { ContactPointFactory } from '../domain/contact-point';
import { ConsentRecord } from '../domain/consent';
import { PARTY_CREATED } from '../domain/events';
import {
  CONSENT_REPOSITORY,
  ConsentRepository,
  CreatePartyInput,
  DuplicateCandidate,
  FIELD_CIPHER,
  FieldCipher,
  PARTY_REPOSITORY,
  PartyRepository,
  Transaction,
} from './ports';
import { PartyContext } from './party-context';
import { DuplicateDetector } from './duplicate-detector';

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface Actor {
  memberId?: string;
  orgUnitId?: string;
  /** Pseudonymous actor for consent evidence ('customer' for self-service). */
  capturedBy: string;
}

export interface PreparedParty {
  party: Party;
  candidates: DuplicateCandidate[];
  commit(): Promise<void>;
}

/**
 * Builds a new party inside the caller's transaction: contact points via the factory (encrypted + hashed + masked),
 * P3 fields encrypted, duplicate candidates scored. `commit()` persists party, consents, candidates, event and audit,
 * so callers can decide (reject / link / create) between preparation and commit.
 */
@Injectable()
export class PartyWriter {
  private readonly contacts: ContactPointFactory;

  constructor(
    @Inject(PARTY_REPOSITORY) private readonly parties: PartyRepository,
    @Inject(CONSENT_REPOSITORY) private readonly consents: ConsentRepository,
    @Inject(FIELD_CIPHER) private readonly cipher: FieldCipher,
    private readonly detector: DuplicateDetector,
    private readonly ctx: PartyContext,
  ) {
    this.contacts = new ContactPointFactory(cipher);
  }

  async prepare(tx: Transaction, input: CreatePartyInput, actor: Actor): Promise<PreparedParty> {
    const now = this.ctx.clock.now();
    const contactPoints = await Promise.all(input.contacts.map((c) => this.contacts.create(tx.tenantId, c)));
    const party = Party.create({
      id: this.ctx.ids.next('pty'),
      kind: input.kind,
      displayName: input.displayName,
      contactPoints,
      preferredLanguage: input.preferredLanguage,
      preferredChannel: input.preferredChannel,
      tags: input.tags,
      customFields: input.customFields,
      ownerMemberId: input.ownerMemberId ?? actor.memberId,
      orgUnitId: input.orgUnitId ?? actor.orgUnitId,
      source: input.source ?? { kind: 'MANUAL' },
      now,
    });
    await this.attachSensitive(tx, party, input, now);
    const candidates = await this.detector.find(tx, party, input.dateOfBirth);
    return {
      party,
      candidates,
      commit: async () => {
        await this.parties.save(tx, party);
        for (const c of input.consent ?? []) await this.consents.append(tx, this.consentRecord(party.props.id, c, actor, now));
        await this.detector.queue(tx, candidates);
        await this.ctx.recorder.record(tx, {
          event: {
            type: PARTY_CREATED,
            subject: party.props.id,
            data: { id: party.props.id, kind: party.props.kind, source: party.props.source.kind },
          },
          audit: {
            action: PARTY_CREATED,
            entityType: 'party',
            entityId: party.props.id,
            metadata: { source: party.props.source.kind, candidates: candidates.length },
          },
        });
      },
    };
  }

  consentRecord(partyId: string, c: NonNullable<CreatePartyInput['consent']>[number], actor: Actor, now: Date): ConsentRecord {
    return { id: this.ctx.ids.next('cns'), partyId, ...c, capturedBy: actor.capturedBy, occurredAt: now.toISOString() };
  }

  private async attachSensitive(tx: Transaction, party: Party, input: CreatePartyInput, now: Date): Promise<void> {
    if (input.dateOfBirth !== undefined) {
      if (
        !ISO_DATE.test(input.dateOfBirth) ||
        Number.isNaN(Date.parse(input.dateOfBirth)) ||
        new Date(input.dateOfBirth).toISOString().slice(0, 10) !== input.dateOfBirth ||
        new Date(input.dateOfBirth) > now
      ) {
        throw new ValidationError('invalid_date_of_birth', 'Date of birth must be a past date (YYYY-MM-DD)', [
          { path: 'dateOfBirth', code: 'invalid', message: 'Invalid date of birth' },
        ]);
      }
      party.setSensitive({
        dateOfBirthEnc: await this.cipher.encrypt(tx.tenantId, input.dateOfBirth),
        dobYear: Number(input.dateOfBirth.slice(0, 4)),
        birthday: input.dateOfBirth.slice(5),
      });
    }
    if (input.pan !== undefined) {
      const pan = input.pan.trim().toUpperCase();
      if (!PAN.test(pan))
        throw new ValidationError('invalid_pan', 'PAN must look like ABCDE1234F', [
          { path: 'pan', code: 'invalid', message: 'Invalid PAN' },
        ]);
      party.setSensitive({
        panEnc: await this.cipher.encrypt(tx.tenantId, pan),
        panHash: this.cipher.hash(tx.tenantId, pan),
        panLast4: pan.slice(-4),
      });
    }
  }
}
