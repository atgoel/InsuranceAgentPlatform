# M11 · Compliance & Audit — low-level design

Status: Ready for build · Depends on: M00 (audit log, outbox), M01–M03 · Requirements: Rev 3.0 F38 (privacy operations, rights-request intake, export controls), F39 (audit and disclosures), F40 (isolation — verified here by tests), F93 (advertisement approval register and publish gate), F97 (data ownership on exit: solo full export, consent-aware transfers, retention holds); regulatory notes [S06] DPDP, [S35] advertisements · HLD §11 (classification, DSR orchestration incl. Twenty and AI logs), §7 (Compliance publish gate called by Strapi before any publish) · Screens: W04 `ComplianceCentre`

## 1. Responsibilities
- **Advertisement approval register** (F93): approval reference per insurer and creative, scope (channels, products, regions), validity; **publish gate** that blocks publishing (M14 content, M12 campaigns, share cards) when a required approval is missing or expired; generic branding templates (no product claims) are exempt by classification.
- **Mandatory disclosures**: registration details (IRDAI registration number, entity type, tied insurers for IMF/agents) appended to every published page and share card — single provider used by M06 share pages, M12 messages and M14 content.
- **Audit query** (F39): search the kernel audit log by entity, actor (pseudonym), action and time for COMPLIANCE/PRINCIPAL_OFFICER; values are hashes only (kernel), so queries return who/what/when, not personal data.
- **Rights requests (DSR)** (F38, DPDP): intake (access, correction, erasure, grievance, nominate), identity verification, due-date tracking (30 days), orchestration across modules through a `DsrParticipant` port (M03 party erase/export, M04 CRM incl. Twenty projection, M07 book, M09 proposals respecting legal retention, M13 documents and AI logs), evidence pack, closure.
- **Retention holds & exit** (F97): legal/retention holds that block erasure; ISP exit uses M02 transfer rules (customers stay with the tenant); solo tenant full export (machine-readable bundle) on request.
- **Isolation assurance** (F40): a cross-module conformance test suite that every module registers into (tenant B can never read tenant A through any endpoint or job).

## 2. Module layout
```
apps/core/src/modules/compliance/
  domain/
    ad-approval.ts        AdApproval (ACTIVE → EXPIRED | REVOKED), ApprovalScope, CreativeClass ('GENERIC_BRAND' | 'PRODUCT' | 'CAMPAIGN')
    publish-gate.ts       PublishGate (Chain: ClassificationRule → ApprovalRequiredRule → ScopeRule → ExpiryRule → DisclosureRule)
    disclosure.ts         DisclosureProvider (entity registration + tied insurers text, language-aware EN/HI)
    dsr.ts                DsrCase (State: RECEIVED → VERIFIED → IN_PROGRESS → COMPLETED | REJECTED), DsrTask per participant
    retention.ts          RetentionHold, RetentionSchedule (per record class: proposal/sale 10 years after policy end, consent ledger life of relationship + 3 years — configurable data)
    events.ts
  application/ ports.ts (DsrParticipant, AuditQuery), ad-approval.service.ts, publish-gate.service.ts (facade for M12/M14), dsr.service.ts, export.service.ts, retention.service.ts, audit-query.service.ts
  infrastructure/ in-memory + pg repositories
  api/ schemas.ts, compliance.controller.ts, public-dsr.controller.ts
  compliance.module.ts
apps/core/migrations/110_compliance.sql
apps/web/src/features/compliance/
test/isolation/  (cross-module isolation conformance suite)
```

## 3. Domain model (selected)
```ts
export interface AdApprovalProps { id; insurerId; reference: string; creativeId: string; creativeHash: string /* sha256 of the approved content */; scope: { channels: Array<'MICROSITE' | 'WHATSAPP' | 'SOCIAL' | 'PRINT' | 'EMAIL'>; productVersionIds: string[]; regions?: string[] }; validFrom: string; validTo: string; status: 'ACTIVE' | 'EXPIRED' | 'REVOKED'; evidenceRef: string }
export interface PublishRequest { creativeId: string; creativeHash: string; creativeClass: CreativeClass; channel; productVersionIds: string[]; insurerIds: string[]; on: string; language: 'en' | 'hi' }
export type GateDecision = { allowed: true; disclosures: string[] } | { allowed: false; reason: 'approval_missing' | 'approval_expired' | 'out_of_scope' | 'content_changed_since_approval'; insurerId?: string }
export class PublishGate { decide(req: PublishRequest, approvals: AdApprovalProps[], disclosures: DisclosureProvider): GateDecision }
// GENERIC_BRAND → allowed with disclosures; PRODUCT/CAMPAIGN → for every insurer an ACTIVE approval covering channel + products on the date whose creativeHash equals the request's hash
export interface DsrParticipant { readonly name: string; locate(tx, subject: { partyIds: string[] }): Promise<{ records: number; holds: string[] }>; export(tx, subject): Promise<Record<string, unknown>>; erase(tx, subject, caseId: string): Promise<{ erased: number; retained: Array<{ reason: string; count: number }> }> }
```

