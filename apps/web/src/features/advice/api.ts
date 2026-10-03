import { ApiClient } from '../../lib/api/api-client';

export type CalculatorId = 'protection-gap' | 'retirement' | 'child-goal' | 'health-sum-insured' | 'floater';

export interface CalcOutput {
  result: Record<string, unknown>;
  workings: Array<{ label: string; value: string | number }>;
  assumptionsVersion: string;
}

export type MissingItem = 'recommendation' | 'customerChoice';

export interface AdviceView {
  id: string;
  partyId: string;
  opportunityId?: string;
  advisorMemberId: string;
  status: 'DRAFT' | 'FINALISED';
  finalisedAt?: string;
  version: number;
  createdAt: string;
  scope: { disclosure: string; entityType: string; versionIdsShown: string[]; excludedCount: number; evaluatedOn: string };
  calculatorRuns: Array<{ calculator: CalculatorId; inputs: Record<string, unknown>; outputs: Record<string, unknown>; assumptionsVersion: string; ranAt: string }>;
  suitabilityNotes: string;
  shownProducts: Array<{ versionId: string; productName: string; insurerName: string; line: string; category: string }>;
  recommended: Array<{ versionId: string; rationale: string; productName: string; insurerName: string }>;
  customerChoice?: { versionId: string; reasonIfDifferent?: string; productName: string; insurerName: string };
  missing: MissingItem[];
}

export type BiMethod = 'CUSTOMER_LINK' | 'ASSISTED';

export interface BiRecord {
  id: string;
  documentRef: string;
  insurerBiVersion: string;
  uploadedAt: string;
  acknowledgement?: { method: BiMethod; at: string; by: string; evidenceRef?: string };
}

export interface Premium {
  basePaise: number;
  ridersPaise: number;
  taxPaise: number;
  totalPaise: number;
  frequency: string;
}

export interface QuoteOption {
  id: string;
  versionId: string;
  insurerId: string;
  source: string;
  insurerQuoteRef?: string;
  sumAssuredPaise: number;
  policyTermYears?: number;
  premium: Premium;
  coverage: Array<{ label: string; value: string }>;
  exclusions: string[];
  waitingPeriods: Array<{ label: string; months: number }>;
  validUntil: string;
  productName: string;
  insurerName: string;
  category: string;
  expired: boolean;
  bi: { required: boolean; acknowledged: boolean; records: BiRecord[] };
}

export interface QuoteView {
  id: string;
  opportunityId: string;
  partyId: string;
  line: string;
  status: 'OPEN' | 'SHARED' | 'SELECTED' | 'EXPIRED' | 'WITHDRAWN';
  selectedOptionId?: string;
  version: number;
  disclosure: string;
  options: QuoteOption[];
  comparison: Array<{ key: string; label: string; values: Array<string | number | null> }>;
}

export interface OptionInput {
  versionId: string;
  source: 'MANUAL_PORTAL';
  insurerQuoteRef?: string;
  sumAssuredPaise: number;
  policyTermYears?: number;
  premium: Premium;
  coverage: Array<{ label: string; value: string }>;
  exclusions: string[];
  waitingPeriods: Array<{ label: string; months: number }>;
  assumptions: Record<string, never>;
  validUntil: string;
}

const BASE = '/api/v1';

export function createAdviceApi(apiClient: ApiClient) {
  return {
    runCalculator(calculator: CalculatorId, input: Record<string, unknown>, partyId?: string): Promise<CalcOutput> {
      const body = partyId ? { input, partyId } : { input };
      return apiClient.post(`${BASE}/calculators/${calculator}/runs`, body);
    },

    getAdvice(id: string): Promise<AdviceView> {
      return apiClient.get(`${BASE}/advice-records/${id}`);
    },
    addRecommendation(id: string, versionId: string, rationale: string): Promise<AdviceView> {
      return apiClient.post(`${BASE}/advice-records/${id}/recommendations`, { versionId, rationale });
    },
    setCustomerChoice(id: string, version: number, versionId: string, reasonIfDifferent?: string): Promise<AdviceView> {
      return apiClient.put(`${BASE}/advice-records/${id}/customer-choice`, { versionId, reasonIfDifferent }, { ifMatch: `"v${version}"` });
    },
    saveNotes(id: string, version: number, text: string): Promise<AdviceView> {
      return apiClient.put(`${BASE}/advice-records/${id}/notes`, { text }, { ifMatch: `"v${version}"` });
    },
    finalise(id: string): Promise<AdviceView> {
      return apiClient.post(`${BASE}/advice-records/${id}/finalisation`);
    },

    listQuotes(opportunityId: string): Promise<{ items: QuoteView[] }> {
      return apiClient.get(`${BASE}/quotes`, { query: { opportunityId } });
    },
    getQuote(id: string): Promise<QuoteView> {
      return apiClient.get(`${BASE}/quotes/${id}`);
    },
    createQuote(opportunityId: string): Promise<QuoteView> {
      return apiClient.post(`${BASE}/quotes`, { opportunityId, insuredPartyIds: [], requirements: {} });
    },
    addOption(quoteId: string, option: OptionInput): Promise<QuoteView> {
      return apiClient.post(`${BASE}/quotes/${quoteId}/options`, option);
    },
    removeOption(quoteId: string, optionId: string): Promise<void> {
      return apiClient.del(`${BASE}/quotes/${quoteId}/options/${optionId}`);
    },
    share(quoteId: string): Promise<{ url: string; expiresAt: string }> {
      return apiClient.post(`${BASE}/quotes/${quoteId}/shares`);
    },
    select(quoteId: string, optionId: string): Promise<QuoteView> {
      return apiClient.post(`${BASE}/quotes/${quoteId}/selection`, { optionId });
    },
    attachBi(optionId: string, documentRef: string, insurerBiVersion: string): Promise<BiRecord> {
      return apiClient.post(`${BASE}/quote-options/${optionId}/benefit-illustrations`, { documentRef, insurerBiVersion });
    },
    acknowledgeBi(biId: string, method: BiMethod, evidenceRef?: string): Promise<BiRecord> {
      return apiClient.post(`${BASE}/benefit-illustrations/${biId}/acknowledgement`, { method, evidenceRef });
    },
  };
}

export type AdviceApi = ReturnType<typeof createAdviceApi>;
