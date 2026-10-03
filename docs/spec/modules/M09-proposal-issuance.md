# M09 · Proposal & Issuance — low-level design

Status: Ready for build · Depends on: M03, M05, M06, M08 · Requirements: Rev 3.0 F16, F17, F18, F19, F20, F24 (customer portal lite: save/resume, upload, confirmation, handoff); §6 data model ("Proposal and proposal party", "Submission, payment, policy sale"); launch acceptance "ISP completes … proposal, and obtains insurer-confirmed issuance" · HLD §2 ("Insurer confirms the sale … a timeout is unknown until reconciled"), §7, §12 (unknown is a state; reconciliation jobs; paid-not-issued queue), §16 monitors · Screens: M10 `Proposal`, M11 `IssuanceTracker`, W16 `ProposalDesk`, customer portal pages

## 1. Responsibilities

- **Proposal**: built from the selected quote option (M06) with insurer form template (questions keyed by canonical question keys), prefilled from **confirmed** facts (M03 party, M06 requirements), validated, saved/resumed, documents, nominee capture, explicit declarations.
- **Frozen snapshot**: on customer confirmation the answers, declarations, form version, chosen option and disclosure are frozen (hashed); later edits require a new version and re-confirmation.
- **Submission saga**: separate states for submission, payment and issuance; API or assisted route via M08; **unknown** submissions resolved by status query or operator reconciliation — never blind retries.
- **Pre-sale operations** (F17): missing documents, medical/inspection requests, insurer follow-ups, pending/rejected, ownership.
- **Payment status** (F19): insurer-approved payment links/references only — the platform never holds premium; **paid-but-not-issued** queue.
- **Policy-sale register** (F20): insurer-confirmed policy with documents and delivery evidence → events that create the held policy (M07) and mark the opportunity ISSUED (M04).

## 2. Module layout
```
apps/core/src/modules/proposal/
  domain/
    form-template.ts      FormTemplate (versioned questions, sections, conditions), Question, AnswerValidator (Chain per type)
    proposal.ts           Proposal aggregate (State), ProposalParty roles, Declaration, Nominee
    snapshot.ts           FrozenSnapshot (canonical JSON + sha256)
    submission.ts         SubmissionAttempt (State incl. UNKNOWN), PaymentRecord, PolicySale
    requirements.ts       PreSaleRequirement (MEDICAL, INSPECTION, DOCUMENT, CLARIFICATION) with owner/due
    events.ts
  application/
    ports.ts, proposal-context.ts
    proposal.service.ts, confirmation.service.ts (customer link + OTP), submission.saga.ts, payment.service.ts,
    issuance.service.ts, reconciliation.job.ts, requirements.service.ts
  infrastructure/ in-memory + pg repositories, otp sender reuse (M01 stub)
  api/ schemas.ts, proposals.controller.ts, proposal-desk.controller.ts, customer-portal.controller.ts
  proposal.module.ts
apps/core/migrations/090_proposal.sql
apps/web/src/features/proposal/
```

## 3. Domain model

### 3.1 Form templates
`FormTemplate { id, insurerId, productVersionId, version, sections: Array<{ key, title, questions: Question[] }> }`; `Question { key (canonical, e.g. 'life_assured.height_cm'), type: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'CHOICE' | 'MULTI_CHOICE' | 'MONEY', required, options?, min?, max?, pattern?, showIf?: { key, equals }, sensitivity: 'P2' | 'P3', prefillFrom?: 'party.displayName' | 'party.dob' | 'party.pan' | 'quote.sumAssured' | … }`. Validation chain per type; hidden questions (failed `showIf`) are neither required nor stored. P3 answers (health, financial, identity) are encrypted at rest (M03 FieldCipher).

