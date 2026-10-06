# M09 · Proposal & Issuance — low-level design

Status: Ready for build (contract completed by [ADR-M09-readiness-gaps](../../adr/ADR-M09-readiness-gaps.md)) · Depends on: M03, M04, M05, M06, M07, M08 · Requirements: Rev 3.0 F16, F17, F18, F19, F20, F24 (customer portal lite: save/resume, confirmation); §6 data model ("Proposal and proposal party", "Submission, payment, policy sale"); launch acceptance "ISP completes … proposal, and obtains insurer-confirmed issuance" · HLD §2 ("Insurer confirms the sale … a timeout is unknown until reconciled"), §7, §12 (unknown is a state; reconciliation jobs; paid-not-issued queue), §16 monitors · Screens: M10 `Proposal` (`ProposalForm.dc.html`), M11 `IssuanceTracker`, W16 `ProposalDesk` (`PortalFillSheet.dc.html`), C01 customer journey (`CustomerJourney.dc.html`, review + OTP + confirmation only)

## 1. Responsibilities

- **Proposal**: started explicitly from a SELECTED quote option (M06) with the insurer form template (questions keyed by canonical keys), prefilled from **confirmed** facts (M03 party, M06 quote), validated, saved/resumed, documents (opaque references), nominees, explicit declarations.
- **Frozen snapshot**: on confirmation the answers, declarations, documents, parties, form version and chosen option are frozen (canonical JSON + sha256); later edits require reopen and re-confirmation.
- **Submission saga**: separate states for submission, payment and issuance; API/FILE or ASSISTED route chosen by M08; **unknown** submissions are resolved by M08 reconciliation or operator resolution — never blind retries.
- **Pre-sale operations** (F17): medical/inspection/document/clarification requirements with owner and due date; pending, declined, withdrawn.
- **Payment status** (F19): insurer references only — the platform never holds premium or card/bank data; **paid-but-not-issued** queue.
- **Policy-sale register** (F20, CR-001): insurer-confirmed sale with commercials → `proposal.policy.issued` → M04 opportunity ISSUED, M07 PLATFORM_SALE held policy (through `IssuedPolicyReader`), M10 later.

