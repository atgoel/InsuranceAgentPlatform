# 05 · Requirements traceability

Sources, in precedence order when they disagree:

1. [Requirements Rev 3.0](../requirements/Requirements-Rev3.0.md) (2 Oct 2026) — **primary requirements**: personas, Distributor Entity model, plans, feature catalogue F01–F100 with stages, regulatory control matrix, launch acceptance, KPIs.
2. [HLD Rev 1.0](../hld/HLD-Rev1.0.md) (3 Oct 2026) — **architecture**: Twenty + Strapi + Domain Core, systems of record, tenancy, resilience. Where Rev 3.0 §19 proposed a custom CRM + Payload, the later HLD decision (Twenty for organisation tenants, Solo-CRM-lite in Core for solo agents, Strapi CMS) stands. Both sit behind the CRM and Content ports, so the Rev 3.0 fit-test scenarios are satisfied on either route.
3. [Screen inventory](../../design/screen-inventory.md) and wireframes — screen behaviour and copy.
4. [Product review Rev 2.0](../requirements/Product-Review-Rev2.0.md) — superseded; used only where Rev 3.0 is silent (sales-funnel stage names, quote option and submission-attempt entities).

## 1. Requirements that shape the design

| Topic | Requirement (Rev 3.0 unless noted) | Where it lands |
|---|---|---|
| Distributor Entity | Entity type (IMF, broker, individual agent, later corporate agent), registration no. and validity, Principal Officer, tie-ups per insurer and line with dates and **configurable limits as data** (IMF ≤ 6 per line, agent 1 per line today, broker market-wide) | M01 `distributor_entity`, `tie_up`, `tie_up_limit` (data, per entity type and line) |
| Tenant types and plans | Organisation or solo tenant; plans Solo, Team, Business, White-label (Dedicated later); packaging by plan (§17 table) | M01 `plan` with feature set per capability group; entitlement checks in every module via `EntitlementChecker` |
| Solo agents | Individual agents are solo tenants, never IMF members; self-serve signup with mobile OTP and licence capture (F94) | M01 tenant kind `SOLO`; HLD: solo uses Solo-CRM-lite; M01 signup saga |
| Memberships | A person may have memberships in several tenants over time; each membership is a separate identity scope; no cross-tenant dedup | M02 `member` per tenant; kernel tenant guard (token carries one org); M03 dedup tenant-scoped |
| Roles | platform admin, white-label operator, tenant admin, Principal Officer, branch manager, sales manager, ISP, POSP, employee salesperson, solo agent (owner and seller), operations, finance reader, CMS author, CMS publisher, compliance reviewer, prospect/customer | M02 role catalogue: `platform.operator`, `WHITE_LABEL_OPERATOR`, `TENANT_ADMIN`, `PRINCIPAL_OFFICER`, `BRANCH_MANAGER`, `SALES_MANAGER`, `SALESPERSON` (+ salesperson type `ISP`/`POSP`/`EMPLOYEE`/`SOLO`), `SOLO_OWNER`, `OPS`, `FINANCE`, `CMS_AUTHOR`, `CMS_PUBLISHER`, `COMPLIANCE`, `CUSTOMER` |
| Comparison scope | Broker market-wide; IMF/agent only tied insurers; POSP only POSP-eligible products; disclosure of tied insurers on comparisons | M05 comparison scope engine (single implementation, HLD §7) |
| Held policies | Book not necessarily sold through the platform; source (import/AI/manual), as-of date, confidence; a sale creates a held policy | M07 `held_policy` |
| Premium dues | Mode, next due, grace end, due instances, outcome as observed — **never a premium ledger** | M07 due engine |
| Servicing lite | Request type, insurer reference, status, follow-up date, insurer link; no service-case engine | M07 `servicing_request` |
| Benefit illustration | Attach insurer-generated BI with version + customer acknowledgement; platform never generates its own | M06 |
| Advice record | Calculator inputs, assumptions version, outputs, recommended products, customer choice, suitability notes | M06 |
| Advertisement approval | Approval reference per insurer and creative, scope and expiry; blocks publishing when required and missing/expired | M11 register + M14 publish gate |
| Rebating | No customer cashback; referral rewards disabled by default and legal-gated | M01 feature flag `referral_rewards` locked off with `gated_reason` |
| Nominee / free-look | Nominee capture in proposal; free-look end alerts | M09 proposal party `NOMINEE`; M07 lifecycle alerts |
| Sale confirmation | Opportunity, proposal, payment, issuance separate; payment success never marks issued; unknown → reconcile → retry with same key | M04 stages + M09 submission saga |
| Sales funnel (Rev 2.0) | new → contacted → qualified → quote shared → proposal complete → insurer pending → issued / lost | Lead stages `NEW, CONTACTED, QUALIFIED, CONVERTED, LOST`; opportunity stages `DISCOVERY, QUOTE_SHARED, PROPOSAL_COMPLETE, INSURER_PENDING, ISSUED, LOST` |
| Quote options, submission attempts (Rev 2.0) | Many quote options per quote; separate submission attempts | M06 `quote_option`; M09 `submission_attempt` |
| Book import contract | Nothing becomes a held policy without review; re-imports idempotent by insurer + policy number | M07 import (unique key `tenant_id, insurer_id, policy_number_hash`) |
| Vernacular | English, Hindi + two pilot regional languages; ICU messages; transliteration input | M00 i18n (ICU plurals), language packs per tenant later |
| Offline-tolerant mobile | Cached daily plan and due list; queued notes/activities with client idempotency keys; no sensitive documents offline | Web: offline queue (M04/M07 screens), kernel idempotency |
| AI | Four skills behind evaluation gates; never a dependency; never premium, guarantee, declaration or submission | M13 |
| Usage metering | AI and messaging credits, per-tenant limits, alerts, monthly cost report | M01 usage counters + M13/M12 metering |
| Data ownership on exit | Contract-driven rules when an ISP leaves; full export for solo; retention holds | M02 exit transition + M11 export |
| Insurer handoff | No personal/medical data in URL query strings; show when moving to insurer site | M09 handoff link builder with test |

