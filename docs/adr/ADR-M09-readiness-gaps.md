# M09 readiness gaps

Status: Accepted (decisions 1–31).

Approval: on 2026-10-06 the user selected "Approve all 23" for decisions 1–23 in this session, and separately chose the recommended option for decisions 15 (auto-issue only when gross matches), 17 (record only) and 18 (seeded, read-only templates). Decisions 24–31 were added while completing the LLD; the user selected "Approve 24–31" in the same session. No other decisions are approved by this ADR.

## Context

The readiness gate for M09 (LLD `docs/spec/modules/M09-proposal-issuance.md`) checked every port, route, field and screen the LLD needs against the code of M01–M08 and the wireframes (`design/screen-inventory.md` M10, M11, W16, C01). The gaps below are either missing contracts in other modules, contradictions between documents, or details the LLD leaves open. Each has a recommended decision. Code facts are quoted with file and line.

## Decisions

### A. Cross-module contracts (changes outside M09)

1. **Selected quote reader (M06).** M06 exports no read port for quotes (`advice.module.ts:68` exports services only; `QUOTE_REPOSITORY` is internal). `quote.option.selected` carries only `{ quoteRequestId, optionId, versionId, totalPaise }` (`advice/domain/events.ts:15`). Add an exported port `SELECTED_QUOTE_READER` → `SelectedQuoteReader.selected(tx, optionId): Promise<SelectedQuoteView | undefined>` returning `{ quoteRequestId, opportunityId, partyId, line, insuredPartyIds, insurerId, productVersionId, sumAssuredPaise, policyTermYears?, premiumPayingTermYears?, premium: { netPaise, taxPaise, grossPaise, frequency } }`, only for a SELECTED quote whose selected option is `optionId`. Net = `basePaise + ridersPaise`, tax = `taxPaise`, gross = `totalPaise` (`advice/domain/quote.ts:9`).
2. **Business type (CR-001 §11).** The quote has no renewal/portability flag. `businessType` is always `FRESH` for M09 sales until M06 adds a flag.
3. **Attribution (M04).** `referrerPartyId` lives on the lead only (`crm/domain/lead.ts:53`); the opportunity has `leadId?` (`crm/domain/opportunity.ts:11`). Add an exported M04 port `OPPORTUNITY_ATTRIBUTION_READER` → `attribution(tx, opportunityId): Promise<{ leadSource?: string; referrerPartyId?: string } | undefined>` (reads opportunity → lead). M09 maps it with `businessSourceForLeadSource` (`kernel/insurance/policy-commercials.ts:35`). No lead → `businessSource` absent.
4. **Sensitive prefill (M03).** `SensitivePartyAccessor` (`party/application/sensitive-party.accessor.ts:25`, purpose `PROPOSAL`) is not exported (`party.module.ts:147`). Export it under a token `SENSITIVE_PARTY_ACCESSOR`. Prefill of DOB/PAN then runs only for principals holding `party.sensitive.read`; others get those questions unfilled.
5. **OTP phone (M03).** `PartySummary` exposes only `primaryMobileMasked` (`party/application/ports.ts:136`). Add `SensitivePartyAccessor.contactPhone(principal, partyId, purpose: 'PROPOSAL')` returning the proposer's primary mobile (audited like `sensitive`). The customer portal OTP goes to the proposer's primary mobile only.
6. **Issued policy reader (M07).** M09 provides the real `IssuedPolicyReader` (`book/application/ports.ts:75`) as `PolicySaleIssuedPolicyReader` in the proposal module; `book.module.ts:84` binds it instead of `UnavailableIssuedPolicyReader` when the proposal module is loaded. Mapping: `mode` from quote frequency; `servicingMemberId = sellerMemberId`; `proposerPartyId` from the PROPOSER party; product/insurer names from the catalogue (M05) at issuance time and stored on the sale.
7. **Opportunity stage (M04).** M04 does not react to `proposal.confirmed`/`proposal.submitted`. Out of scope for M09: the opportunity moves only to `ISSUED` (existing subscriber, `crm.module.ts:251`). Moving to `PROPOSAL_COMPLETE`/`INSURER_PENDING` is a later M04 change.

