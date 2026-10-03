import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { AdviceRecord } from '../domain/advice-record';
import { QuoteOptionProps, QuoteRequest } from '../domain/quote';
import { BiRecord } from '../domain/benefit-illustration';

export type { Transaction };
export { RECORD_SCOPE_PROVIDER } from '../../distribution/application/ports';
export type { RecordScope, RecordScopeProvider } from '../../distribution/application/ports';
export { PARTY_FACADE } from '../../party/application/ports';
export type { PartyFacade, PartySummary } from '../../party/application/ports';
export { OPPORTUNITY_LOOKUP } from '../../crm/application/ports';
export type { OpportunityLookup, OpportunitySnapshot } from '../../crm/application/ports';
export { CATALOGUE_QUERY, COMPARISON_SCOPE_FACADE } from '../../catalogue/application/ports';
export type { CatalogueQueryFacade, ComparisonScopeFacade, VersionDetail } from '../../catalogue/application/ports';

export interface CalculatorRun {
  id: string;
  partyId: string;
  calculator: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  assumptionsVersion: string;
  ranBy: string;
  ranAt: string;
}

export interface AdviceRepository {
  get(tx: Transaction, id: string): Promise<AdviceRecord | undefined>;
  /** Optimistic version; calls record.markSaved(). */
  save(tx: Transaction, a: AdviceRecord): Promise<void>;
  forParty(tx: Transaction, partyId: string): Promise<AdviceRecord[]>;
}

export interface QuoteRepository {
  get(tx: Transaction, id: string): Promise<QuoteRequest | undefined>;
  save(tx: Transaction, q: QuoteRequest): Promise<void>;
  forOpportunity(tx: Transaction, opportunityId: string): Promise<QuoteRequest[]>;
  findOption(tx: Transaction, optionId: string): Promise<{ request: QuoteRequest; option: QuoteOptionProps } | undefined>;
  /** OPEN/SHARED requests whose latest option validity is before `date` (candidates for expiry). */
  openWithValidityBefore(tx: Transaction, date: string, limit: number): Promise<QuoteRequest[]>;
}

export interface BiRepository {
  get(tx: Transaction, id: string): Promise<BiRecord | undefined>;
  save(tx: Transaction, b: BiRecord): Promise<void>;
  forOption(tx: Transaction, optionId: string): Promise<BiRecord[]>;
}

export interface CalculatorRunRepository {
  add(tx: Transaction, run: CalculatorRun): Promise<void>;
  /** Newest first. */
  forParty(tx: Transaction, partyId: string, limit: number): Promise<CalculatorRun[]>;
}

export const ADVICE_REPOSITORY = Symbol('AdviceRepository');
export const QUOTE_REPOSITORY = Symbol('QuoteRepository');
export const BI_REPOSITORY = Symbol('BiRepository');
export const CALCULATOR_RUN_REPOSITORY = Symbol('CalculatorRunRepository');
export const SHARE_TOKEN_SIGNER = Symbol('ShareTokenSigner');
