import { normaliseName, jaroWinkler } from './name-matching';

export interface MatchCandidateInput {
  readonly partyId?: string;
  readonly displayName: string;
  readonly contactHashes: string[];
  readonly panHash?: string;
  readonly dobYear?: number;
  readonly dobHash?: string;
}

export interface DuplicateSignal {
  readonly rule: string;
  readonly score: number;
  readonly autoMergeAllowed: false;
  readonly explanation: string;
}

export interface DuplicateRule {
  readonly name: string;
  match(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined;
}

export class SamePanRule implements DuplicateRule {
  readonly name = 'SamePanRule';

  match(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined {
    if (!a.panHash || !b.panHash) {
      return undefined;
    }
    if (a.panHash === b.panHash) {
      return {
        rule: this.name,
        score: 100,
        autoMergeAllowed: false,
        explanation: 'Same PAN',
      };
    }
    return undefined;
  }
}

export class SameMobileAndNameRule implements DuplicateRule {
  readonly name = 'SameMobileAndNameRule';

  match(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined {
    const sharedMobile = this.hasSharedContact(a.contactHashes, b.contactHashes);
    if (!sharedMobile) {
      return undefined;
    }

    const nameScore = jaroWinkler(
      normaliseName(a.displayName),
      normaliseName(b.displayName)
    );
    if (nameScore < 0.85) {
      return undefined;
    }

    return {
      rule: this.name,
      score: 90,
      autoMergeAllowed: false,
      explanation: 'Same mobile and similar name',
    };
  }

  private hasSharedContact(a: string[], b: string[]): boolean {
    const setB = new Set(b);
    return a.some((h) => setB.has(h));
  }
}

export class SameEmailAndNameRule implements DuplicateRule {
  readonly name = 'SameEmailAndNameRule';

  match(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined {
    const sharedEmail = this.hasSharedContact(a.contactHashes, b.contactHashes);
    if (!sharedEmail) {
      return undefined;
    }

    const nameScore = jaroWinkler(
      normaliseName(a.displayName),
      normaliseName(b.displayName)
    );
    if (nameScore < 0.85) {
      return undefined;
    }

    return {
      rule: this.name,
      score: 90,
      autoMergeAllowed: false,
      explanation: 'Same email and similar name',
    };
  }

  private hasSharedContact(a: string[], b: string[]): boolean {
    const setB = new Set(b);
    return a.some((h) => setB.has(h));
  }
}

export class NameAndDobRule implements DuplicateRule {
  readonly name = 'NameAndDobRule';

  match(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined {
    if (!a.dobHash || !b.dobHash) {
      return undefined;
    }
    if (a.dobHash !== b.dobHash) {
      return undefined;
    }

    const nameScore = jaroWinkler(
      normaliseName(a.displayName),
      normaliseName(b.displayName)
    );
    if (nameScore < 0.92) {
      return undefined;
    }

    return {
      rule: this.name,
      score: 80,
      autoMergeAllowed: false,
      explanation: 'Similar name and same DOB',
    };
  }
}

export class SharedContactOnlyRule implements DuplicateRule {
  readonly name = 'SharedContactOnlyRule';

  match(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined {
    const sharedContact = this.hasSharedContact(a.contactHashes, b.contactHashes);
    if (!sharedContact) {
      return undefined;
    }

    const nameScore = jaroWinkler(
      normaliseName(a.displayName),
      normaliseName(b.displayName)
    );
    if (nameScore >= 0.85) {
      return undefined;
    }

    return {
      rule: this.name,
      score: 40,
      autoMergeAllowed: false,
      explanation: 'Shared mobile — likely family member; never auto-merged',
    };
  }

  private hasSharedContact(a: string[], b: string[]): boolean {
    const setB = new Set(b);
    return a.some((h) => setB.has(h));
  }
}

export class DuplicateMatcher {
  private rules: DuplicateRule[];

  constructor(rules?: DuplicateRule[]) {
    this.rules = rules ?? [
      new SamePanRule(),
      new SameEmailAndNameRule(),
      new SameMobileAndNameRule(),
      new NameAndDobRule(),
      new SharedContactOnlyRule(),
    ];
  }

  compare(a: MatchCandidateInput, b: MatchCandidateInput): DuplicateSignal | undefined {
    for (const rule of this.rules) {
      const signal = rule.match(a, b);
      if (signal !== undefined) {
        return signal;
      }
    }
    return undefined;
  }

  isCandidate(signal: DuplicateSignal | undefined, threshold = 60): boolean {
    if (!signal) {
      return false;
    }
    return signal.score >= threshold;
  }
}