### B. Contradictions between documents

8. **Event names.** Traceability (`docs/spec/05-requirements-traceability.md:78`) uses `proposal.submission.created`; M09 §5 uses `proposal.submitted`. Keep the M09 §5 names and correct the traceability row.
9. **Start trigger.** M09 §5 says "subscriber, or explicit POST". The selected event lacks parties and roles, so a subscriber cannot build a valid proposal (§3.2 role rules). Start only by explicit `POST /proposals`; drop the subscriber.
10. **Assisted ops task.** M09 §5 says "task for ops desk ... with snapshot PDF ref". There is no document renderer (M13). The W16 `assisted` queue lists PENDING ASSISTED attempts; the fill sheet renders from the frozen snapshot; no PDF and no M04 task.

### C. Details the LLD leaves open

11. **Prefilled answers need confirmation.** Wireframe M10 has "Confirm N prefilled" per section. `completeness()` lists unconfirmed prefilled keys as missing; `PATCH /proposals/{id}/answers` takes `{ answers?, confirmPrefilled?: string[] }`.
12. **Nominee shares.** `POST /proposals` parties become `Array<{ partyId; role; sharePct? }>`; `sharePct` (integer 1–100) is required on NOMINEE and forbidden on other roles.
13. **GENERAL line roles.** Exactly one PROPOSER; at least one INSURED; nominees not allowed.
14. **Proposal state on submission.** CONFIRMED → SUBMITTED when the first attempt is begun. A REJECTED attempt (non-retryable or NOT_FOUND) keeps SUBMITTED and allows a new attempt; an attempt is never begun while another is PENDING/SENT/UNKNOWN. ACKNOWLEDGED → proposal UNDERWRITING. Insurer statuses `UNDERWRITING`, `REQUIREMENTS_PENDING`, `DECLINED` (from reconciliation, callback or status sweep) move the proposal accordingly.
15. **Issuance from insurer status.** An `ISSUED` `PolicyStatusResult` (reconciliation, callback or sweep) records issuance automatically with `confirmedBy: 'INSURER_API'`, using its `policyNumber`, `issuedOn`, `documentRef`; commercials come from the quote (decision 1). If the insurer gross premium differs from the quote gross, issuance is not recorded; the proposal enters the `requirements` desk queue as a manual-review item.
16. **Operator transitions.** Add routes (permission `proposal.ops`): `POST /proposals/{id}/decline` `{ reason }`, `POST /proposals/{id}/withdraw` `{ reason }` (also `proposal.write` before submission), `POST /proposals/{id}/requirements` `{ kind, description, ownerMemberId, dueOn }`, `POST /requirements/{id}/resolution` `{ note }`, and `POST /submissions/{id}/assisted-evidence` `{ insurerRef, evidenceRef }` for the assisted route (AC-M09-05).
17. **Payments.** v1 records payment status by seller/ops only (`POST /proposals/{id}/payments`). The gateway `paymentLink` call is deferred. Paid-not-issued = status PAID, no PolicySale, `at` older than 24 h.
18. **Form templates.** Platform-scoped, read-only in v1: seeded by migration with two demo templates (one LIFE term, one HEALTH), resolved by `insurerId + productVersionId`, highest version. `Question` gains `insurerFieldCode` and `portalPage` (W16 fill sheet). W17 template authoring, insurer switch with answer reuse, and the customer-only health section stay out of scope.
19. **Documents.** `documentRef` is an opaque reference string. No binary upload/storage in M09 (M13). The customer portal has review, OTP and confirmation; upload is out of scope.
20. **Customer link.** Token = HMAC-signed `{ tenantId, proposalId, exp }` (72 h) with a server secret; tenant must also match the Host-resolved tenant. Web route `/p/:token` added to the public path rules by prefix. Insurer handoff link builder (traceability row 37) is out of scope.
21. **Permissions.** Register `proposal.read`, `proposal.write`, `proposal.submit`, `proposal.ops`, `proposal.sensitive.read`. SALESPERSON, SOLO_OWNER → read/write/submit; BRANCH_MANAGER, SALES_MANAGER → read/write; OPS, TENANT_ADMIN → `proposal.*`; PRINCIPAL_OFFICER, COMPLIANCE → read. SOLO_OWNER also gets `proposal.ops` (works alone).
22. **Jobs.** `ReconciliationJob` and the 48 h status sweep are `runOnce()` methods; scheduler wiring is deferred (HANDOVER backlog item 4).
23. **Web routes.** Proposal `/m/proposals/:id` and `/crm/proposals/:id`; tracker `/m/proposals`; desk `/crm/proposal-desk` (wireframe sidebar, CRM section); portal `/p/:token`. Quote screen gets a "Start proposal" action on a SELECTED quote.

