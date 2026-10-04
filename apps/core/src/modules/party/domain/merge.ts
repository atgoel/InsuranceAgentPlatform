import { Party } from './party';
import { Relation } from './household';
import { ContactPoint } from './contact-point';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';

export type MergeField = 'displayName' | 'dateOfBirth' | 'pan' | 'preferredLanguage' | 'preferredChannel' | 'ownerMemberId';

export interface SurvivorChoice {
  readonly field: MergeField;
  readonly from: 'A' | 'B';
}

export interface MergeRecord {
  readonly id: string;
  readonly survivorId: string;
  readonly mergedId: string;
  readonly choices: readonly SurvivorChoice[];
  /** What moved to the survivor, so a reversal can move exactly that back (roleLinkKeys = role|subjectType|subjectId). */
  readonly movedLinks: { roleLinks: number; consents: number; household?: string; householdRelation?: Relation; roleLinkKeys?: string[]; customFieldKeys?: string[] };
  readonly mergedAt: string;
  readonly mergedBy: string;
  readonly reversibleUntil: string;
  readonly reversedAt?: string;
}

const MERGE_FIELDS: readonly MergeField[] = ['displayName', 'dateOfBirth', 'pan', 'preferredLanguage', 'preferredChannel', 'ownerMemberId'];

export class MergePlan {
  private a: Party;
  private b: Party;
  private survivorParty: 'A' | 'B';
  private choices_: Map<MergeField, 'A' | 'B'>;

  private constructor(a: Party, b: Party, survivor: 'A' | 'B', choices: Map<MergeField, 'A' | 'B'>) {
    this.a = a;
    this.b = b;
    this.survivorParty = survivor;
    this.choices_ = choices;
  }

  static build(a: Party, b: Party, choices: SurvivorChoice[], survivor: 'A' | 'B'): MergePlan {
    if (a.props.id === b.props.id) {
      throw new BusinessRuleError('same_party_id', 'Cannot merge a party with itself');
    }

    if (a.props.status !== 'ACTIVE' || b.props.status !== 'ACTIVE') {
      throw new BusinessRuleError('party_not_active', 'Both parties must be ACTIVE to merge');
    }

    const choiceMap = new Map<MergeField, 'A' | 'B'>(choices.map((c) => [c.field, c.from]));

    for (const field of MERGE_FIELDS) {
      if (!choiceMap.has(field)) {
        choiceMap.set(field, survivor);
      }
    }

    return new MergePlan(a, b, survivor, choiceMap);
  }

  apply(now: Date): { survivor: Party; merged: Party } {
    const survivor = this.survivorParty === 'A' ? this.a : this.b;
    const mergedParty = this.survivorParty === 'A' ? this.b : this.a;
    this.applyProfile(survivor, now);
    this.applySensitive(survivor);
    const unionedContactPoints = this.unionContactPoints(
      Array.from(survivor.props.contactPoints),
      Array.from(mergedParty.props.contactPoints)
    );
    survivor.setContactPoints(unionedContactPoints);

    const unionedTags = this.unionTags(
      Array.from(survivor.props.tags),
      Array.from(mergedParty.props.tags)
    );
    survivor.setTags(unionedTags);

    mergedParty.markMerged(survivor.props.id, now);

    return { survivor, merged: mergedParty };
  }

  private from(field: MergeField): Party {
    return this.choices_.get(field) === 'A' ? this.a : this.b;
  }

  private applyProfile(survivor: Party, now: Date): void {
    survivor.rename(this.from('displayName').props.displayName, now);
    const language = this.from('preferredLanguage').props.preferredLanguage;
    if (language) survivor.setSensitiveField('preferredLanguage', language);
    const channel = this.from('preferredChannel').props.preferredChannel;
    if (channel) survivor.setSensitiveField('preferredChannel', channel);
    const owner = this.from('ownerMemberId').props;
    if (owner.ownerMemberId && owner.orgUnitId) survivor.assignOwner(owner.ownerMemberId, owner.orgUnitId);
  }

  private applySensitive(survivor: Party): void {
    const dob = this.from('dateOfBirth').props;
    if (dob.dateOfBirthEnc !== undefined || dob.dobYear !== undefined) survivor.setSensitive({ dateOfBirthEnc: dob.dateOfBirthEnc, dobYear: dob.dobYear, birthday: dob.birthday });
    const pan = this.from('pan').props;
    if (pan.panEnc || pan.panHash || pan.panLast4) survivor.setSensitive({ panEnc: pan.panEnc, panHash: pan.panHash, panLast4: pan.panLast4 });
  }

  private unionContactPoints(survivorCps: ContactPoint[], mergedCps: ContactPoint[]): readonly ContactPoint[] {
    const byHash = new Map<string, ContactPoint>();

    for (const cp of survivorCps) {
      byHash.set(cp.valueHash, { ...cp, isPrimary: true });
    }

    for (const cp of mergedCps) {
      if (!byHash.has(cp.valueHash)) {
        byHash.set(cp.valueHash, { ...cp, isPrimary: false });
      }
    }

    const result = Array.from(byHash.values());

    const byChannel = new Map<string, ContactPoint[]>();
    for (const cp of result) {
      if (!byChannel.has(cp.channel)) {
        byChannel.set(cp.channel, []);
      }
      byChannel.get(cp.channel)!.push(cp);
    }

    const final: ContactPoint[] = [];
    for (const [, cps] of byChannel) {
      const survivorPrimary = cps.find((cp) => survivorCps.some((scp) => scp.valueHash === cp.valueHash && scp.isPrimary));
      for (const cp of cps) {
        final.push({
          ...cp,
          isPrimary: cp === survivorPrimary,
        });
      }
    }

    return final;
  }

  private unionTags(survivorTags: string[], mergedTags: string[]): readonly string[] {
    const tags = new Set([...survivorTags, ...mergedTags]);
    return Array.from(tags);
  }
}