## 2. Feature → module map

| Features | Module |
|---|---|
| F01 tenant setup & distributor entity, F40 isolation, F41/F95 white-label (config side), F42 feature switches, F44 operator admin, F94 plans & solo signup, F99 usage metering | M01 |
| F02 staff login & roles, F32/F92 ISP/POSP onboarding & activation, F33/F91 hierarchy & supervision, F86 licence & training calendar, F97 exit rules (membership side) | M02 |
| F07 party roles, F08 import & dedup, F09 customer 360 (party side), F37 consent, F38 privacy ops | M03 |
| F03 lead intake, F05 allocation, F06 pipeline, F10 communication log, F79 daily plan, F84 offline queue (CRM side) | M04 |
| F13 catalogue, F67 product content governance, F77 research library, F78 comparison scope | M05 |
| F14 needs & comparison, F15 quote workspace, F75 BI evidence, F76 calculators | M06 |
| F20 → held policy, F21 renewal opportunities, F71 book import, F72 due calendar, F73 lifecycle alerts, F74 servicing lite | M07 |
| F18 API route, F46 integration support, F57–F59 gated adapters | M08 |
| F16 proposal forms, F17 pre-sale ops, F19 payment status, F20 policy-sale register, F24 customer journey lite | M09 |
| F25 commission setup, F26 records, F30 finance export, F34 product drives, F35 MIS, F47 reports, F85 income & persistency | M10 |
| F39 audit & disclosures, F45 data exit, F63 content approval, F93 advertisement register, F97 retention holds | M11 |
| F10 messaging, F11 campaigns, F80 WhatsApp-first engagement & reminders | M12 |
| F49 extraction, F50/F88 drafting, F51/F90 assistant, F54 AI controls, F87 policy reader, F89 voice-to-CRM | M13 |
| F61–F68 portal & CMS, F81 card & microsite, F82 greetings, F83 vernacular content | M14 |
| F43 PWA, F64 design system, F83 vernacular UI, F98 adoption & help | Web shell (M00) + each module's screens |
| Later / gated (architecture-ready, not built): F04, F12, F22, F23, F27–F29, F31, F48, F52, F53, F55, F56, F60, F69, F70, F96, F100 | — |

## 3. Launch acceptance (Rev 3.0 §21) → proving modules

| # | Launch acceptance | Proven by |
|---|---|---|
| LA-1 | An IMF marketer publishes an approved branded campaign without a developer, and an unapproved product creative cannot be published | M14 + M11 (F93 gate) + M12 |
| LA-2 | A lead is validated, deduplicated, consented, attributed and assigned to an eligible ISP | M04 (+ M03 dedup/consent, M02 eligibility) |
| LA-3 | An ISP completes needs analysis, permitted comparison, quote, BI acknowledgement and proposal, and obtains insurer-confirmed issuance | M06 + M05 + M09 + M08 |
| LA-4 | A solo agent signs up, verifies licence details and imports a 200-policy book with AI assistance in under 30 minutes of active effort; the due calendar matches the source | M01 (F94) + M07 + M13 (F87) |
| LA-5 | A due reminder is drafted in Hindi or a pilot language, reviewed and sent on WhatsApp; a voice note creates the follow-up task | M12 + M13 + M04 |
| LA-6 | Comparison never shows non-tied insurers for an IMF or agent, or non-eligible products for a POSP | M05 |
| LA-7 | Payment retries and callbacks do not duplicate transactions; policy delivery includes the correct servicing route | M00 idempotency + M08 inbox + M09 |
| LA-8 | A white-label tenant runs on its own domain and sender identities; two tenants cannot access each other's records, files, drafts, AI context or reports | M01 domains + M00 RLS + isolation tests in every module + M14 |
| LA-9 | Export, restore, disclosures, suppression and audit evidence work; each AI skill passes its gate or stays disabled | M11 + M03 + M13 (restore is an infra runbook) |

## 4. KPIs (Rev 3.0 §22) → event streams

| Group | Measures | Source events |
|---|---|---|
| Sales | leads by source, contact rate, quote-to-proposal, proposal-to-issued, time to issue, issued premium | `crm.lead.created`, `crm.lead.stage_changed`, `quote.option.shared`, `proposal.submission.created`, `proposal.policy.issued` |
| Retention | policies under management, dues actioned before grace end, renewal premium retained, revivals, 13th-month persistency | `book.policy.*`, `book.due.outcome_recorded`, `commission.persistency.snapshotted` |
| Adoption | weekly active salespeople, share with book imported, daily-plan actions, WhatsApp shares, AI acceptance rate | canonical request lines (actor pseudonym), `book.import.completed`, `engagement.message.*`, `ai.interaction.reviewed` |
| Commercial | solo free-to-paid conversion, activation time, churn, revenue vs metered run cost | `tenant.*`, `tenant.usage.*` |

Each KPI is a fixed M10 report computed from these domain events, so every number traces back to an event, not an ad-hoc query.