### D. LLD completion details

24. **Transition table** (M09 §3.3): READY_FOR_CONFIRMATION and CONFIRMED may reopen to DRAFT; WITHDRAWN from any non-terminal state (`proposal.write` before SUBMITTED, `proposal.ops` after); adding a requirement moves SUBMITTED/UNDERWRITING → REQUIREMENTS_PENDING, resolving the last open one moves back to UNDERWRITING; repeated insurer statuses are no-ops.
25. **Attempt lifecycle** (§3.5): an attempt is begun as SENT (durable intent) and committed before M08 is called; a retryable failure → PENDING and the same attempt is re-sent with the same key; a new attempt only after REJECTED, else 409 `submission_in_flight` / `submission_acknowledged`; a thrown gateway error leaves the attempt PENDING.
26. **Payment** (§3.6): transition table; PAID requires an insurer reference; a reference with a run of 12–19 digits is rejected as card-like (`payment_ref_looks_like_card`); amount = quote gross; recording needs SUBMITTED or later.
27. **Expiry date** (§5 IssuanceService): manual issuance body gains `expiryDate`, required for HEALTH/GENERAL; API issuance on HEALTH/GENERAL sets expiry = issuedOn + 1 year − 1 day; LIFE has none. Needed for M07 renewal dates.
28. **OTP and link** (§5): at most 3 OTP sends per hour per proposal (429 `otp_send_limit`); P3 visible on the portal for 10 min after OTP; invalid/expired/cross-tenant token → 404 `link_invalid`.
29. **Extra routes** (§6): `GET /proposals` (tracker list), `GET /proposals/{id}/fill-sheet` (W16, audited, ASSISTED only), `POST /public/proposals/{token}/otp`; P3 mask `••••`.
30. **Manual review** (§5): an unreadable callback/reconciliation reference or an ISSUED status with a premium mismatch creates a CLARIFICATION requirement owned by the proposal owner, due today.
31. **Start checks** (§5): the opportunity must be in the principal's record scope; owner = the principal's member; every party must exist.

## Build plan

Batches of at most 3 disjoint tasks, one session each:
1. Domain layer (templates, proposal, snapshot, submission/payment/sale, requirements) · cross-module ports (decisions 1, 3, 4, 5).
2. Application services, in-memory repositories, controllers, component tests (AC-M09-01..10).
3. Migration `090_proposal.sql`, Postgres repositories, IssuedPolicyReader binding, cross-module and integration tests (AC-M09-07, 11, CR001-03).
4. Web: Proposal screen, tracker.
5. Web: desk, customer portal; review and quality report.

## Compliance note

Proposal answers include health data (sensitive personal data). Per `design/proposal-form-architecture.md` §7, review with the CISO and compliance team before the pilot.