Out of scope (ADR-M09-readiness-gaps #7, #10, #17–20): W17 template authoring, insurer switch with answer reuse, customer-only health section, binary document upload/storage (M13), snapshot PDF, gateway payment links, insurer handoff link builder, M04 stage moves other than ISSUED, scheduler wiring.

## 2. Module layout
```
apps/core/src/modules/proposal/
  domain/
    types.ts              ProposalLine, PartyRole, AnswerValue, statuses (shared vocabulary)
    form-template.ts      FormTemplate (Factory), Question, TemplateDeclaration, RequiredDocument
    answer-validation.ts  AnswerRule chain (Chain of Responsibility) → validateAnswer()
    proposal.ts           Proposal aggregate (State: PROPOSAL_TRANSITIONS table)
    snapshot.ts           FrozenSnapshot, canonicalJson(), snapshotHash()
    submission.ts         SubmissionAttempt (State incl. UNKNOWN)
    payment.ts            Payment (State) + insurer-reference guard
    policy-sale.ts        PolicySale (Factory; CR-001 commercials)
    requirements.ts       PreSaleRequirement
    events.ts             PROPOSAL_EVENTS + payload types
  application/
    ports.ts              repositories, link signer, tokens
    proposal-context.ts   shared collaborators (uow, clock, ids, logger, metrics, recorder) — copy advice/book pattern
    proposal.service.ts           start, get, answer, declaration, document, ready, reopen, withdraw
    prefill.service.ts            facts from M03 + M06 (Strategy per PrefillSource)
    confirmation.service.ts       link / OTP / assisted signature
    customer-portal.service.ts    public review, OTP, confirm
    submission.saga.ts            commit → gateway → apply (Command per step)
    canonical-proposal.mapper.ts  snapshot → M08 CanonicalProposal
    insurer-status.applier.ts     PolicyStatusResult → proposal transition (Strategy map per status)
    payment.service.ts
    issuance.service.ts           recordIssuance, decline
    requirements.service.ts
    proposal-desk.service.ts      queues
    reconciliation.job.ts         M08 event consumers + runOnce() sweeps
    policy-sale-issued-policy.reader.ts   M07 IssuedPolicyReader (Adapter)
  infrastructure/ in-memory-proposal.repositories.ts, pg-proposal.repositories.ts, hmac-proposal-link.signer.ts
  api/ schemas.ts, proposals.controller.ts, submissions.controller.ts, proposal-desk.controller.ts, public-proposals.controller.ts
  proposal.module.ts
apps/core/migrations/090_proposal.sql
apps/web/src/features/proposal/
```

## 3. Domain model

### 3.1 Shared vocabulary (`types.ts`)
```ts
export type ProposalLine = 'LIFE' | 'HEALTH' | 'GENERAL';
export type PartyRole = 'PROPOSER' | 'LIFE_ASSURED' | 'INSURED' | 'PAYER' | 'NOMINEE';
export type AnswerValue = string | number | boolean | string[];   // DATE = 'YYYY-MM-DD'; MONEY = integer paise
export type Sensitivity = 'P2' | 'P3';
export type ProposalStatus = 'DRAFT' | 'READY_FOR_CONFIRMATION' | 'CONFIRMED' | 'SUBMITTED' | 'UNDERWRITING'
  | 'REQUIREMENTS_PENDING' | 'ISSUED' | 'DECLINED' | 'WITHDRAWN';
export const TERMINAL_PROPOSAL_STATUSES: readonly ProposalStatus[] = ['ISSUED', 'DECLINED', 'WITHDRAWN'];
export type ConfirmationMethod = 'CUSTOMER_OTP' | 'CUSTOMER_LINK' | 'ASSISTED_SIGNATURE';
export type SubmissionStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'UNKNOWN' | 'REJECTED';
export type PaymentStatus = 'NOT_STARTED' | 'LINK_SENT' | 'PAID' | 'FAILED' | 'REFUNDED';
export type PaymentMethod = 'INSURER_LINK' | 'INSURER_PORTAL' | 'CHEQUE_TO_INSURER';
export type RequirementKind = 'MEDICAL' | 'INSPECTION' | 'DOCUMENT' | 'CLARIFICATION';
export type PrefillSource = 'party.displayName' | 'party.dob' | 'party.pan' | 'quote.sumAssured' | 'quote.policyTermYears' | 'quote.premiumPayingTermYears';
```

### 3.2 Form templates (`form-template.ts`, `answer-validation.ts`)
```ts
export type QuestionType = 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'CHOICE' | 'MULTI_CHOICE' | 'MONEY';
export interface Question {
  key: string;                 // canonical, e.g. 'life_assured.height_cm'
  label: string; type: QuestionType; required: boolean; sensitivity: Sensitivity;
  options?: string[];          // CHOICE / MULTI_CHOICE only (required there)
  min?: number; max?: number;  // NUMBER, MONEY: value bounds; TEXT: length bounds
  pattern?: string;            // TEXT only (anchored regex source)
  showIf?: { key: string; equals: string | number | boolean };   // key must be an earlier question
  prefillFrom?: PrefillSource;
  insurerFieldCode: string;    // W16 fill sheet, e.g. 'PROP_DOB'
  portalPage: number;          // W16 fill-sheet page (1-based)
}
export interface TemplateSection { key: string; title: string; questions: Question[] }
export interface TemplateDeclaration { key: string; text: string; version: number }
export interface RequiredDocument { kind: string; label: string }
export interface FormTemplateProps { id: string; insurerId: string; productVersionId: string; line: ProposalLine; version: number;
  sections: TemplateSection[]; declarations: TemplateDeclaration[]; requiredDocuments: RequiredDocument[] }
export class FormTemplate {
  static create(props: FormTemplateProps): FormTemplate   // ValidationError('invalid_template') on duplicate question keys, showIf to an unknown/later key, CHOICE without options
  get props(): Readonly<FormTemplateProps>
  question(key: string): Question | undefined
  questions(): Question[]                                  // template order
  isVisible(key: string, answers: Readonly<Record<string, AnswerValue>>): boolean   // showIf holds (recursively; hidden parent ⇒ hidden child)
}
export function validateAnswer(question: Question, value: unknown): AnswerValue   // ValidationError('invalid_answer', …, [{ path: question.key, code, message }])
```
`validateAnswer` runs a Chain of Responsibility of `AnswerRule { check(q, value): FieldError | undefined }`: type rule (TEXT non-empty string; NUMBER finite number; DATE real `YYYY-MM-DD`; BOOLEAN; CHOICE string in options; MULTI_CHOICE non-empty array of unique options; MONEY non-negative safe integer) → bounds rule → pattern rule. Field error codes: `wrong_type`, `below_min`, `above_max`, `pattern_mismatch`, `not_an_option`. Hidden questions (failed `showIf`) are neither required nor stored. P3 answers are encrypted at rest (kernel FieldCipher).

Templates are platform-scoped and read-only in v1; `090_proposal.sql` seeds two demo templates (LIFE term, HEALTH), resolved by `insurerId + productVersionId`, highest version.

### 3.3 Proposal (State)
```ts
export interface ProposalParty { partyId: string; role: PartyRole; sharePct?: number }
export interface Answer { key: string; value: AnswerValue; sensitivity: Sensitivity; source: 'ENTERED' | 'PREFILLED'; prefillConfirmed: boolean; answeredAt: Date }
export interface Declaration { key: string; text: string; version: number; accepted: boolean; acceptedAt?: Date }
export interface ProposalDocument { kind: string; documentRef: string; attachedAt: Date }
export interface Confirmation { method: ConfirmationMethod; evidenceRef?: string; at: Date }
export interface QuoteRef { quoteOptionId: string; quoteRequestId: string; opportunityId: string; productVersionId: string; insurerId: string; line: ProposalLine }
export interface ProposalProps extends QuoteRef {
  id: string; templateId: string; templateVersion: number; parties: ProposalParty[]; answers: Record<string, Answer>;
  declarations: Declaration[]; documents: ProposalDocument[]; status: ProposalStatus; ownerMemberId: string;
  snapshot?: FrozenSnapshot; confirmation?: Confirmation; createdAt: Date; updatedAt: Date; version: number }

export class Proposal {
  static start(input: { id: string; quote: QuoteRef; template: FormTemplate; parties: ProposalParty[]; ownerMemberId: string; now: Date }): Proposal
  static restore(props: ProposalProps, template: FormTemplate): Proposal
  get props(): Readonly<ProposalProps>
  answer(key: string, value: unknown, now: Date): void
  confirmPrefilled(keys: string[], now: Date): void
  prefill(facts: Partial<Record<PrefillSource, unknown>>, now: Date): string[]
  acceptDeclaration(key: string, accepted: boolean, now: Date): void
  attachDocument(kind: string, documentRef: string, now: Date): void
  completeness(): { complete: boolean; missing: string[] }
  markReady(now: Date): void
  confirm(by: { method: ConfirmationMethod; evidenceRef?: string }, now: Date): FrozenSnapshot
  reopen(now: Date): void
  markSubmitted(now: Date): void
  applyInsurerStatus(status: 'UNDERWRITING' | 'REQUIREMENTS_PENDING' | 'DECLINED', now: Date): void
  markIssued(now: Date): void
  withdraw(now: Date): void
}
```
Rules:
- `start`: parties must satisfy the line rules, else `ValidationError('invalid_parties')` with field errors — exactly one PROPOSER; LIFE: ≥ 1 LIFE_ASSURED; HEALTH: ≥ 1 INSURED; GENERAL: ≥ 1 INSURED and no NOMINEE; `sharePct` (integer 1–100) required on NOMINEE and forbidden on other roles; if any NOMINEE, shares sum to 100 (`ValidationError('nominee_shares')`). Template line must equal quote line. Declarations copied from the template with `accepted: false`. Status DRAFT, version 1.
- `answer`: DRAFT only (`BusinessRuleError('proposal_not_editable')`); unknown key → `ValidationError('unknown_question')`; hidden key → `ValidationError('question_hidden')`; value through `validateAnswer`; stored with `source: 'ENTERED'`, `prefillConfirmed: true`. After each answer, answers to questions that are now hidden are removed.
- `prefill`: DRAFT only; fills only **empty visible** questions whose `prefillFrom` is present in `facts` and passes `validateAnswer` (invalid facts are skipped silently, never thrown); stored `source: 'PREFILLED'`, `prefillConfirmed: false`; returns the filled keys.
- `confirmPrefilled`: DRAFT only; sets `prefillConfirmed: true` on the listed PREFILLED answers; unknown or unanswered keys → `ValidationError('unknown_answer')`.
- `acceptDeclaration` / `attachDocument`: DRAFT only; unknown declaration key → `ValidationError('unknown_declaration')`; acceptance records `acceptedAt`; a document of an existing kind replaces it.
- `completeness`: `missing` lists, in template order, `answer:<key>` (visible required unanswered), `prefill:<key>` (unconfirmed prefilled), `declaration:<key>` (not accepted), `document:<kind>` (required kind absent).
- `markReady`: DRAFT → READY_FOR_CONFIRMATION; incomplete → `BusinessRuleError('proposal_incomplete', …, { missing })`.
- `confirm`: READY_FOR_CONFIRMATION → CONFIRMED; ASSISTED_SIGNATURE needs `evidenceRef` (`ValidationError('evidence_required')`); builds the FrozenSnapshot (3.4) and stores it with the confirmation.
- `reopen`: READY_FOR_CONFIRMATION or CONFIRMED → DRAFT; discards snapshot and confirmation.
- `markSubmitted`: CONFIRMED → SUBMITTED; no-op when already SUBMITTED.
- Transitions are one table, `PROPOSAL_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]>`; anything else → `BusinessRuleError('illegal_proposal_transition', …, { from, to })`:

| From | To |
|---|---|
| DRAFT | READY_FOR_CONFIRMATION, WITHDRAWN |
| READY_FOR_CONFIRMATION | CONFIRMED, DRAFT, WITHDRAWN |
| CONFIRMED | SUBMITTED, DRAFT, WITHDRAWN |
| SUBMITTED | UNDERWRITING, REQUIREMENTS_PENDING, ISSUED, DECLINED, WITHDRAWN |
| UNDERWRITING | REQUIREMENTS_PENDING, ISSUED, DECLINED, WITHDRAWN |
| REQUIREMENTS_PENDING | UNDERWRITING, ISSUED, DECLINED, WITHDRAWN |
| ISSUED, DECLINED, WITHDRAWN | — (terminal) |

`applyInsurerStatus` with the current status is a no-op (repeated insurer statuses are common).

### 3.4 Frozen snapshot (`snapshot.ts`)
```ts
export interface FrozenSnapshot {
  templateId: string; templateVersion: number; quoteOptionId: string;
  parties: ProposalParty[]; answers: Record<string, AnswerValue>;
  declarations: Array<{ key: string; version: number; acceptedAt: string }>;
  documents: Array<{ kind: string; documentRef: string }>;
  method: ConfirmationMethod; confirmedAt: string; hash: string;
}
export function canonicalJson(value: unknown): string   // object keys sorted recursively; arrays keep order; undefined members dropped
export function snapshotHash(content: Omit<FrozenSnapshot, 'hash'>): string   // sha256 hex of canonicalJson
```
The hash is stable across key order. Snapshot parties are sorted by role then partyId, documents by kind, declarations by key, so equal content gives equal hashes.

### 3.5 Submission attempt (`submission.ts`)
```ts
export interface SubmissionAttemptProps { id: string; proposalId: string; attemptNo: number; snapshotHash: string; idempotencyKey: string;
  status: SubmissionStatus; route?: RouteKind; insurerRef?: string; reconciliationId?: string; failureCode?: string; evidenceRef?: string;
  createdAt: Date; updatedAt: Date; version: number }
export class SubmissionAttempt {
  static begin(input: { id: string; proposalId: string; snapshotHash: string; attemptNo: number; now: Date }): SubmissionAttempt
  static restore(props: SubmissionAttemptProps): SubmissionAttempt
  apply(result: { route: RouteKind; outcome: CallOutcome<SubmissionResult>; reconciliationId?: string }, now: Date): void
  awaitAssisted(now: Date): void
  recordAssistedEvidence(insurerRef: string, evidenceRef: string, now: Date): void
  resolveUnknown(status: 'RECEIVED' | 'NOT_FOUND', insurerRef: string | undefined, now: Date): void
  resend(now: Date): void      // canResend() → SENT, same key; else BusinessRuleError('submission_not_resendable')
  isOpen(): boolean            // PENDING, SENT or UNKNOWN
  canResend(): boolean         // PENDING with a non-ASSISTED route or no route yet
}
```
- `begin`: status SENT (durable send intent, committed before M08 is called); key `${proposalId}:${snapshotHash}:${attemptNo}`; `attemptNo ≥ 1`.
- `apply` (SENT or PENDING only): success → ACKNOWLEDGED with `insurerRef`; failure retryable → PENDING (same key); failure non-retryable → REJECTED with `failureCode`; unknown `timeout`/`connection_reset` → UNKNOWN with `reconciliationId`; unknown `assisted` → `BusinessRuleError('assisted_not_applicable')` (use `awaitAssisted`).
- `awaitAssisted`: SENT → PENDING with route ASSISTED. `recordAssistedEvidence`: PENDING + ASSISTED only → ACKNOWLEDGED with insurerRef and evidenceRef (both non-empty). Assisted attempts never enter UNKNOWN.
- `resolveUnknown`: UNKNOWN only; RECEIVED → ACKNOWLEDGED (insurerRef required); NOT_FOUND → REJECTED with `failureCode: 'not_received'`.
- `resend`: re-send of the same attempt, allowed only when `canResend()`; sets SENT again with the same key.
- Saga rule (application): a new attempt (`attemptNo + 1`, new key) may begin only when the latest attempt is REJECTED; while the latest is SENT/UNKNOWN or PENDING ASSISTED → `ConflictError('submission_in_flight')`; ACKNOWLEDGED → `ConflictError('submission_acknowledged')`.

### 3.6 Payment (`payment.ts`)
```ts
export interface PaymentProps { proposalId: string; method?: PaymentMethod; insurerPaymentRef?: string; amountPaise: number;
  status: PaymentStatus; paidAt?: Date; at: Date; version: number }
export class Payment {
  static start(proposalId: string, amountPaise: number, now: Date): Payment          // NOT_STARTED
  record(input: { status: PaymentStatus; method: PaymentMethod; insurerPaymentRef?: string }, now: Date): void
  isPaidNotIssued(now: Date, issued: boolean): boolean   // PAID, not issued, paidAt ≤ now − 24 h
}
```
Transitions: NOT_STARTED → LINK_SENT | PAID | FAILED; LINK_SENT → PAID | FAILED; FAILED → LINK_SENT | PAID; PAID → REFUNDED; REFUNDED terminal; same status → no-op; else `BusinessRuleError('illegal_payment_transition')`. PAID requires `insurerPaymentRef`. `insurerPaymentRef`: 1–64 chars of `[A-Za-z0-9/_-]`; any run of 12–19 digits → `ValidationError('payment_ref_looks_like_card')`. No card or bank data is ever stored. `amountPaise` = quote gross.

### 3.7 Policy sale (`policy-sale.ts`, CR-001)
```ts
export interface PolicySaleProps { id: string; proposalId: string; opportunityId: string; policyNumberEnc: string; policyNumberHash: string; policyNumberLast4: string;
  commercials: PolicyCommercialsProps; sumAssuredPaise?: number; documentRef: string; deliveredAt?: Date; deliveryEvidenceRef?: string;
  sellerMemberId: string; confirmedBy: 'INSURER_API' | 'INSURER_DOCUMENT'; insurerId: string; insurerName: string; productVersionId: string; productName: string;
  mode: PremiumFrequency; proposerPartyId: string; insuredPartyIds: string[]; policyTermYears?: number; premiumPayingTermYears?: number;
  risk?: { schemaId: string; schemaVersion: number; details: Record<string, unknown> }; registrationNoLast4?: string; customFields: CustomFieldValues; createdAt: Date }
export class PolicySale { static record(props: PolicySaleProps): PolicySale; get props(): Readonly<PolicySaleProps> }   // commercials via PolicyCommercials.create (net + tax = gross); documentRef non-empty
```
Commercials (built by `IssuanceService`): `category` from the M05 product version, `line`, `businessType: 'FRESH'` (ADR #2), `bookedOn = commencementDate = issuedOn`, `expiryDate` as in §5 IssuanceService, `policyTermMonths = policyTermYears × 12` when known, net/tax/gross from `SelectedQuoteView.premium`, `businessSource = businessSourceForLeadSource(leadSource)` and `referredBy = { name, partyId: referrerPartyId }` from `OpportunityAttributionReader` (name from the referrer's `PartySummary.displayName`). The seller is never the referrer.

### 3.8 Requirements (`requirements.ts`)
```ts
export interface PreSaleRequirementProps { id: string; proposalId: string; kind: RequirementKind; description: string; ownerMemberId: string;
  dueOn: string /* IST date */; status: 'OPEN' | 'RESOLVED'; resolutionNote?: string; createdAt: Date; resolvedAt?: Date; version: number }
export class PreSaleRequirement {
  static add(input: Omit<PreSaleRequirementProps, 'status' | 'resolutionNote' | 'resolvedAt' | 'version'>): PreSaleRequirement   // description 1–500 chars, SensitiveContentGuard
  resolve(note: string, now: Date): void        // OPEN only → RESOLVED, else BusinessRuleError('requirement_closed')
  isOverdue(today: string): boolean             // OPEN and dueOn < today
}
```

### 3.9 Events (`events.ts`; ids, enums and paise only)
| Constant | Type | Payload |
|---|---|---|
| CREATED | `proposal.created` | `{ proposalId, opportunityId, quoteOptionId }` |
| READY | `proposal.ready` | `{ proposalId }` |
| CONFIRMED | `proposal.confirmed` | `{ proposalId, snapshotHash, method }` |
| SUBMITTED | `proposal.submitted` | `{ proposalId, attemptId, attemptNo }` |
| SUBMISSION_UNKNOWN | `proposal.submission_unknown` | `{ proposalId, attemptId, reconciliationId }` |
| SUBMISSION_REJECTED | `proposal.submission_rejected` | `{ proposalId, attemptId, failureCode }` |
| PAYMENT_RECORDED | `proposal.payment_recorded` | `{ proposalId, status }` |
| POLICY_ISSUED | `proposal.policy.issued` | `{ proposalId, opportunityId, policySaleId }` (M04 `PolicyIssuedEvent`, M07 `onPolicyIssued`) |
| DECLINED | `proposal.declined` | `{ proposalId }` |
| REQUIREMENT_ADDED | `proposal.requirement_added` | `{ proposalId, requirementId, kind }` |

## 4. Ports (`application/ports.ts`)
```ts
export interface FormTemplateRepository { get(tx, id: string): Promise<FormTemplate | undefined>; latestFor(tx, insurerId: string, productVersionId: string): Promise<FormTemplate | undefined> }
export interface ProposalRepository { get(tx, id: string): Promise<Proposal | undefined>; save(tx, p: Proposal): Promise<void> /* optimistic version; P3 answers + snapshot encrypted */;
  list(tx, filter: { scope: RecordScope; status?: ProposalStatus[]; cursor?: string; limit: number }): Promise<Page<Proposal>>;
  inStatus(tx, statuses: ProposalStatus[], updatedBefore: Date, limit: number): Promise<Proposal[]> }
export interface SubmissionRepository { get(tx, id: string): Promise<SubmissionAttempt | undefined>; save(tx, a: SubmissionAttempt): Promise<void> /* idempotency_key unique */;
  latestFor(tx, proposalId: string): Promise<SubmissionAttempt | undefined>; forProposal(tx, proposalId: string): Promise<SubmissionAttempt[]>;
  byReconciliationId(tx, reconciliationId: string): Promise<SubmissionAttempt | undefined>; byIdempotencyKey(tx, key: string): Promise<SubmissionAttempt | undefined>;
  list(tx, filter: { status?: SubmissionStatus; route?: RouteKind; limit: number }): Promise<SubmissionAttempt[]> }
export interface PaymentRepository { get(tx, proposalId: string): Promise<Payment | undefined>; save(tx, p: Payment): Promise<void>; paidBefore(tx, at: Date, limit: number): Promise<Payment[]> }
export interface PolicySaleRepository { get(tx, id: string): Promise<PolicySale | undefined>; forProposal(tx, proposalId: string): Promise<PolicySale | undefined>; add(tx, s: PolicySale): Promise<void> /* ConflictError('policy_number_taken') */ }
export interface RequirementRepository { get(tx, id: string): Promise<PreSaleRequirement | undefined>; save(tx, r: PreSaleRequirement): Promise<void>;
  forProposal(tx, proposalId: string): Promise<PreSaleRequirement[]>; open(tx, filter: { limit: number }): Promise<PreSaleRequirement[]> }
export interface ConfirmationChallengeRepository { current(tx, proposalId: string): Promise<OtpChallenge | undefined>; save(tx, c: OtpChallenge): Promise<void> }
export interface OtpChallenge { proposalId: string; codeHash: string; attempts: number; sends: number; firstSentAt: Date; expiresAt: Date; verifiedAt?: Date; channel: 'CUSTOMER_OTP' | 'CUSTOMER_LINK' }
export interface ProposalLinkSigner { sign(claims: { tenantId: string; proposalId: string; exp: Date }): string; verify(token: string, now: Date): { tenantId: string; proposalId: string } | undefined }
```
Tokens (Symbols next to the ports): `FORM_TEMPLATE_REPOSITORY`, `PROPOSAL_REPOSITORY`, `SUBMISSION_REPOSITORY`, `PAYMENT_REPOSITORY`, `POLICY_SALE_REPOSITORY`, `REQUIREMENT_REPOSITORY`, `CONFIRMATION_CHALLENGE_REPOSITORY`, `PROPOSAL_LINK_SIGNER`. In-memory and Postgres repositories share one contract suite per port.

From other modules: `SELECTED_QUOTE_READER` (M06 §4), `OPPORTUNITY_ATTRIBUTION_READER` (M04 §4), `OPPORTUNITY_LOOKUP` (M04, record scope), `PARTY_FACADE` + `SENSITIVE_PARTY_ACCESSOR` (M03 §5: `sensitive` purpose PROPOSAL for DOB/PAN prefill, `contactPhone` for the OTP), `FIELD_CIPHER` (kernel), catalogue lookup (M05: product name, category, insurer name), `INTEGRATION_GATEWAY`, `INTEGRATION_CALLBACK_READER`, `INTEGRATION_RECONCILIATION_READER` (M08 §4), `OTP_SENDER`/`OTP_GENERATOR` (M01), `RECORD_SCOPE_PROVIDER` (M02). Provided to M07: `ISSUED_POLICY_READER` → `PolicySaleIssuedPolicyReader`.

## 5. Application services
| Service | Behaviour |
|---|---|
| `ProposalService` | `start(principal, { quoteOptionId, parties })`: quote via `SelectedQuoteReader` (undefined → 422 `quote_not_selected`), opportunity in record scope via `OPPORTUNITY_LOOKUP` (else 404), template via `latestFor` (else 422 `template_unavailable`), every party exists (`PartyFacade.summary`, else 422 `unknown_party`), owner = principal's member; prefill (PrefillService); audit lists prefilled keys, never values; event `proposal.created`. `answer`, `confirmPrefilled`, `acceptDeclaration`, `attachDocument`, `markReady` (event `proposal.ready`), `reopen`, `withdraw(reason)` (audit only). Every mutation is optimistic (`If-Match`). |
| `PrefillService` | Strategy per `PrefillSource`: party facts from the PROPOSER (`summary.displayName`; `dob`/`pan` only through `SENSITIVE_PARTY_ACCESSOR.sensitive(principal, partyId, 'PROPOSAL')` and only when the principal has `party.sensitive.read`), quote facts from `SelectedQuoteView`. |
| `ConfirmationService` | READY_FOR_CONFIRMATION only. `CUSTOMER_LINK` → signed token (72 h), returns `{ url: '/p/<token>', expiresAt }`; `CUSTOMER_OTP` → 6-digit OTP to `contactPhone` (no phone → 422 `proposer_phone_missing`), 10 min expiry, 3 verify attempts (then 422 `otp_attempts_exceeded`), max 3 sends per hour (429 `otp_send_limit`), code stored as `FIELD_CIPHER.hash`; verify → `confirm(CUSTOMER_OTP)`; `ASSISTED_SIGNATURE` → `confirm` with `evidenceRef`. Event `proposal.confirmed`. |
| `CustomerPortalService` | Token verified (`ProposalLinkSigner`) and its tenant must equal the Host-resolved tenant, else 404 `link_invalid` (never says which). `review` returns plan, insurer, premium, parties' display names, P2 answers and declarations; P3 answers masked until an OTP verified within the last 10 min. `sendOtp` / `verifyOtp` as ConfirmationService (channel CUSTOMER_LINK). `confirm({ accept: true })` needs a verified OTP (422 `otp_required`) → `confirm(CUSTOMER_LINK)` → receipt `{ proposalId, snapshotHash, confirmedAt }`. |
| `SubmissionSaga` | `submit(principal, proposalId)`: **tx 1** — proposal CONFIRMED or SUBMITTED; attempt rule §3.5 (begin new or re-send `canResend`); `markSubmitted`; events `proposal.submitted`; commit. **Outside any tx** — `gateway.submitProposal(principal, CanonicalProposalMapper.map(snapshot, proposal), attempt.idempotencyKey)`; a thrown error leaves the attempt SENT→PENDING via tx 2 with `failureCode` and is rethrown. **tx 2** — DIRECT ASSISTED (`outcome.unknown.reason === 'assisted'`) → `awaitAssisted`; DIRECT API/FILE → `apply` (+ `markAcknowledged` effect: proposal SUBMITTED → UNDERWRITING via `InsurerStatusApplier('UNDERWRITING')`); RECONCILED → `NOT_FOUND` rejects, else `resolveUnknown('RECEIVED')` then `InsurerStatusApplier`. Events `proposal.submission_unknown`, `proposal.submission_rejected`. Metric `proposal_submissions_total{route,outcome}`. |
| `InsurerStatusApplier` | Strategy map over `PolicyStatusResult.status`: RECEIVED/UNDERWRITING → UNDERWRITING; REQUIREMENTS_PENDING → REQUIREMENTS_PENDING; DECLINED → `IssuanceService.decline`; ISSUED → `IssuanceService.recordIssuance(confirmedBy 'INSURER_API')`, but if `premium.amountPaise ≠ quote gross` a CLARIFICATION requirement "insurer_premium_mismatch" (owner = proposal owner, due today IST) is added instead; NOT_FOUND → not handled here. Statuses for terminal proposals are ignored with a warn log. |
| `PaymentService` | `record(principal, proposalId, { status, method, insurerPaymentRef? })`; proposal must be SUBMITTED or later and not WITHDRAWN; creates the Payment on first use with the quote gross; event `proposal.payment_recorded`. M08 callbacks never mark PAID. |
| `IssuanceService` | `recordIssuance(principal, proposalId, { policyNumber, issuedOn, premiumPaise, documentRef, confirmedBy, expiryDate?, sumAssuredPaise? })`: proposal SUBMITTED, UNDERWRITING or REQUIREMENTS_PENDING with an ACKNOWLEDGED attempt (else 422 `insurer_receipt_required`); `premiumPaise` must equal the quote gross (422 `premium_mismatch`); an existing sale for the proposal is returned unchanged (no second event); policy number encrypted + hashed (unique per tenant → 409 `policy_number_taken`); commercials §3.7; `expiryDate`: required in the body for HEALTH/GENERAL manual issuance (`ValidationError`), for LIFE absent; for INSURER_API issuance on HEALTH/GENERAL `expiryDate = addDays(addYears(issuedOn, 1), −1)` (IST dates); `markIssued`; event `proposal.policy.issued` once; histogram `proposal_time_to_issue_hours` (confirmedAt → now). `decline(principal, proposalId, reason)` → DECLINED, event `proposal.declined`. |
| `RequirementsService` | `add` (any non-terminal proposal; SUBMITTED/UNDERWRITING → REQUIREMENTS_PENDING; event `proposal.requirement_added`), `resolve` (last open requirement while REQUIREMENTS_PENDING → UNDERWRITING). |
| `ProposalDeskService` | queues: `unknown` (attempts UNKNOWN), `assisted` (attempts PENDING + ASSISTED), `paid_not_issued` (`Payment.isPaidNotIssued`, proposal not terminal), `requirements` (open requirements, overdue first); each item `{ proposalId, attemptId?, requirementId?, status, since, ownerMemberId }`. |
| `ReconciliationJob` | Subscribers: `integration.submission.reconciled` → attempt `byReconciliationId` (UNKNOWN only) → `INTEGRATION_RECONCILIATION_READER.get` → `resolveUnknown` + `InsurerStatusApplier`; `integration.callback.received` (`kind POLICY_STATUS`) → attempt `byIdempotencyKey` → `INTEGRATION_CALLBACK_READER.get` → `InsurerStatusApplier`. Reader returns undefined → CLARIFICATION requirement "insurer_status_unreadable" (manual review), never invented facts. No own UNKNOWN query scheduler. `runOnce(now)`: (a) proposals SUBMITTED/UNDERWRITING/REQUIREMENTS_PENDING with an ACKNOWLEDGED attempt not updated for 48 h → `gateway.getStatus` (key `${attemptId}:status:${istDate(now)}`) → applier; (b) gauges `proposal_unknown_open`, `proposal_paid_not_issued_open`. Scheduler wiring deferred. |
| `PolicySaleIssuedPolicyReader` | M07 `IssuedPolicyReader.read(tx, policySaleId)` → `{ insurerConfirmed: true, policySaleId, policyNumber (decrypted), policy: { line, insurerId, insurerName, productVersionId, productName, proposerPartyId, sumAssuredPaise, mode, commercials, policyTermYears, premiumPayingTermYears, servicingMemberId: sellerMemberId, risk, customFields, asOf: issuedOn } }`; undefined for an unknown id. |

## 6. API (`/api/v1`; ✱ = `@Idempotent()`)
| Method | Path | Permission | Request → response |
|---|---|---|---|
| POST ✱ | `/proposals` | `proposal.write` | `{ quoteOptionId, parties: [{ partyId, role, sharePct? }] }` → 201 proposal view incl. form (sections, questions, prefilled flags) |
| GET | `/proposals` | `proposal.read` | `?status=&cursor=&limit=` → page of summaries (tracker) |
| GET | `/proposals/{id}` | `proposal.read` | proposal view: answers (P3 masked `"••••"` unless `proposal.sensitive.read`), completeness, submission/payment/issuance states, requirements, `ETag` |
| PATCH | `/proposals/{id}/answers` (`If-Match`) | `proposal.write` | `{ answers?: { key: value }, confirmPrefilled?: string[] }` → proposal view |
| PUT | `/proposals/{id}/declarations/{key}` (`If-Match`) | `proposal.write` | `{ accepted: boolean }` |
| POST ✱ | `/proposals/{id}/documents` (`If-Match`) | `proposal.write` | `{ kind, documentRef }` |
| POST ✱ | `/proposals/{id}/ready` · `/reopen` (`If-Match`) | `proposal.write` | 422 `proposal_incomplete` `{ missing }` |
| POST ✱ | `/proposals/{id}/withdraw` | `proposal.write` before SUBMITTED, `proposal.ops` after | `{ reason }` |
| POST ✱ | `/proposals/{id}/confirmations` | `proposal.write` | `{ method: 'CUSTOMER_LINK' }` → `{ url, expiresAt }`; `{ method: 'CUSTOMER_OTP' }` → 202; `{ method: 'ASSISTED_SIGNATURE', evidenceRef }` → proposal view |
| POST ✱ | `/proposals/{id}/confirmations/otp` | `proposal.write` | `{ code }` → proposal view |
| POST ✱ | `/proposals/{id}/submissions` | `proposal.submit` | → 201 attempt `{ id, attemptNo, status, route?, insurerRef?, instructions? }`; UNKNOWN → 202 |
| POST ✱ | `/submissions/{id}/resolution` | `proposal.ops` | `{ status: 'RECEIVED' \| 'NOT_FOUND', insurerRef? }` |
| POST ✱ | `/submissions/{id}/assisted-evidence` | `proposal.ops` | `{ insurerRef, evidenceRef }` |
| POST ✱ | `/proposals/{id}/payments` | `proposal.write` | `{ status, method, insurerPaymentRef? }` |
| POST ✱ | `/proposals/{id}/issuance` | `proposal.ops` | `{ policyNumber, issuedOn, premiumPaise, documentRef, confirmedBy, expiryDate?, sumAssuredPaise? }` → 201 sale view (policy number masked to last 4) |
| POST ✱ | `/proposals/{id}/decline` | `proposal.ops` | `{ reason }` |
| POST ✱ | `/proposals/{id}/requirements` | `proposal.ops` | `{ kind, description, ownerMemberId, dueOn }` |
| POST ✱ | `/requirements/{id}/resolution` | `proposal.ops` | `{ note }` |
| GET | `/proposal-desk?queue=unknown\|paid_not_issued\|requirements\|assisted` | `proposal.ops` | W16 queue items |
| GET | `/proposals/{id}/fill-sheet` | `proposal.ops` | frozen snapshot by `portalPage`: `[{ page, fields: [{ no, label, insurerFieldCode, value }] }]` (ASSISTED attempts only; audited) |
| GET | `/public/proposals/{token}` | public (Host tenant + token) | customer review (P3 only after OTP) |
| POST | `/public/proposals/{token}/otp` | public | `{}` → 202 send; `{ code }` → 200 verified |
| POST | `/public/proposals/{token}/confirmation` | public | `{ accept: true }` → receipt `{ proposalId, snapshotHash, confirmedAt }` |

Reasons are 1–500 chars and pass `SensitiveContentGuard`. Responses `Cache-Control: no-store` on every route that returns answers.

Permissions (registered in `PERMISSION_REGISTRY`): `SALESPERSON, SOLO_OWNER → proposal.read, proposal.write, proposal.submit` (SOLO_OWNER also `proposal.ops`); `BRANCH_MANAGER, SALES_MANAGER → proposal.read, proposal.write`; `OPS, TENANT_ADMIN → proposal.*` incl. `proposal.ops`, `proposal.sensitive.read`; `PRINCIPAL_OFFICER, COMPLIANCE → proposal.read`.

## 7. DDL — `090_proposal.sql`
`form_template` (platform scope, no RLS, `unique(insurer_id, product_version_id, version)`, `body jsonb`; seeds two demo templates), `proposal` (tenant, status, owner_member_id, opportunity_id, quote_option_id, template_id/version, `snapshot_enc`, `snapshot_hash`, confirmation_method/evidence_ref/at, version), `proposal_party` (role check, share_pct check 1–100), `proposal_answer` (`value_enc` for P3, `value_json` for P2, source, prefill_confirmed), `proposal_declaration`, `proposal_document`, `submission_attempt` (`unique(tenant_id, idempotency_key)`, `unique(tenant_id, proposal_id, attempt_no)`, reconciliation_id index), `payment_record` (one row per proposal; no card/bank columns), `policy_sale` (`unique(tenant_id, policy_number_hash)`; commercials, risk, registration and custom-field columns as M07 §11.4 `held_policy` with `check(premium_net_paise + premium_tax_paise = premium_gross_paise)`), `presale_requirement`, `proposal_otp_challenge`. RLS on every tenant table (app role). `proposal_answer` INSERT/UPDATE/DELETE allowed only while the parent proposal is DRAFT (RLS policy or trigger).

## 8. Observability
Events §3.9 (ids/enums/paise only). Metrics `proposal_submissions_total{route,outcome}`, `proposal_unknown_open` (gauge; monitor > 2 h), `proposal_paid_not_issued_open` (gauge; monitor > 24 h), `proposal_time_to_issue_hours` (histogram). Logs and audits never contain answers, OTP codes, tokens, phone numbers or policy numbers (canary test). Audit: prefill (keys only), confirmation (method, hash), fill-sheet view, issuance (sale id), resolution, decline, withdraw.

## 9. Frontend (`apps/web/src/features/proposal`)
| Screen | Route | Content |
|---|---|---|
| `ProposalScreen` (M10) | `/m/proposals/:id`, `/crm/proposals/:id` | readiness meter (answered / prefilled to confirm / left) + "Next to finish"; accordion sections with "Prefilled" chips and "Confirm N prefilled" per section; save (PATCH); declarations; documents (kind + reference); confirmation options (send link, OTP with customer, assisted signature); submit; states for each proposal status |
| `IssuanceTrackerScreen` (M11) | `/m/proposals` | tabs "In progress" / "Issued this month"; cards with separate Submitted / Paid / Issuance chips; unknown banner "Sent — awaiting insurer confirmation"; paid-not-issued warning; requirements list; record payment |
| `ProposalDeskScreen` (W16) | `/crm/proposal-desk` | queue tabs (assisted, unknown, paid not issued, requirements); fill sheet by portal page with copy per field / page; record submission evidence (insurer ref + evidence ref); resolve unknown; record issuance; add/resolve requirement |
| Customer portal (C01) | `/p/:token` (public, prefix rule) | review (P3 after OTP), OTP, declaration accept, confirmation receipt |
The quote screen (M06) shows "Start proposal" on a SELECTED quote (party roles picker → POST `/proposals`). Nav entries: mobile "Proposals", CRM "Proposal desk" (permission `proposal.ops`).

## 10. Acceptance criteria
- **AC-M09-01** Template validation per question type, conditional questions, P3 answers encrypted; nominee shares sum to 100; role rules per line.
- **AC-M09-02** Prefill only fills empty answers from confirmed facts and flags them; completeness lists missing answers, unconfirmed prefills, declarations and documents.
- **AC-M09-03** Confirmation freezes a canonical snapshot (hash stable across key order); any later edit requires reopen and re-confirmation; OTP limits enforced.
- **AC-M09-04** Submission states: success → ACKNOWLEDGED, retryable failure keeps the same idempotency key, timeout → UNKNOWN with the M08 reconciliation id and no resubmission; NOT_FOUND allows a new attempt with a new key. Commit the snapshot/attempt before calling M08; test DIRECT and RECONCILED separately.
- **AC-M09-05** Assisted route creates an ops-desk item and records the insurer reference with evidence; it does not enter UNKNOWN or schedule status reconciliation.
- **AC-M09-06** Payment records hold only insurer references (no card/bank data); paid-not-issued after 24 h enters the queue; terminal proposals never do.
- **AC-M09-07** Issuance only with insurer confirmation; emits `proposal.policy.issued` once; M04 opportunity becomes ISSUED and M07 creates the held policy (cross-module test).
- **AC-M09-08** Consume M08 reconciliation/callback references to resolve UNKNOWN, without a duplicate query scheduler; an insurer ISSUED status records issuance only when the premium matches, else a manual-review requirement; retain the status sweep for proposals older than 48 h.
- **AC-M09-09** Customer portal: token-bound, tenant-bound, P3 shown only after OTP, confirmation receipt.
- **AC-M09-10** Record scope, tenant isolation; answers never logged (canary test).
- **AC-M09-11** Postgres: migration, RLS, answer immutability after confirmation, unique submission idempotency key. *(integration)*
- **AC-M09-12** Proposal, tracker, desk and portal screens as in §9.

## 11. CR-001 additions — policy sale commercials

Source: [CR-001](../change-requests/CR-001-sales-register-fields.md); kernel M00 §16.4. Built with M09; contract in §3.7.
- `PolicySale` has `commercials: PolicyCommercialsProps` (shared with M07 `HeldPolicy`), `risk?`, `registrationNoLast4?` and `customFields: CustomFieldValues` (entity `policy_sale`). The gross premium is `commercials.premiumGrossPaise`; the issue date is `commercials.bookedOn`.
- `proposal.policy.issued` payload is ids only; M07 copies commercials from the sale through `IssuedPolicyReader`; M10 later computes expected commission on `premiumNetPaise`.
- **AC-CR001-03** (M09 part) A recorded issuance stores net, tax and gross with net + tax = gross, the business source and referrer from the lead attribution, and the seller unchanged.