## 4. Application services
| Service | Behaviour |
|---|---|
| `AdApprovalService` | register/revoke approvals (evidence document required), expiry job (ACTIVE → EXPIRED, event `compliance.ad_approval.expired`, M14 unpublishes affected content), list expiring in 30 days |
| `PublishGateService` (published facade `PUBLISH_GATE`) | `check(tx, request)` → decision + disclosures; every decision audited (`compliance.publish.allowed/blocked`); metric `compliance_publish_decisions_total{allowed,reason}` |
| `DsrService` | intake (staff or public form with OTP to the registered contact), verify, fan-out tasks to registered `DsrParticipant`s, collect results, respect `RetentionHold`s, evidence pack (JSON + summary PDF ref via M13), due-date SLA (30 days) with reminders; events `compliance.dsr.received/completed` |
| `ExportService` | solo tenant full export (all participants' export) → encrypted bundle in M13, link valid 24 h, audited; organisation exports need PRINCIPAL_OFFICER approval (maker-checker) |
| `RetentionService` | holds (case/legal) with reason and expiry; participants consult before erasing |
| `AuditQueryService` | filtered audit search (entity, action prefix, actor pseudonym, period, ≤ 1000 rows/page), CSV export (audited) |

## 5. API (`/api/v1`)
Ad approvals: `GET/POST ✱ /compliance/ad-approvals`, `POST ✱ /compliance/ad-approvals/{id}/revocation`; gate: `POST /compliance/publish-checks` (internal callers also use the facade); DSR: `GET/POST ✱ /compliance/dsr-cases`, `POST ✱ /compliance/dsr-cases/{id}/verification|execution|closure`, public `POST ✱ /public/dsr-requests` + `/public/dsr-requests/{id}/otp`; holds: `GET/POST ✱ /compliance/retention-holds`, `DELETE /compliance/retention-holds/{id}`; audit: `GET /compliance/audit-events?entityType=&entityId=&action=&from=&to=`; exports: `POST ✱ /compliance/exports` + `/approval`.
Permissions: `COMPLIANCE → compliance.*`; `PRINCIPAL_OFFICER → compliance.read, compliance.export.approve`; `TENANT_ADMIN → compliance.read, compliance.ad_approval.write`; `CMS_PUBLISHER → compliance.publish_check`; `SOLO_OWNER → compliance.* within own tenant`.

## 6. DDL — `110_compliance.sql`
`ad_approval` (creative_hash, scope jsonb, validity), `publish_decision` (append-only), `dsr_case`, `dsr_task`, `retention_hold`, `export_request`; RLS on all; `publish_decision` INSERT/SELECT only.

## 7. Observability
Events above; metrics `compliance_publish_decisions_total{allowed,reason}`, `compliance_dsr_open` (gauge) and `compliance_dsr_overdue` (monitor); security log on public DSR OTP failures; audit for every compliance action.

## 8. Frontend — W04 `ComplianceCentreScreen`
Tabs: Ad approvals (register with evidence, expiring soon, revoke), Publish decisions (blocked items with reason and fix link), Rights requests (queue with due dates, participant task status, evidence pack), Retention holds, Audit search (filters, results, CSV export).

## 9. Acceptance criteria
- **AC-M11-01** Publish gate: generic branding allowed with disclosures; product/campaign creatives need an active, in-scope approval per insurer whose hash matches; expired/revoked/changed-content blocked with the reason.
- **AC-M11-02** Disclosures include registration number, entity type and tied insurers (IMF/agent) in EN and HI.
- **AC-M11-03** Approval expiry job transitions and emits an event; affected content is reported.
- **AC-M11-04** DSR lifecycle, OTP-verified public intake, participant fan-out, retention holds honoured (retained counts reported), 30-day due date and overdue monitor.
- **AC-M11-05** Erasure through participants: M03 party erased, CRM leads anonymised and Twenty projection removed (M04b), AI logs purged (M13); a second run is a no-op.
- **AC-M11-06** Solo full export bundles every participant's data, encrypted, link expires in 24 h; organisation export requires Principal Officer approval.
- **AC-M11-07** Audit search returns actions without personal values; export audited.
- **AC-M11-08** Isolation conformance suite: for every registered endpoint family, tenant B cannot read or mutate tenant A's records (404), including jobs and exports.
- **AC-M11-09** Postgres: append-only publish decisions; RLS. *(integration)*
- **AC-M11-10** Compliance centre screen tabs as in §8.
