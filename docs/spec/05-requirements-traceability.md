# 05 · Requirements traceability

Sources, in precedence order when they disagree:

1. [HLD Rev 1.0](../hld/HLD-Rev1.0.md) (Strapi + Twenty edition, 3 Oct 2026) — architecture, system-of-record and tenancy decisions.
2. Design Revision 3.0 feature IDs F01–F100 as used in the [screen inventory](../../design/screen-inventory.md) and wireframes — screen behaviour.
3. [Product review Rev 2.0](../requirements/Product-Review-Rev2.0.md) (2 Oct 2026) — feature catalogue F01–F70, launch boundary, focused sales data model, launch acceptance and KPIs.

Where Rev 2.0 proposed a custom CRM + Payload, the HLD's Twenty + Strapi decision stands; Rev 2.0's bounded CRM scope is what Solo-CRM-lite and the CRM Port implement, so both routes satisfy the same acceptance scenarios.

## 1. Decisions taken from Rev 2.0

| Topic | Rev 2.0 requirement | Where it lands |
|---|---|---|
| Sales funnel | `new → contacted → qualified → quote shared → proposal complete → insurer pending → issued / lost`; payment success alone never moves a deal to issued | M04 opportunity stages: `DISCOVERY, QUOTE_SHARED, PROPOSAL_COMPLETE, INSURER_PENDING, ISSUED, LOST` (lead stages `NEW, CONTACTED, QUALIFIED, CONVERTED, LOST`); `ISSUED` only from an insurer-confirmation event (M09) |
| Roles | platform admin, tenant admin / principal officer, sales manager, salesperson, operations (pre-sale checks), finance reader, CMS author, CMS publisher, prospect/customer | M02 role catalogue: `platform.operator`, `TENANT_ADMIN`, `PRINCIPAL_OFFICER`, `MANAGER`, `AGENT` (salesperson incl. ISP/POSP/solo via salesperson type), `OPS`, `FINANCE`, `CMS_AUTHOR`, `CMS_PUBLISHER`, `COMPLIANCE`, `CUSTOMER` |
| Quote options | One opportunity → many quote options with coverage, premium components, exclusions, insurer quote id, expiry, comparison snapshot | M06 `quote` + `quote_option` |
| Proposal parties | proposer / insured (multiple, child records) / payer / nominee role links | M09 `proposal_party` |
| Submission attempts | Separate submission attempt, payment reference, issued-policy record | M09 `submission_attempt`, `payment_reference`, `policy_sale` |
| No cross-broker dedup | F40: deduplication never crosses tenants | M03 dedup matcher runs inside tenant scope only (AC in M03) |
| Shared phone ≠ same person | F07/data model | M03 dedup scores phone matches as *candidates*, never auto-merge on phone alone |
| Insurer handoff | No personal/medical data in URL query strings; show when moving to insurer site | M09 handoff links, lint/test rule on URL builders |
| Post-sale servicing | Out of launch: show insurer portal/contact links only | M07/M09 servicing links, no service-case engine |
| Money | Never binary floating point | Kernel `Money` (integer paise) |
| Content | CMS never owns customer profiles; campaign references immutable content version ids | M12 campaign ↔ M14 content version refs |

## 2. Feature → module map

| Features | Module |
|---|---|
| F01 tenant setup, F41/F95 white-label, F44/F94 SaaS admin & plans, F99 usage limits, F40 isolation | M01 (F41/F95 render in M14) |
| F02 staff login & roles, F32 onboarding, F33 team structure, F91/F92 hierarchy & routing capacity, F86 licences | M02 |
| F07 party roles, F08 import & dedup, F09 customer 360 (party side), F37 consent & preferences, F38 privacy ops (field access) | M03 |
| F03 lead intake, F05 allocation, F06 pipeline, F09 360 (activity side), F10 communication log, F79/F83/F84 Today | M04 |
| F13 catalogue, F67 product content governance, F77 research metadata, F78 comparison scope | M05 |
| F14 needs & comparison, F15 quote workspace, F75 BI ack, F76 calculators | M06 |
| F21 renewals, F71 book import, F72 due engine, F73 lapse/revival, F74 servicing tracker lite | M07 |
| F18 API route, F46 integration support, F57–F59 gated adapters | M08 |
| F16 proposal forms, F17 pre-sale ops, F19 payment status, F20 policy-sale register, F24 customer journey lite | M09 |
| F25 commission setup, F26 records, F30 finance export, F35 MIS, F85 income | M10 |
| F39 audit & disclosures, F45 data exit, F63/F93 content approval, F97 DSR | M11 |
| F10 messaging, F11 campaigns, F80 reminders, F88 send step | M12 |
| F49 extraction, F54 AI controls, F87–F90 skills | M13 |
| F61–F68 portal & CMS, F81/F82 card & greetings | M14 |
| F42 configuration (bounded) | M01 (flags), M04 (stages, custom fields) |
| F43 Sales PWA | web shell (M00) + every module's `/m/*` screens |
| F47 reporting | M10 (reports library) |

## 3. Launch acceptance (Rev 2.0 §14) → proving modules

| # | Launch acceptance | Proven by |
|---|---|---|
| LA-1 | A marketer publishes an approved branded campaign without a developer | M14 + M11 publish gate + M12 |
| LA-2 | Its lead is validated, deduplicated, attributed and assigned | M04 (with M03 dedup, M02 eligibility) |
| LA-3 | Staff complete quote/proposal and obtain insurer-confirmed issuance | M06 + M09 + M08 |
| LA-4 | Payment retries and callbacks do not duplicate transactions | M00 idempotency + M08 inbox + M09 |
| LA-5 | Policy delivery includes the correct insurer servicing route | M09 |
| LA-6 | Two tenants cannot access each other's records, files or CMS drafts | M00 RLS + isolation tests in every module + M14 |
| LA-7 | Export and restore work | M11 (F45 export); restore is an infra runbook |
| LA-8 | Required disclosures, suppression and audit evidence are present | M03 suppression, M05/M06 disclosures, M00/M11 audit |

## 4. KPIs (Rev 2.0) → metrics/reports

Leads by source, contact rate, quote-to-proposal rate, proposal-to-issued rate, time to issue, issued premium, commission expected/received. Each is a fixed report in M10 built from domain events (`crm.lead.created`, `crm.lead.stage_changed`, `quote.option.shared`, `proposal.submission.created`, `proposal.policy.issued`, `commission.*`), so every KPI is traceable to an event stream rather than to ad-hoc queries.
