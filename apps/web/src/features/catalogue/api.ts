import { ApiClient } from '../../lib/api/api-client';

export type LineOfBusiness = 'LIFE' | 'HEALTH' | 'GENERAL';

export interface CatalogueRow {
  versionId: string;
  productId: string;
  productName: string;
  insurerId: string;
  insurerName: string;
  line: LineOfBusiness;
  category: string;
  uin: string;
  wordingVersion: string;
  ispEligible: boolean;
  posEligible: boolean;
  status: 'draft' | 'active' | 'withdrawn';
  inScope: boolean;
  exclusion?: 'not_effective' | 'channel_not_permitted' | 'insurer_not_tied' | 'not_pos_eligible' | 'line_not_licensed' | 'insurer_inactive' | 'filtered_out';
}

export interface ResearchItem {
  versionId: string;
  productName: string;
  insurerName: string;
  line: LineOfBusiness;
  posEligible: boolean;
  summary: string;
  points: string[];
  sourceRef: string;
  sourceDate: string;
  stale: boolean;
  staleReason?: 'wording_changed' | 'older_than_365_days';
}

export interface ScopedVersion {
  versionId: string;
  productId: string;
  insurerId: string;
  insurerName: string;
  productName: string;
  line: LineOfBusiness;
}

export interface ScopeResult {
  versions: ScopedVersion[];
  insurers: Array<{ id: string; name: string }>;
  excluded: Array<{ versionId: string; reason: string }>;
  disclosure: string;
}

export interface KeyFact {
  label: string;
  value: string;
}

export interface VersionDetail extends CatalogueRow {
  wordingUrl?: string;
  keyFacts: KeyFact[];
  quoteRequirements: string[];
  effectiveFrom: string;
  effectiveTo?: string;
}

export function createCatalogueApi(apiClient: ApiClient) {
  return {
    async listProducts(filter?: {
      line?: LineOfBusiness;
      category?: string;
      insurerId?: string;
    }): Promise<{ items: CatalogueRow[] }> {
      return apiClient.get('/api/v1/catalogue/products', {
        query: {
          line: filter?.line,
          category: filter?.category,
          insurerId: filter?.insurerId,
        },
      });
    },

    async evaluateScope(opts: {
      line?: LineOfBusiness;
      category?: string;
      date?: string;
    }): Promise<ScopeResult> {
      return apiClient.post('/api/v1/catalogue/comparison-scopes/evaluations', {
        line: opts.line,
        category: opts.category,
        date: opts.date,
      });
    },

    async listResearch(filter?: {
      line?: LineOfBusiness;
      q?: string;
    }): Promise<{ items: ResearchItem[] }> {
      return apiClient.get('/api/v1/catalogue/research', {
        query: {
          line: filter?.line,
          q: filter?.q,
        },
      });
    },

    async getVersion(id: string): Promise<VersionDetail> {
      return apiClient.get(`/api/v1/catalogue/versions/${id}`);
    },
  };
}

export type CatalogueApi = ReturnType<typeof createCatalogueApi>;
