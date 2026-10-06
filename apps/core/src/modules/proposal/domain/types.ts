// Shared M09 vocabulary (LLD §3.1). Values are string-literal unions so every status is handled explicitly.

export type ProposalLine = 'LIFE' | 'HEALTH' | 'GENERAL';

export type PartyRole = 'PROPOSER' | 'LIFE_ASSURED' | 'INSURED' | 'PAYER' | 'NOMINEE';

/** DATE answers are IST calendar dates `YYYY-MM-DD`; MONEY answers are integer paise. */
export type AnswerValue = string | number | boolean | string[];

export type Sensitivity = 'P2' | 'P3';

export type ProposalStatus =
  | 'DRAFT'
  | 'READY_FOR_CONFIRMATION'
  | 'CONFIRMED'
  | 'SUBMITTED'
  | 'UNDERWRITING'
  | 'REQUIREMENTS_PENDING'
  | 'ISSUED'
  | 'DECLINED'
  | 'WITHDRAWN';

export const TERMINAL_PROPOSAL_STATUSES: readonly ProposalStatus[] = ['ISSUED', 'DECLINED', 'WITHDRAWN'];

export type ConfirmationMethod = 'CUSTOMER_OTP' | 'CUSTOMER_LINK' | 'ASSISTED_SIGNATURE';

export type SubmissionStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'UNKNOWN' | 'REJECTED';

export type PaymentStatus = 'NOT_STARTED' | 'LINK_SENT' | 'PAID' | 'FAILED' | 'REFUNDED';

export type PaymentMethod = 'INSURER_LINK' | 'INSURER_PORTAL' | 'CHEQUE_TO_INSURER';

export type RequirementKind = 'MEDICAL' | 'INSPECTION' | 'DOCUMENT' | 'CLARIFICATION';

export type PrefillSource =
  | 'party.displayName'
  | 'party.dob'
  | 'party.pan'
  | 'quote.sumAssured'
  | 'quote.policyTermYears'
  | 'quote.premiumPayingTermYears';
