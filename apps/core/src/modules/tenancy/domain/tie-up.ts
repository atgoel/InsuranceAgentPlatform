import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { Specification } from '../../../kernel/domain/specification';
import { EntityType } from './distributor-entity';

export type LineOfBusiness = 'LIFE' | 'HEALTH' | 'GENERAL';

export interface TieUp {
  insurerId: string;
  line: LineOfBusiness;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface TieUpLimit {
  entityType: EntityType;
  line: LineOfBusiness;
  maxInsurers: number | null;
}

export class TieUpLimitPolicy {
  private limits: Map<string, number | null>;

  constructor(limits: TieUpLimit[]) {
    this.limits = new Map();
    for (const limit of limits) {
      const key = `${limit.entityType}:${limit.line}`;
      this.limits.set(key, limit.maxInsurers);
    }
  }

  maxFor(entityType: EntityType, line: LineOfBusiness): number | null {
    const key = `${entityType}:${line}`;
    const result = this.limits.get(key);
    // Missing row → 0 (deny by default)
    return result !== undefined ? result : 0;
  }

  static default(): TieUpLimitPolicy {
    const limits: TieUpLimit[] = [
      // IMF: 6 per line
      { entityType: 'IMF', line: 'LIFE', maxInsurers: 6 },
      { entityType: 'IMF', line: 'HEALTH', maxInsurers: 6 },
      { entityType: 'IMF', line: 'GENERAL', maxInsurers: 6 },
      // CORPORATE_AGENT: 9 per line
      { entityType: 'CORPORATE_AGENT', line: 'LIFE', maxInsurers: 9 },
      { entityType: 'CORPORATE_AGENT', line: 'HEALTH', maxInsurers: 9 },
      { entityType: 'CORPORATE_AGENT', line: 'GENERAL', maxInsurers: 9 },
      // INDIVIDUAL_AGENT: 1 per line
      { entityType: 'INDIVIDUAL_AGENT', line: 'LIFE', maxInsurers: 1 },
      { entityType: 'INDIVIDUAL_AGENT', line: 'HEALTH', maxInsurers: 1 },
      { entityType: 'INDIVIDUAL_AGENT', line: 'GENERAL', maxInsurers: 1 },
      // BROKER: unlimited (null)
      { entityType: 'BROKER', line: 'LIFE', maxInsurers: null },
      { entityType: 'BROKER', line: 'HEALTH', maxInsurers: null },
      { entityType: 'BROKER', line: 'GENERAL', maxInsurers: null },
    ];
    return new TieUpLimitPolicy(limits);
  }
}

export class TieUpSet {
  private tieUps: TieUp[];

  constructor(tieUps: TieUp[]) {
    this.tieUps = tieUps;
  }

  /** Every tie-up, past and future (for persistence). */
  all(): TieUp[] {
    return this.tieUps.map((t) => ({ ...t }));
  }

  private validateDates(): void {
    for (const tieUp of this.tieUps) {
      if (tieUp.effectiveTo && tieUp.effectiveTo < tieUp.effectiveFrom) {
        throw new ValidationError('tie_up_dates_invalid', 'effectiveTo must be >= effectiveFrom');
      }
    }
  }

  private periodsOverlap(t1: TieUp, t2: TieUp): boolean {
    const t1End = t1.effectiveTo || '9999-12-31';
    const t2End = t2.effectiveTo || '9999-12-31';

    const t1From = new Date(t1.effectiveFrom);
    const t1To = new Date(t1End);
    const t2From = new Date(t2.effectiveFrom);
    const t2To = new Date(t2End);

    return !(t1To < t2From || t2To < t1From);
  }

  private checkOverlapForPair(t1: TieUp, t2: TieUp): void {
    if (t1.insurerId === t2.insurerId && t1.line === t2.line && this.periodsOverlap(t1, t2)) {
      throw new ValidationError('tie_up_overlap', 'Tie-up periods cannot overlap for same insurer and line');
    }
  }

  private validateNoOverlap(): void {
    for (let i = 0; i < this.tieUps.length; i++) {
      for (let j = i + 1; j < this.tieUps.length; j++) {
        this.checkOverlapForPair(this.tieUps[i], this.tieUps[j]);
      }
    }
  }

  private boundaryDates(): string[] {
    const allDates = new Set<string>();
    for (const tieUp of this.tieUps) {
      allDates.add(tieUp.effectiveFrom);
    }
    return Array.from(allDates).sort();
  }

  private validateLimits(entityType: EntityType, policy: TieUpLimitPolicy): void {
    const dates = this.boundaryDates();

    for (const dateStr of dates) {
      const activeOnDate = this.activeOn(dateStr);

      const byLine = new Map<LineOfBusiness, Set<string>>();
      for (const tieUp of activeOnDate) {
        if (!byLine.has(tieUp.line)) {
          byLine.set(tieUp.line, new Set());
        }
        byLine.get(tieUp.line)!.add(tieUp.insurerId);
      }

      for (const [line, insurers] of byLine) {
        const max = policy.maxFor(entityType, line);
        if (max !== null && insurers.size > max) {
          throw new BusinessRuleError(
            'tie_up_limit_exceeded',
            `Too many insurers for ${line}`,
            { line, max, found: insurers.size }
          );
        }
      }
    }
  }

  validate(entityType: EntityType, policy: TieUpLimitPolicy): void {
    this.validateDates();
    this.validateNoOverlap();
    this.validateLimits(entityType, policy);
  }

  activeOn(date: string, line?: LineOfBusiness): TieUp[] {
    const dateObj = new Date(date);
    return this.tieUps.filter((tieUp) => {
      if (line && tieUp.line !== line) {
        return false;
      }

      const effectiveFrom = new Date(tieUp.effectiveFrom);
      const effectiveTo = tieUp.effectiveTo ? new Date(tieUp.effectiveTo) : null;

      return dateObj >= effectiveFrom && (!effectiveTo || dateObj <= effectiveTo);
    });
  }

  insurersFor(line: LineOfBusiness, date: string): string[] {
    const active = this.activeOn(date, line);
    return active.map((t) => t.insurerId);
  }
}

export class TieUpLimitSpecification extends Specification<{ entityType: EntityType; tieUps: TieUpSet }> {
  private policy: TieUpLimitPolicy;

  constructor(policy: TieUpLimitPolicy) {
    super();
    this.policy = policy;
  }

  isSatisfiedBy(candidate: { entityType: EntityType; tieUps: TieUpSet }): boolean {
    try {
      candidate.tieUps.validate(candidate.entityType, this.policy);
      return true;
    } catch {
      return false;
    }
  }
}
