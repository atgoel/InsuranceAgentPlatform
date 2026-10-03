import { ValidationError, ConflictError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { ContactPoint } from './contact-point';
import { CustomFieldValues } from '../../../kernel/custom-fields';

export type PartyKind = 'PERSON' | 'ORGANISATION';
export type PartyStatus = 'ACTIVE' | 'MERGED' | 'ERASED';
export type Language = 'en' | 'hi' | string;

export interface PartyProps {
  readonly id: string;
  readonly kind: PartyKind;
  readonly displayName: string;
  readonly dateOfBirthEnc?: string;
  readonly dobYear?: number;
  readonly gender?: 'F' | 'M' | 'X';
  readonly panEnc?: string;
  readonly panHash?: string;
  readonly panLast4?: string;
  readonly preferredLanguage: Language;
  readonly preferredChannel?: string;
  readonly ownerMemberId?: string;
  readonly orgUnitId?: string;
  readonly tags: readonly string[];
  /** CR-001 custom-field values (descriptive only; validated by the service). */
  readonly customFields: CustomFieldValues;
  readonly source: { readonly kind: 'LEAD' | 'IMPORT' | 'MANUAL' | 'SIGNUP' | 'BOOK'; readonly ref?: string };
  readonly status: PartyStatus;
  readonly mergedIntoId?: string;
  readonly contactPoints: readonly ContactPoint[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
}

interface MutablePartyProps {
  id: string;
  kind: PartyKind;
  displayName: string;
  dateOfBirthEnc?: string;
  dobYear?: number;
  gender?: 'F' | 'M' | 'X';
  panEnc?: string;
  panHash?: string;
  panLast4?: string;
  preferredLanguage: Language;
  preferredChannel?: string;
  ownerMemberId?: string;
  orgUnitId?: string;
  tags: string[];
  customFields: CustomFieldValues;
  source: { kind: 'LEAD' | 'IMPORT' | 'MANUAL' | 'SIGNUP' | 'BOOK'; ref?: string };
  status: PartyStatus;
  mergedIntoId?: string;
  contactPoints: ContactPoint[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export class Party {
  private _props: MutablePartyProps;

  private constructor(props: PartyProps) {
    this._props = {
      id: props.id,
      kind: props.kind,
      displayName: props.displayName,
      dateOfBirthEnc: props.dateOfBirthEnc,
      dobYear: props.dobYear,
      gender: props.gender,
      panEnc: props.panEnc,
      panHash: props.panHash,
      panLast4: props.panLast4,
      preferredLanguage: props.preferredLanguage,
      preferredChannel: props.preferredChannel,
      ownerMemberId: props.ownerMemberId,
      orgUnitId: props.orgUnitId,
      tags: Array.from(props.tags),
      customFields: { ...props.customFields },
      source: { ...props.source },
      status: props.status,
      mergedIntoId: props.mergedIntoId,
      contactPoints: Array.from(props.contactPoints),
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
      version: props.version,
    };
  }

  static create(input: {
    id: string;
    kind: PartyKind;
    displayName: string;
    contactPoints: ContactPoint[];
    preferredLanguage?: Language;
    preferredChannel?: string;
    ownerMemberId?: string;
    orgUnitId?: string;
    source: { kind: 'LEAD' | 'IMPORT' | 'MANUAL' | 'SIGNUP' | 'BOOK'; ref?: string };
    tags?: string[];
    customFields?: CustomFieldValues;
    now: Date;
  }): Party {
    const trimmed = input.displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      throw new ValidationError('invalid_name', 'Display name must be between 2 and 120 characters');
    }

    if (input.contactPoints.length === 0 || input.contactPoints.length > 5) {
      throw new ValidationError('invalid_contact_points', 'Party must have 1-5 contact points');
    }

    const contactPoints = Party.ensureOnePrimaryPerChannel([...input.contactPoints]);

    const now = input.now.toISOString();
    const props: PartyProps = {
      id: input.id,
      kind: input.kind,
      displayName: trimmed,
      preferredLanguage: input.preferredLanguage ?? 'en',
      preferredChannel: input.preferredChannel,
      ownerMemberId: input.ownerMemberId,
      orgUnitId: input.orgUnitId,
      tags: input.tags ?? [],
      customFields: { ...(input.customFields ?? {}) },
      source: input.source,
      status: 'ACTIVE',
      contactPoints,
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    return new Party(props);
  }

  static restore(p: PartyProps): Party {
    return new Party({ ...p, customFields: p.customFields ?? {} });
  }

  private static ensureOnePrimaryPerChannel(points: readonly ContactPoint[]): ContactPoint[] {
    const byChannel = new Map<string, ContactPoint[]>();
    for (const cp of points) {
      if (!byChannel.has(cp.channel)) {
        byChannel.set(cp.channel, []);
      }
      byChannel.get(cp.channel)!.push(cp);
    }

    const result: ContactPoint[] = [];
    for (const [, cps] of byChannel) {
      for (let i = 0; i < cps.length; i++) {
        result.push({
          ...cps[i],
          isPrimary: i === 0,
        });
      }
    }
    return result;
  }

  rename(displayName: string, now: Date): void {
    const trimmed = displayName.trim();
    if (trimmed.length < 2 || trimmed.length > 120) {
      throw new ValidationError('invalid_name', 'Display name must be between 2 and 120 characters');
    }
    this._props.displayName = trimmed;
    this._props.updatedAt = now.toISOString();
  }

  addContactPoint(cp: ContactPoint): void {
    if (this._props.contactPoints.some((c) => c.valueHash === cp.valueHash)) {
      throw new ConflictError('contact_point_exists', 'Contact point already exists for this party');
    }
    const points = [...this._props.contactPoints, cp];
    this._props.contactPoints = Party.ensureOnePrimaryPerChannel(points);
  }

  removeContactPoint(hash: string): void {
    if (this._props.contactPoints.length === 1) {
      throw new BusinessRuleError('last_contact_point', 'Cannot remove the last contact point');
    }
    const points = this._props.contactPoints.filter((c) => c.valueHash !== hash);
    this._props.contactPoints = Party.ensureOnePrimaryPerChannel(points);
  }

  setSensitive(input: { dateOfBirthEnc?: string; dobYear?: number; panEnc?: string; panHash?: string; panLast4?: string }): void {
    if (input.dateOfBirthEnc !== undefined) {
      this._props.dateOfBirthEnc = input.dateOfBirthEnc;
    }
    if (input.dobYear !== undefined) {
      this._props.dobYear = input.dobYear;
    }
    if (input.panEnc !== undefined) {
      this._props.panEnc = input.panEnc;
    }
    if (input.panHash !== undefined) {
      this._props.panHash = input.panHash;
    }
    if (input.panLast4 !== undefined) {
      this._props.panLast4 = input.panLast4;
    }
  }

  assignOwner(memberId: string, orgUnitId: string): void {
    this._props.ownerMemberId = memberId;
    this._props.orgUnitId = orgUnitId;
  }

  setSensitiveField(field: 'preferredLanguage' | 'preferredChannel', value: string | undefined): void {
    if (field === 'preferredLanguage') {
      this._props.preferredLanguage = value ?? 'en';
    } else if (field === 'preferredChannel') {
      this._props.preferredChannel = value;
    }
  }

  setContactPoints(contactPoints: readonly ContactPoint[]): void {
    this._props.contactPoints = Party.ensureOnePrimaryPerChannel(contactPoints);
  }

  setTags(tags: readonly string[]): void {
    this._props.tags = Array.from(tags);
  }

  /**
   * Replaces the stored custom-field set with `values`. The caller (PartyService) passes the validated values merged with the
   * hidden keys of non-active definitions, so those survive a full write (M00 §16.5). Bumps updatedAt.
   */
  replaceCustomFields(values: CustomFieldValues, now: Date): void {
    this._props.customFields = { ...values };
    this._props.updatedAt = now.toISOString();
  }

  /** Merge (M03 §11): copies keys this party lacks from `from`; returns the copied keys so a reversal can remove exactly those. */
  absorbCustomFields(from: CustomFieldValues, now: Date): string[] {
    const copied = Object.keys(from).filter((k) => !(k in this._props.customFields));
    if (copied.length === 0) return copied;
    this._props.customFields = { ...this._props.customFields, ...Object.fromEntries(copied.map((k) => [k, from[k]])) };
    this._props.updatedAt = now.toISOString();
    return copied;
  }

  /** Reversal of a merge: removes the keys copied in by `absorbCustomFields`. */
  releaseCustomFields(keys: readonly string[], now: Date): void {
    if (keys.length === 0) return;
    this._props.customFields = Object.fromEntries(Object.entries(this._props.customFields).filter(([k]) => !keys.includes(k)));
    this._props.updatedAt = now.toISOString();
  }

  markMerged(intoId: string, now: Date): void {
    if (this._props.status !== 'ACTIVE') {
      throw new BusinessRuleError('party_not_active', 'Only ACTIVE parties can be merged');
    }
    this._props.status = 'MERGED';
    this._props.mergedIntoId = intoId;
    this._props.updatedAt = now.toISOString();
  }

  restoreFromMerge(now: Date): void {
    if (this._props.status !== 'MERGED') {
      throw new BusinessRuleError('party_not_merged', 'Only a merged party can be restored');
    }
    this._props.status = 'ACTIVE';
    this._props.mergedIntoId = undefined;
    this._props.updatedAt = now.toISOString();
  }

  erase(now: Date): void {
    this._props.status = 'ERASED';
    this._props.displayName = '[erased]';
    this._props.contactPoints = [];
    this._props.dateOfBirthEnc = undefined;
    this._props.dobYear = undefined;
    this._props.panEnc = undefined;
    this._props.panHash = undefined;
    this._props.panLast4 = undefined;
    this._props.customFields = {};
    this._props.updatedAt = now.toISOString();
  }

  primary(channel: string): ContactPoint | undefined {
    return this._props.contactPoints.find((c) => c.channel === channel && c.isPrimary);
  }

  /** Called by repositories after a successful optimistic save. */
  markSaved(): void {
    this._props.version += 1;
  }

  touch(now: Date): void {
    this._props.updatedAt = now.toISOString();
  }

  get props(): Readonly<PartyProps> {
    return this._props as Readonly<PartyProps>;
  }
}