### 3.2 Proposal (State)
States: `DRAFT → READY_FOR_CONFIRMATION → CONFIRMED → SUBMITTED → (UNDERWRITING | REQUIREMENTS_PENDING) → ISSUED | DECLINED | WITHDRAWN`; `UNKNOWN` is a submission sub-state (3.3).
```ts
export class Proposal {
  static start(input: { id; quoteOptionId; productVersionId; insurerId; template: FormTemplate; parties: Array<{ partyId; role: 'PROPOSER' | 'LIFE_ASSURED' | 'INSURED' | 'PAYER' | 'NOMINEE' }>; ownerMemberId; now }): Proposal
  // exactly one PROPOSER; LIFE: ≥ 1 LIFE_ASSURED; HEALTH: ≥ 1 INSURED; nominees' shares sum to 100 (ValidationError('nominee_shares'))
  answer(key: string, value: unknown, now: Date): void        // DRAFT only; template validation
  prefill(facts: Record<string, unknown>): string[]            // returns keys prefilled; only into empty answers; marks them 'prefilled' (customer must review)
  attachDocument(kind: string, documentRef: string): void
  completeness(): { complete: boolean; missing: string[] }     // required answers, declarations, required documents
  markReady(now): void                                         // needs completeness → else BusinessRuleError('proposal_incomplete', { missing })
  confirm(by: { method: 'CUSTOMER_OTP' | 'CUSTOMER_LINK' | 'ASSISTED_SIGNATURE'; evidenceRef?: string }, now): FrozenSnapshot   // READY → CONFIRMED; declarations must all be accepted
  reopen(now): void                                            // CONFIRMED (not submitted) → DRAFT; discards the snapshot (new confirmation needed)
}
```
Declarations: `{ key, text, version, accepted: boolean, acceptedAt? }` — every declaration of the template must be accepted before confirmation.

