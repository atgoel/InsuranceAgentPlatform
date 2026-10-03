import { Party } from './party';
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
  readonly movedLinks: { roleLinks: number; consents: number; household?: string };
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

    const fromSurvival = (field: MergeField): Party => (this.choices_.get(field) === 'A' ? this.a : this.b);

    const newDisplayName = fromSurvival('displayName').props.displayName;
    survivor.rename(newDisplayName, now);

    const newLanguage = fromSurvival('preferredLanguage').props.preferredLanguage;
    if (newLanguage) {
      survivor.setSensitiveField('preferredLanguage', newLanguage);
    }

    const newChannel = fromSurvival('preferredChannel').props.preferredChannel;
    if (newChannel) {
      survivor.setSensitiveField('preferredChannel', newChannel);
    }

    const newOwner = fromSurvival('ownerMemberId').props.ownerMemberId;
    const newOrgUnit = fromSurvival('ownerMemberId').props.orgUnitId;
    if (newOwner && newOrgUnit) {
      survivor.assignOwner(newOwner, newOrgUnit);
    }

    const dobEncValue = fromSurvival('dateOfBirth').props.dateOfBirthEnc;
    const dobYear = fromSurvival('dateOfBirth').props.dobYear;
    if (dobEncValue !== undefined || dobYear !== undefined) {
      survivor.setSensitive({ dateOfBirthEnc: dobEncValue, dobYear });
    }

    const panEncValue = fromSurvival('pan').props.panEnc;
    const panHash = fromSurvival('pan').props.panHash;
    const panLast4 = fromSurvival('pan').props.panLast4;
    if (panEncValue || panHash || panLast4) {
      survivor.setSensitive({ panEnc: panEncValue, panHash, panLast4 });
    }

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
