export type InsuranceLine = 'LIFE' | 'HEALTH' | 'GENERAL';
export interface CanonicalTarget {
  schemaVersion: 'v1';
  insurerId: string;
  line: InsuranceLine;
}
export interface CanonicalQuoteRequest extends CanonicalTarget {
  quoteRequestId: string;
  productVersionId: string;
  requirements: Record<string, unknown>;
}
export interface CanonicalQuoteResponse {
  schemaVersion: 'v1';
  insurerQuoteRef: string;
  premium: {
    amountPaise: number;
    currency: 'INR';
  };
  validUntil: string;
  benefitIllustrationRef?: string;
}
export interface CanonicalProposal extends CanonicalTarget {
  proposalId: string;
  productVersionId: string;
  quoteOptionId: string;
  templateVersion: string;
  snapshotHash: string;
  answers: Record<string, unknown>;
  parties: Array<{
    partyId: string;
    role: 'PROPOSER' | 'LIFE_ASSURED' | 'INSURED' | 'PAYER' | 'NOMINEE';
  }>;
  declarations: Array<{
    key: string;
    version: string;
    acceptedAt: string;
  }>;
  documents: Array<{
    kind: string;
    documentRef: string;
  }>;
  confirmedAt: string;
}
export interface SubmissionResult {
  schemaVersion: 'v1';
  insurerRef: string;
  acknowledgedAt: string;
}
export type PolicyStatusResult = {
  schemaVersion: 'v1';
  status: 'NOT_FOUND';
  checkedAt: string;
} | {
  schemaVersion: 'v1';
  status: 'RECEIVED' | 'UNDERWRITING' | 'REQUIREMENTS_PENDING' | 'DECLINED';
  insurerRef: string;
  checkedAt: string;
} | {
  schemaVersion: 'v1';
  status: 'ISSUED';
  insurerRef: string;
  checkedAt: string;
  policyNumber: string;
  issuedOn: string;
  documentRef: string;
  premium: {
    amountPaise: number;
    currency: 'INR';
  };
  sumAssuredPaise?: number;
};
export interface StatusRequest extends CanonicalTarget {
  insurerRef?: string;
}
export interface PaymentLinkRequest extends CanonicalTarget {
  proposalId: string;
  insurerRef: string;
  amount: {
    amountPaise: number;
    currency: 'INR';
  };
}
export interface PaymentLinkResult {
  url: string;
  expiresAt: string;
}
export interface CommissionStatement {
  schemaVersion: 'v1';
  insurerId: string;
  statementRef: string;
  periodFrom: string;
  periodTo: string;
  entries: Array<{
    insurerRef: string;
    receivedOn: string;
    amountPaise: number;
  }>;
}