### 3.3 Submission, payment, issuance (separate states)
```ts
export type SubmissionStatus = 'PENDING' | 'SENT' | 'ACKNOWLEDGED' | 'UNKNOWN' | 'REJECTED';
export class SubmissionAttempt {   // one per send; idempotencyKey = `${proposalId}:${snapshotHash}:${attemptNo}` reused on retries of the same attempt
  static begin(proposal, route: 'API' | 'FILE' | 'ASSISTED', now): SubmissionAttempt
  apply(outcome: CallOutcome<SubmissionResult>, now): void   // success → ACKNOWLEDGED (insurerRef); retryable failure → PENDING; non-retryable → REJECTED; unknown → UNKNOWN
  resolveUnknown(status: 'RECEIVED' | 'NOT_FOUND', insurerRef?: string, now): void   // RECEIVED → ACKNOWLEDGED; NOT_FOUND → REJECTED('not_received') — a NEW attempt may then be begun
}
export type PaymentStatus = 'NOT_STARTED' | 'LINK_SENT' | 'PAID' | 'FAILED' | 'REFUNDED';
export interface PaymentRecord { proposalId; method: 'INSURER_LINK' | 'INSURER_PORTAL' | 'CHEQUE_TO_INSURER'; insurerPaymentRef?; amountPaise; status: PaymentStatus; at }   // no card/bank data, ever
export interface PolicySale { id; proposalId; opportunityId?; policyNumberEnc; policyNumberHash; issuedOn; premiumPaise; sumAssuredPaise?; documentRef; deliveredAt?; deliveryEvidenceRef?; sellerMemberId; confirmedBy: 'INSURER_API' | 'INSURER_DOCUMENT' }
```
`ISSUED` only through `IssuanceService.recordIssuance` with insurer confirmation (API status or the insurer's policy document reference) — never a free-text field.

## 4. Ports
Repositories for templates, proposals (answers encrypted), submissions, payments, sales, requirements; `INTEGRATION_GATEWAY` (M08), `PARTY_FACADE` (M03, incl. `sensitive` read via the protected accessor for prefill with purpose `PROPOSAL`), quote lookup (M06 selected option), `OTP_SENDER`/`OTP_GENERATOR` (M01 reuse) for customer confirmation.

## 5. Application services
| Service | Behaviour |
|---|---|
| `ProposalService` | start from `quote.option.selected` (subscriber, or explicit POST), prefill (audit lists prefilled keys, not values), answer, documents, completeness, ready, reopen; events `proposal.created`, `proposal.ready` |
| `ConfirmationService` | customer link (signed token, 72 h) or OTP (6 digits, 3 attempts, 10 min) or assisted signature evidence → `confirm` → snapshot hash stored; event `proposal.confirmed` `{ proposalId, snapshotHash, method }` |
| `SubmissionSaga` | route via M08 gateway; ASSISTED → task for ops desk "Submit on insurer portal" with snapshot PDF ref, operator records insurerRef; API → apply outcome; UNKNOWN → schedule status query (M08) and surface; events `proposal.submitted`, `proposal.submission_unknown`, `proposal.submission_rejected` |
| `PaymentService` | record insurer link/reference and status (from callback, status query or operator); `PAID` with no issuance after 24 h → paid-not-issued queue item; event `proposal.payment_recorded` |
| `IssuanceService` | `recordIssuance` (API status or insurer document) → PolicySale; events `proposal.policy.issued` `{ proposalId, opportunityId, policySaleId }` (M04 → opportunity ISSUED, M07 → held policy PLATFORM_SALE, M10 → expected commission), `proposal.declined` |
| `RequirementsService` | medical/inspection/document/clarification items with owner and due date; overdue → my-work items; event `proposal.requirement_added` |
| `ReconciliationJob` | every 15 min: UNKNOWN submissions → status query; nightly: proposals SENT/ACKNOWLEDGED > 48 h → status sweep; paid-not-issued > 24 h → ops queue (monitor) |

## 6. API (`/api/v1`; ✱ = `@Idempotent()`)
| Method | Path | Permission | Notes |
|---|---|---|---|
| POST ✱ | `/proposals` | `proposal.write` | `{ quoteOptionId, parties }` → 201 with form (sections, questions, prefilled flags) |
| GET | `/proposals/{id}` | `proposal.read` | answers (P3 masked unless `proposal.sensitive.read`), completeness, timeline, submission/payment/issuance states |
| PATCH | `/proposals/{id}/answers` (`If-Match`) | `proposal.write` | `{ answers: { key: value } }` → completeness |
| POST ✱ | `/proposals/{id}/documents` · PUT `/declarations/{key}` | `proposal.write` | |
| POST ✱ | `/proposals/{id}/ready` · `/reopen` | `proposal.write` | 422 `proposal_incomplete` `{ missing }` |
| POST ✱ | `/proposals/{id}/confirmations` | `proposal.write` | `{ method: 'CUSTOMER_LINK' }` → link; `{ method: 'CUSTOMER_OTP' }` → OTP sent; `{ method: 'ASSISTED_SIGNATURE', evidenceRef }` |
| POST ✱ | `/proposals/{id}/confirmations/otp` | `proposal.write` | `{ code }` |
| POST ✱ | `/proposals/{id}/submissions` | `proposal.submit` | → attempt with route and state |
| POST ✱ | `/submissions/{id}/resolution` | `proposal.ops` | operator resolves UNKNOWN `{ status, insurerRef? }` |
| POST ✱ | `/proposals/{id}/payments` | `proposal.write` | record link/reference/status |
| POST ✱ | `/proposals/{id}/issuance` | `proposal.ops` | `{ policyNumber, issuedOn, premiumPaise, documentRef, confirmedBy }` |
| GET | `/proposal-desk?queue=unknown|paid_not_issued|requirements|assisted` | `proposal.ops` | W16 queues |
| GET/POST | `/public/proposals/{token}` · `/public/proposals/{token}/confirmation` | public (host tenant, token) | customer portal: review answers (P3 shown to the customer only after OTP), upload, confirm |

Permissions: sellers → `proposal.read, proposal.write, proposal.submit`; `OPS → proposal.*` incl. `proposal.ops`, `proposal.sensitive.read`; managers → read + write; `COMPLIANCE → proposal.read`.

## 7. DDL — `090_proposal.sql`
`form_template` (platform scope), `proposal` (state, owner, snapshot_hash), `proposal_party`, `proposal_answer` (value_enc for P3, value_json for P2), `proposal_declaration`, `proposal_document`, `submission_attempt` (unique idempotency_key), `payment_record`, `policy_sale` (policy_number_hash unique per tenant), `presale_requirement`; RLS on tenant tables; `proposal_answer` UPDATE allowed only while proposal is DRAFT (policy).

## 8. Observability
Events above (ids/enums/paise only); metrics `proposal_submissions_total{route,outcome}`, `proposal_unknown_open` (gauge; monitor > 2 h), `proposal_paid_not_issued_open` (gauge; monitor > 24 h), `proposal_time_to_issue_hours` histogram; logs never contain answers.

## 9. Frontend (apps/web/src/features/proposal)
`ProposalScreen` (M10: sectioned form, prefilled badges, save/resume, documents, declarations, completeness meter, confirmation options), `IssuanceTrackerScreen` (M11: separate submission/payment/issuance lanes, unknown banner "Sent — awaiting insurer confirmation", requirements list), `ProposalDeskScreen` (W16: ops queues, resolve unknown, record issuance), customer portal pages (review, OTP, upload, confirmation receipt).

## 10. Acceptance criteria
- **AC-M09-01** Template validation per question type, conditional questions, P3 answers encrypted; nominee shares sum to 100; role rules per line.
- **AC-M09-02** Prefill only fills empty answers from confirmed facts and flags them; completeness lists missing answers, declarations and documents.
- **AC-M09-03** Confirmation freezes a canonical snapshot (hash stable across key order); any later edit requires reopen and re-confirmation; OTP limits enforced.
- **AC-M09-04** Submission states: success → ACKNOWLEDGED, retryable failure keeps the same idempotency key, timeout → UNKNOWN with a status query scheduled and no resubmission; NOT_FOUND allows a new attempt.
- **AC-M09-05** Assisted route creates an ops task and records the insurer reference with evidence.
- **AC-M09-06** Payment records hold only insurer references (no card/bank data); paid-not-issued after 24 h enters the queue.
- **AC-M09-07** Issuance only with insurer confirmation; emits `proposal.policy.issued` once; M04 opportunity becomes ISSUED and M07 creates the held policy (cross-module test).
- **AC-M09-08** Reconciliation job resolves UNKNOWN via status and sweeps proposals older than 48 h.
- **AC-M09-09** Customer portal: token-bound, tenant-bound, P3 shown only after OTP, confirmation receipt.
- **AC-M09-10** Record scope, tenant isolation; answers never logged (canary test).
- **AC-M09-11** Postgres: migration, RLS, answer immutability after confirmation, unique submission idempotency key. *(integration)*
- **AC-M09-12** Proposal, tracker, desk and portal screens as in §9.

## 11. CR-001 additions — policy sale commercials

Source: [CR-001](../change-requests/CR-001-sales-register-fields.md); kernel M00 §16.4. Built with M09.
- `PolicySale` gains `commercials: PolicyCommercialsProps` (shared with M07 `HeldPolicy`), `risk?: { schemaId; schemaVersion; details }`, `registrationNoLast4?` and `customFields: CustomFieldValues` (entity `policy_sale`). `premiumPaise` becomes `commercials.premiumGrossPaise`; `issuedOn` = `commercials.bookedOn`.
- `IssuanceService.recordIssuance` builds the commercials from the selected quote option (net, tax, gross from M06; category from M05; business type FRESH unless the quote marks renewal/portability) and the opportunity attribution (M04 §11.2: `businessSource = businessSourceForLeadSource(source)`, `referredBy.partyId = referrerPartyId`); seller = `sellerMemberId`, never the referrer.
- `proposal.policy.issued` payload is unchanged (ids only); M07 copies commercials from the sale when creating the PLATFORM_SALE held policy; M10 computes expected commission on `premiumNetPaise`.
- DDL `policy_sale`: the same commercials, risk, registration and custom-field columns as M07 §11.4 `held_policy`, with the net + tax = gross check.
- **AC-CR001-03** (M09 part) A recorded issuance stores net, tax and gross with net + tax = gross, the business source and referrer from the lead attribution, and the seller unchanged.
