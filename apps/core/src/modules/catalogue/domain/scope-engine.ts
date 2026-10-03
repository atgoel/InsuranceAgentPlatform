import type { LineOfBusiness, DistributorChannel, Insurer, Product } from './catalogue';
import type { ProductVersionProps } from './product-version';

// Re-export types that tests expect
export type { ProductVersionProps, Insurer };

export interface ScopeInput {
  entityType: DistributorChannel;
  comparisonScope: 'MARKET_WIDE' | 'TIED_INSURERS';
  tiedInsurerIds: Partial<Record<LineOfBusiness, string[]>>;
  salesperson: { type: 'EMPLOYEE' | 'ISP' | 'POSP' | 'SOLO'; lines: LineOfBusiness[] };
  line?: LineOfBusiness;
  category?: Product['category'];
  date: string;
}

export interface ScopedVersion {
  versionId: string;
  productId: string;
  insurerId: string;
  line: LineOfBusiness;
}

export type ScopeExclusion = 'not_effective' | 'channel_not_permitted' | 'insurer_not_tied' | 'not_pos_eligible' | 'line_not_licensed' | 'insurer_inactive' | 'filtered_out';

export interface ScopeResult {
  versions: ScopedVersion[];
  insurerIds: string[];
  excluded: Array<{ versionId: string; reason: ScopeExclusion }>;
  disclosure: string;
}

export interface ScopeFilter {
  readonly reason: ScopeExclusion;
  allows(v: ProductVersionProps, insurer: Insurer, input: ScopeInput): boolean;
}

class EffectiveFilter implements ScopeFilter {
  readonly reason: ScopeExclusion = 'not_effective';

  allows(v: ProductVersionProps, _insurer: Insurer, input: ScopeInput): boolean {
    // Must be active
    if (v.status !== 'active') return false;

    // Must be within effective dates
    if (input.date < v.effectiveFrom) return false;
    if (v.effectiveTo && input.date > v.effectiveTo) return false;

    return true;
  }
}

class InsurerActiveFilter implements ScopeFilter {
  readonly reason: ScopeExclusion = 'insurer_inactive';

  allows(_v: ProductVersionProps, insurer: Insurer, _input: ScopeInput): boolean {
    return insurer.active;
  }
}

class ChannelFilter implements ScopeFilter {
  readonly reason: ScopeExclusion = 'channel_not_permitted';

  allows(v: ProductVersionProps, _insurer: Insurer, input: ScopeInput): boolean {
    return v.channels.includes(input.entityType);
  }
}

class TieUpFilter implements ScopeFilter {
  readonly reason: ScopeExclusion = 'insurer_not_tied';

  allows(v: ProductVersionProps, _insurer: Insurer, input: ScopeInput): boolean {
    // MARKET_WIDE always passes
    if (input.comparisonScope === 'MARKET_WIDE') return true;

    // TIED_INSURERS: insurer must be in tiedInsurerIds for this line
    return input.tiedInsurerIds[v.line]?.includes(v.insurerId) ?? false;
  }
}

class PosEligibilityFilter implements ScopeFilter {
  readonly reason: ScopeExclusion = 'not_pos_eligible';

  /** Only POSP salespeople are limited to POS-eligible products (IRDAI POSP guidelines). */
  allows(v: ProductVersionProps, _insurer: Insurer, input: ScopeInput): boolean {
    return input.salesperson.type !== 'POSP' || v.posEligible;
  }
}

class LicensedLineFilter implements ScopeFilter {
  readonly reason: ScopeExclusion = 'line_not_licensed';

  allows(v: ProductVersionProps, _insurer: Insurer, input: ScopeInput): boolean {
    return input.salesperson.lines.includes(v.line);
  }
}

class RequestFilter implements ScopeFilter {
  readonly reason: ScopeExclusion = 'filtered_out';

  allows(v: ProductVersionProps, _insurer: Insurer, input: ScopeInput): boolean {
    // Filter by line if provided
    if (input.line && v.line !== input.line) {
      return false;
    }

    // Category comes from the version's product (resolved by the engine before filtering)
    return !input.category || (v as CategorisedVersion).category === input.category;
  }
}

/** A version with its product's category resolved (RequestFilter narrows by it). */
type CategorisedVersion = ProductVersionProps & { category?: Product['category'] };

export class ComparisonScopeEngine {
  private filters: ScopeFilter[];

  constructor(filters?: ScopeFilter[]) {
    this.filters = filters ?? [
      new EffectiveFilter(),
      new InsurerActiveFilter(),
      new ChannelFilter(),
      new TieUpFilter(),
      new PosEligibilityFilter(),
      new LicensedLineFilter(),
      new RequestFilter(),
    ];
  }

  evaluate(
    input: ScopeInput,
    catalogue: { versions: ProductVersionProps[]; insurers: Insurer[]; products?: Product[] }
  ): ScopeResult {
    const insurerMap = new Map(catalogue.insurers.map(i => [i.id, i]));
    const categoryOf = new Map((catalogue.products ?? []).map((p) => [p.id, p.category]));
    const included: ScopedVersion[] = [];
    const excluded: Array<{ versionId: string; reason: ScopeExclusion }> = [];
    const insurerIdsSet = new Set<string>();

    for (const raw of catalogue.versions) {
      const version: CategorisedVersion = { ...raw, category: categoryOf.get(raw.productId) };
      const insurer = insurerMap.get(version.insurerId);
      if (!insurer) {
        excluded.push({ versionId: version.id, reason: 'insurer_inactive' }); // unknown insurer is never comparable
        continue;
      }

      let isAllowed = true;
      let exclusionReason: ScopeExclusion | null = null;

      // Check each filter in order
      for (const filter of this.filters) {
        if (!filter.allows(version, insurer, input)) {
          isAllowed = false;
          exclusionReason = filter.reason;
          break;
        }
      }

      if (isAllowed) {
        included.push({
          versionId: version.id,
          productId: version.productId,
          insurerId: version.insurerId,
          line: version.line,
        });
        insurerIdsSet.add(version.insurerId);
      } else if (exclusionReason) {
        excluded.push({
          versionId: version.id,
          reason: exclusionReason,
        });
      }
    }

    const insurerIds = Array.from(insurerIdsSet).sort();
    const insurerNames = insurerIds
      .map(id => insurerMap.get(id)?.name)
      .filter((name): name is string => name !== undefined);

    const disclosure = disclosureFor(input, insurerNames);

    return {
      versions: included,
      insurerIds,
      excluded,
      disclosure,
    };
  }
}

export function disclosureFor(input: ScopeInput, insurerNames: string[]): string {
  // POSP takes precedence over entity type
  if (input.salesperson.type === 'POSP') {
    return 'POSP view: only POSP-eligible products are shown. Other plans need an ISP or employee salesperson.';
  }

  // INDIVIDUAL_AGENT
  if (input.entityType === 'INDIVIDUAL_AGENT') {
    return 'Agent view: only your appointing insurer for this line is shown (one insurer per line today; limits are configurable).';
  }

  // Sort names alphabetically (case-insensitive)
  const sortedNames = [...insurerNames].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  // BROKER (MARKET_WIDE)
  if (input.entityType === 'BROKER') {
    const names = sortedNames.length === 0 ? 'none configured' : sortedNames.join(', ');
    return `Broker view: comparing across all configured insurers (${names}). Advice is documented in the advice record.`;
  }

  // IMF and CORPORATE_AGENT (TIED_INSURERS)
  const names = sortedNames.length === 0 ? 'none configured' : sortedNames.join(', ');
  return `Showing plans from your tied insurers only: ${names}. This disclosure appears on shared comparisons.`;
}
