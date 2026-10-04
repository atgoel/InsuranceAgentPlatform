# India Insurance Distribution Platform — Technical Architecture & HLD
Strapi CMS + Twenty CRM edition · Revision 1.0 · Oct 3, 2026 · @Atul Goel
## 1. Executive summary
The platform runs as three cooperating products behind one API edge: Twenty is the engagement CRM (leads, opportunities, tasks, activities), Strapi 5 is the headless CMS (portal, microsite, collateral, research content), and a TypeScript Insurance Domain Core owns every regulated record (held policies, dues, quotes, proposals, consents, advice, commission). Neither Twenty nor Strapi core is forked; both are extended only through their supported extension points and wrapped behind ports so either can be replaced.
This HLD replaces the Rev 3.0 provisional choice (custom CRM + Payload) with Twenty + Strapi and closes the gaps that choice opens: licence gating, multi-tenancy, approval workflow, privacy minimisation and resilience when either product is down.
| # | Decision | Why |
| D1 | Twenty is system of record for engagement only; Domain Core is system of record for insurance and personal-sensitive data. | Keeps health, KYC and nominee data out of a general CRM; Twenty sees minimised projections. |
| D2 | One Twenty workspace per tenant, on a cell-based deployment (N workspaces per cell). | Workspace = native isolation boundary in Twenty; cells cap blast radius and upgrade time. |
| D3 | Self-host Twenty Community (free, AGPL-3.0), unmodified; buy the Organization licence only if the week-1 spike proves a premium feature unavoidable. | The core CRM is free to self-host; the design compensates for premium-only features (SSO, row-level permissions, audit logs, unlimited workspaces). |
| D4 | Strapi Community edition, pooled per cell, tenant-scoped by a platform plugin; a custom publish gate replaces Enterprise Review Workflows. | Review Workflows and Audit Logs are Enterprise-only; Draft & Publish plus RBAC, where only a Core service account may publish, covers the F63/F93 gate (17B, G4). |
| D5 | Agent PWA and manager console call a Backend-for-Frontend (BFF) through a CRM Port, never Twenty directly. | Degraded mode when Twenty is down, consistent permissions, swap-ability. |
| D6 | Insurer and vendor access only through an Integration Hub with a versioned adapter SPI, capability matrix and per-insurer bulkheads. | Any insurer or vendor plugs in without touching domain code; assisted route always remains. |
| D7 | Postgres-first infrastructure: transactional outbox, Postgres-backed durable jobs, row-level security; managed message bus for fan-out. No Kafka, service mesh or warehouse at launch. | Rev 3.0 lean principle; lowest run cost that still gives exactly-once business effects. |
| D8 | Primary region in India with warm DR in a second India region. | DPDP residency choice, CERT-In log location, regional outage tolerance. |

The architecture passed the internal review loop (section 18) with every dimension at 9.0 or above in round 3. Three items stay open as week-1 spikes: Twenty workspace density per cell, Twenty Community workspace limits, and the AI provider region.
## 2. Context, scope and assumptions
Scope is the Rev 3.0 launch boundary (F01–F100 at stages L and L lite) for IMFs, brokers, individual agents and ISP/POSPs, sold as pooled SaaS and white-label, with Dedicated mode architecture-ready. Product scope, personas, regulatory baseline and acceptance criteria are inherited unchanged from India Insurance Distribution Platform Rev 3.0.
| Area | Rev 3.0 | This HLD |
| CRM | Provisional lean custom TypeScript CRM, subject to a five-day fit test | Twenty (open-source, AGPL-3.0 core) for engagement; insurance entities stay in Domain Core |
| CMS | Payload | Strapi 5 Community, extended by a tenancy plugin and publish gate |
| Domain logic | Inside the custom CRM | Separate Insurance Domain Core (modular monolith) |
| Approval workflow | Payload drafts and access control | Strapi Draft & Publish + Domain Core approval service |
| Five-day fit test | Custom vs adopted CRM | Repurposed: validate Twenty against the 13 Rev 3.0 scenarios, plus workspace density and sync |

Planning envelope (assumptions to validate in pilot). Year 1: up to 100 organisation tenants and 5,000 solo agents; 20,000 named users, 4,000 concurrent at peak; 5 million held policies; 150,000 due reminders on peak days (month-end and festival campaigns); 2 TB documents. Pilot is about 1% of this. Sizing in section 13 scales from these figures.
Hosting assumption. Decided: AWS Mumbai (ap-south-1) primary and Hyderabad (ap-south-2) DR.
Out of scope. Claims, endorsement and general-ledger systems; premium custody; insurer portal scraping; store-listed native apps (Capacitor wrapper later).
## 3. Architecture principles
Ten principles govern every design choice below; a change that breaks one needs an architecture decision record (ADR).
- One system of record per fact. Every entity and field has exactly one owning system (section 8); others hold projections with source and version.
- Extend, never fork. Twenty through its Apps SDK and APIs; Strapi through plugins, Document Service middleware and content-types-as-code. Upgrades stay mechanical.
- Ports and adapters at every product seam. CRM Port, Content Port, Insurer Adapter SPI, Messaging Port, AI Port. Vendors are replaceable behind them.
- Insurer confirms the sale. Opportunity, proposal, payment and issuance remain separate states; a timeout is unknown until reconciled.
- Exactly-once business effects over at-least-once delivery. Outbox on write, inbox with deduplication on read, idempotency key on every external call.
- Tenant from trust, not from input. Tenant resolved from verified domain and authenticated membership; enforced in the database (RLS), the CRM (workspace), the CMS (tenant plugin), storage (prefix + key) and AI context.
- Minimise what leaves the Core. Twenty, Strapi, logs, analytics and AI prompts receive the least personal data that does the job.
- Degrade, don't fail. Every dependency has a documented degraded mode; selling and due management continue when CRM, CMS, AI or an insurer API is down.
- Configuration is data. Tie-up limits, product eligibility, comparison scope, plan entitlements and adapter mappings are versioned data, not code branches.
- Pay for scale when it arrives. Managed Postgres, a modular monolith and cells first; split services, add search clusters or streaming only when a measured threshold is crossed.
## 4. Logical architecture
logical architecture · channels, edge, BFF, one cell, external parties
Four channels enter through one edge; the BFF is the only caller of Twenty, Core and Strapi for field users, and Twenty's own UI is off by default. The highlighted Domain Core owns regulated data and is the only path to AI, insurers and messaging vendors; dashed boxes and lines are external parties or opt-in paths.
## 5. Strapi CMS component design
Strapi 5 Community (MIT) is the content system of record for pages, campaign blocks, collateral, greeting templates, FAQs, research-library entries and localised copy; it never holds leads, customers or prices. Content types, components and roles live in git and deploy through CI; tenants cannot create content types.
Licence fit. Community includes Draft & Publish, i18n with unlimited locales and unlimited roles, but Releases and Content History start at Growth, and Review Workflows and Audit Logs are Enterprise-only (Strapi self-hosted pricing). The design therefore implements approval and audit outside Strapi, and keeps Enterprise as a later option if editorial volume justifies it.
| Concern | Design |
| Tenancy | Pooled instance per cell. A platform plugin adds a required tenant relation to every tenant-scoped type, registers an RBAC condition "same tenant as editor", and a Content API policy injects the tenant filter from the BFF-signed request. Shared content (F77 research library, global greeting templates) uses tenant platform and is filtered by tie-ups at read time. Dedicated and large white-label tenants get their own Strapi instance from the same image. |
| Approval gate (F63, F93) | Draft & Publish holds the two API states. Editor roles have no publish permission in Strapi RBAC; the only identity allowed to publish is a Core publisher service account, which publishes through the Strapi API after the Domain Core Approval Service confirms an approved workflow state, a valid insurer advertisement-approval reference where the tenant rule needs one, and no expired product version. A nightly job compares published entries with approval records to catch any bypass (17B, G4). |
| Audit | A Document Service middleware on publish and unpublish emits content.published/unpublished/changed events to the Core audit log (who, version, checksum, approval reference). It is an audit tap only, not the control, and a CI contract test fails the build if it stops firing. |
| Insurer data protection | Product summary blocks carry only product ID + content version; premiums, eligibility and wording links render from the Core product catalogue at request time, so marketing text cannot overwrite insurer data. |
| Delivery | Next.js renders portal, microsites and share cards with incremental static regeneration; CDN caches by tenant host + locale. Publish events trigger targeted revalidation. Strapi is on the write path only for editors. |
| Media | Strapi upload provider writes to a public-media bucket separate from the private document store; images are resized at the edge. |
| Editor access | Tenant marketers never use Strapi admin: they assemble campaign pages from approved blocks in the Manager Console, which has Keycloak SSO and writes drafts through the Strapi API. Strapi admin is limited to a small Inadev central content team in the Keycloak workforce realm; buy Strapi's SSO add-on for that team if CISO requires federated login there (17B, G5). |
| Agent self-service | Agents never use Strapi admin. They fill approved templates (name, photo, language) in the PWA; the BFF stores personalisation in Core and renders over the published template. |
| Content Port | The BFF reads content through a Content Port (getPage, getBlocks, getTemplate) so Strapi can be replaced or split per tenant without changing apps. |

## 6. Twenty CRM component design
Twenty owns the sales-engagement surface: leads, opportunities, pipeline stages, tasks, notes, their data model and automation; people reach this data through our apps. It runs as a NestJS server and a BullMQ worker over PostgreSQL and Redis, and auto-generates REST and GraphQL APIs per workspace plus a Metadata API for the schema (Twenty self-host overview).
Licence fit. Twenty is self-hosted on Inadev infrastructure under the free Community edition (AGPL-3.0), unmodified, with no licence fee and no per-seat cost. The Organization plan adds SSO, row-level permissions, audit logs, unlimited workspaces and the right to keep code changes private (Twenty pricing plans). This design does not need those features: identity is fronted by our IdP and proxy, record scoping is enforced in the BFF, audit is captured in Core from Twenty webhooks, and the Platform App is built on public APIs rather than by patching Twenty. AGPL only obliges us to publish source if we modify Twenty itself and serve it over a network, which the no-fork rule avoids. The one item to prove in week 1 is how many workspaces the Community edition allows on one instance; Q3 in section 17A sets out the fallback.
### Extension model
All insurance-specific CRM behaviour ships as one versioned Platform Twenty App built with the Twenty SDK. Apps declare objects, fields on standard objects, relations, logic functions (HTTP, cron and database-event triggers, run in sandboxed Node processes) and front components (Twenty Apps). The app is installed into every workspace by the provisioning pipeline, so every tenant gets the same schema version.
| Twenty object | Owner | Contents |
| Person, Company (standard + app fields) | Twenty | Name, preferred contact, language, core_party_id, consent summary flag, owner, branch |
| Lead (app object) | Twenty | Source, campaign ID, product interest, qualification, routing result |
| Opportunity (standard + app fields) | Twenty | Line of business, stage, expected premium band, core_opportunity_id, lost reason |
| Task, Note, Activity | Twenty | Follow-ups, call logs, voice-to-CRM outputs (after confirmation) |
| Policy Summary (app object, read-only) | Core projection | Insurer, product name, policy number (masked), status, next due date, renewal date |
| Premium Due (app object, read-only) | Core projection | Due date, grace end, outcome, assigned seller |
| Service Request (app object, read-only) | Core projection | Type, status, insurer reference, follow-up date |

Read-only projections are enforced by app role permissions so tenant users cannot edit Core-owned facts inside Twenty. Tenant admins may add custom fields and views on Twenty-owned objects through the UI; they cannot alter app-owned objects (section 8).
### Boundaries
- Agents, ISPs, POSPs and solo agents work in the Agent PWA; managers use the Manager Console for pipeline boards, views and tasks. Twenty runs headless with no human logins by default; its UI is a per-tenant opt-in that needs Twenty's licensed SSO (17B, G2).
- The BFF talks to Twenty through the CRM Port (upsertPerson, createLead, moveStage, createTask, listMyWork). The Twenty adapter uses per-workspace API keys held in the secrets manager and rotated every 90 days.
- Twenty webhooks (record created, updated, deleted) flow into the Core inbox; Core events flow out to Twenty through the outbox and a CRM sync worker. Section 12 covers failure handling.
- Twenty's AI and MCP features are disabled for tenants at launch; all AI goes through the platform AI Gateway so evaluation gates, metering and data-minimisation rules apply (section 14).
- No Twenty core patches. If a needed capability is missing, it is built in Core or as an app, or proposed upstream.
## 7. Insurance Domain Core
The Domain Core is a NestJS/TypeScript modular monolith on managed PostgreSQL that owns every regulated or money-adjacent record. Modules talk only through published interfaces and domain events, so any module can later become its own service without a data migration.
component diagram · BFF ports, 12 Core modules, Twenty, Integration Hub, Strapi
The BFF reaches Twenty and Strapi only through its CRM and Content ports, and the Core only through the scope guard. Core modules share one kernel for outbox, jobs, events, RLS and audit; Twenty exchanges events and webhooks with Core, Strapi calls Compliance before any publish, and only the Integration Hub talks to insurers and vendors.
| Module | Owns | Key features |
| Tenant & Entitlements | Tenant, plan, limits, feature flags, distributor entity, licence, tie-ups per line, brand kit, domains, sender references | F01, F41, F44, F94, F95, F99 |
| Party & Consent | Canonical party, contact points, proposer/insured/payer/nominee roles, consent ledger (purpose, channel, notice version), suppression | F07, F37, F38 |
| Distribution Network | Branch/team hierarchy, memberships, salesperson type, insurer codes, certification, licence and training calendar | F32, F33, F86, F91, F92 |
| Product Catalogue | Insurer, product version (UIN, wording version, POSP flag, channel eligibility), quote requirements, research metadata | F13, F67, F77 |
| Advice & Quote | Needs-analysis runs with assumptions version, comparison scope engine, quotes, benefit-illustration evidence, advice records | F14, F15, F75, F76, F78 |
| Proposal & Issuance | Proposal and party links, frozen declarations, submission saga, payment status, policy sale | F16–F20, F24 |
| Book & Retention | Held policy, premium schedule, due instances, lifecycle alerts, servicing tracker lite, book import | F21, F71–F74, F100 later |
| Commission & Performance | Commission rules per insurer policy, expected/received records, persistency snapshots, targets | F25, F26, F30, F35, F85 |
| Compliance & Audit | Advertisement approval register, content approval workflow, disclosures, append-only audit log, DSR case management | F39, F45, F63, F93, F97 |
| Engagement Orchestration | Campaign audiences, reminder schedules, send requests with consent recheck, delivery outcomes | F10, F11, F80, F88 send step |
| Documents | Private object store pointers, classification, checksum, AV status, retention class | F38, F49 intake |

Comparison scope engine (F78). A pure function of (entity type, active tie-ups, salesperson type, product eligibility, effective date) returns the permitted insurer-product set. It is the single gate used by quote, comparison, research library filtering, AI product assistant retrieval and Strapi product blocks, so the acceptance test "comparison never shows non-tied insurers" has one implementation to prove.
Due engine (F72). Premium schedules generate due instances 90 days ahead in a nightly job; grace end and lapse status derive from product rules held as data. Insurer renewal notices or status files, when an adapter provides them, override computed state and record the source.
## 8. Data model, ownership and extension strategy
Each fact has one owner; the other systems hold a projection keyed by a cross-reference ID and a source version. Conflicts resolve by ownership, never by timestamp alone.
| Data | System of record | Projection to | What is withheld from the projection |
| Lead, opportunity, task, note, call log | Twenty | Core (opportunity reference, attribution for MIS) | Nothing sensitive is captured here by design |
| Party identity and contact points | Core | Twenty Person (name, phone, email, language) | Date of birth, ID numbers, address details, household links |
| Proposer/insured/nominee roles, health and KYC answers | Core (field-level encrypted) | None | Everything |
| Consent and suppression | Core | Twenty flag can_contact + channel list | Notice text, evidence |
| Held policy, due, servicing request | Core | Twenty read-only objects | Sum assured, nominee, medical flags; policy number masked |
| Quote, proposal, benefit illustration, policy sale | Core | Twenty opportunity stage and amount band | Premium components, declarations, documents |
| Commission, persistency, targets | Core | Manager Console only | Not projected to Twenty |
| Web content, collateral, templates | Strapi | CDN, BFF cache | n/a |
| Product data, prices, eligibility | Core Product Catalogue | Strapi blocks by reference only | n/a |

Field ownership on shared entities. For Party ↔ Person, Core owns identity and contact fields and Twenty owns owner, tags and custom engagement fields. A Twenty edit to a Core-owned field becomes a change request that Core validates (deduplication, consent) and then echoes back; an unvalidated edit is reverted with a task to the editor.
### Extension mechanisms, in order of preference
| Need | Mechanism | Guardrail |
| New insurer or product | Catalogue data + adapter mapping; no code | Product version immutable once quoted |
| Insurer-specific proposal questions | Versioned JSON Schema per insurer form, answers in typed JSONB | Schema registered before use; answers validated on write; old versions readable forever |
| Tenant custom field on engagement data | Twenty custom field via UI or Metadata API | Limit per object per plan (proposed 25); no personal-sensitive types |
| Tenant custom field on Core data | Core custom-field registry (JSON Schema, type, PII class, index hint) stored in JSONB | Limit per plan (proposed 15); PII class mandatory; reportable fields declared up front |
| New platform-wide CRM concept | Platform Twenty App new version | Expand-contract migration across all workspaces via provisioning pipeline |
| New line of business (marine, group, SME) | New Core LoB module with its own tables behind the same proposal, quote and held-policy interfaces | Shares party, consent, document and audit modules |
| New downstream consumer | Subscribe to versioned domain events | Consumers never read Core tables directly |

Rules that keep extensions safe. Money is integer paise with currency; dates are typed; no entity-attribute-value engine; JSONB only for schema-registered payloads. Database migrations use expand → backfill → contract with one owning module per table. Domain events are CloudEvents with a JSON Schema in a registry; a compatibility check in CI blocks breaking changes, and breaking changes ship as a new event version with both published during a deprecation window.
## 9. Integration architecture
Every insurer and third-party vendor connects through the Integration Hub, a Core-adjacent runtime that translates between a canonical insurance model and each counterparty. Domain modules call capabilities (quote, submitProposal, getStatus), never a named insurer, so onboarding insurer number seven is a configuration and certification exercise, not a code change in the domain.
### Adapter SPI
| Element | Design |
| Canonical model | Versioned schemas for party, risk (life, health, motor), quote, proposal, payment reference, policy, renewal notice, commission statement, service request. Adapters map to and from it. |
| Capability manifest | Each adapter declares per product line: supported operations, sync or async, auth type, rate limits, SLAs, sandbox URL, supported schema versions. The Core reads the manifest to choose API, file or assisted route at runtime. |
| Adapter kinds | REST/JSON, SOAP/XML, SFTP batch (CSV/fixed-width), inbound webhook, email ingest of insurer documents into F87, and Assisted (operator records the portal transaction with evidence). Portal scraping is prohibited. |
| Mapping | Declarative mappings (JSONata-style) for most fields, versioned with the adapter; a TypeScript plug-in only for logic a mapping cannot express (signing, encryption, multi-step auth). |
| Credentials | Per tenant per insurer where the insurer issues them to the distributor; stored in the secrets manager, referenced by ID, never in logs or Twenty. |
| Packaging | Adapters are independently versioned packages loaded by the hub with a pinned version per tenant, so one insurer's upgrade cannot break another. |

### Reliability contract for every external call
- Idempotency key from the business operation, reused on every retry; timeouts become unknown and trigger a status query before any resubmission.
- Per-counterparty bulkhead queue and concurrency cap, circuit breaker (open on error-rate or latency threshold), exponential backoff with jitter, and a dead-letter queue with an operations screen.
- Inbound callbacks: signature or mTLS verification, replay window, inbox deduplication, raw payload retained 180 days, stale transitions rejected.
- Contract tests per adapter against recorded sandbox responses run in CI; a certification checklist (happy path, declines, timeouts, duplicate callbacks, schema drift) must pass before a tenant can enable the adapter.
- Synthetic probes per insurer endpoint every 5 minutes feed an adapter health board and the circuit breaker.
### Third-party vendors behind ports
| Port | Launch provider class | Swap rule |
| Messaging | WhatsApp Business Solution Provider; DLT-registered SMS aggregator; transactional email service | Sender identities belong to the tenant entity; templates and opt-outs held in Core so a provider change moves no consent data |
| Identity | Keycloak, self-hosted on AWS | Standard OIDC/SAML; Twenty and Strapi SSO attach to it |
| Subscription billing | Indian billing provider with GST invoicing | Plans and entitlements stay in Core; provider only invoices and collects subscription fees |
| AI models | Through AI Gateway (section 14) | Provider abstraction, prompt and model versioning |
| OCR and AV scan | Managed OCR via AI Gateway; ClamAV-class scanner | Stateless workers |
| KYC, e-sign, DigiLocker, Bima Sugam | Gated (F57–F59) | Same adapter SPI when contracts and onboarding exist |

Premium payments use insurer-approved payment links only; the platform records references and never holds premium.
Outbound integration for tenants. Tenants and partners get a public REST API (OAuth2 client credentials, tenant-scoped, rate-limited per plan) and signed webhooks for lead, sale, due and commission events, generated from the same event registry.
## 10. Multi-tenancy, white-label and provisioning
A tenant is isolated in five places at once; a tenant directory in Core maps every tenant to its cell, Twenty workspace, Strapi scope, storage prefix and key.
| Layer | Pooled (Solo, Team, Business, White-label) | Dedicated (F48) |
| Domain Core DB | Shared schema, tenant_id on every row, Postgres RLS; app role has no BYPASSRLS; SET LOCAL app.tenant_id per transaction from the verified token | Separate database instance |
| Twenty | One workspace per tenant inside a shared cell | Dedicated Twenty instance |
| Strapi | Tenant plugin scoping in the cell's instance | Dedicated Strapi instance |
| Object storage | Tenant prefix + per-tenant data key (envelope encryption) | Separate bucket and customer-managed key |
| Cache, queues, AI context | Keys and job payloads carry tenant ID; workers re-check tenant on every job; AI retrieval index filtered by tenant before ranking | Separate |

### Cells
A cell is a complete stack (BFF, Core, Integration Hub, Twenty server + worker, Strapi, Postgres cluster, Redis) serving a bounded set of tenants. Cells give three things: a cap on Twenty workspaces per Postgres cluster, a blast-radius limit for upgrades and incidents, and a unit of cost. Launch runs one production cell; a new cell opens when any cell crosses its proposed limits of 1,500 workspaces, 60% sustained database CPU, or Twenty upgrade migration time over 60 minutes. A global control plane (tenant directory, identity, billing, edge routing) sits above cells and holds no customer data.
Solo agents (decided). Solo agents do not get a Twenty workspace at launch. Their leads, follow-ups, tasks and activities live in a Solo-CRM-lite module in Core, pooled under RLS and served through the same CRM Port, so the Agent PWA code is identical for solo and organisation users. A solo agent who later joins or becomes an organisation tenant is migrated by exporting from Solo-CRM-lite into a new Twenty workspace through the provisioning saga. Twenty workspaces are therefore counted only for organisation tenants (100 in the year-1 envelope).
### White-label
- Domains: custom domain verified by DNS TXT, managed TLS at the edge; tenant resolved from the host header, cross-checked with the token's membership.
- Brand kit: colour and typography tokens, logos, PDF letterheads and share-card frames stored in Core and applied by the design system at render time; no code forks or per-tenant builds.
- Twenty branding: tenant workspace logo and name; Twenty UI is a back-office tool and not white-labelled at launch.
- Sender identities: WhatsApp number, DLT headers and email domain registered by the client entity; Core stores references and enforces templates.
### Provisioning pipeline
An idempotent saga creates, in order: tenant and entitlements → identity realm or organisation → Core RLS scope and keys → Twenty workspace + Platform App install + roles → Strapi tenant record + starter pages → domain and sender references → smoke test. Each step is resumable; deprovisioning runs the reverse with export and retention holds (F97).
## 11. Security and data privacy
The distributor is expected to be data fiduciary and Inadev the processor under the DPDP Act and Rules 2025; the platform must let each tenant meet notice, consent, purpose limitation, rights and breach duties without custom work. Health and medical proposal data, AI processing of customer documents and any cross-border model hosting are regulated-data decisions: loop in Inadev's CISO and compliance team before the pilot, and have Compliance/Legal confirm current IRDAI cyber guidelines and DPDP commencement dates against originals.
### Privacy by design
| Control | Implementation |
| Data classification | Every field tagged P0 public, P1 internal, P2 personal, P3 sensitive (health, financial account, ID numbers). Class drives encryption, projection, logging and AI rules. |
| Minimisation | P3 never leaves Core; P2 goes to Twenty only as listed in section 8; logs and traces carry tokenised party IDs, masked phones and no free text from proposals. |
| Encryption | TLS 1.2+ everywhere; storage encrypted with KMS; P3 fields additionally field-level encrypted with per-tenant data keys; Aadhaar numbers not stored (masked reference only, where an insurer flow needs it). |
| Consent ledger | Purpose, channel, notice version, timestamp, source and withdrawal per party; checked at send time and before any AI processing of that party's documents. |
| Data subject requests | Core DSR case orchestrates access, correction and erasure across Core, Twenty workspace (via API), Strapi form submissions, object storage, search and AI logs, with retention holds where law or insurer contract requires keeping records. Evidence pack generated per case. |
| Retention | Retention class per record type configured per tenant; nightly purge jobs; backups expire on the same schedule plus backup window. |
| Residency | Primary, DR, backups, logs and AI processing in India by default; any exception needs a recorded tenant decision and compliance sign-off. |
| Processor contract | DPA template per tenant; sub-processor register (cloud, BSP, SMS, email, AI provider, Twenty and Strapi licensors if they ever access data). |

CRM side channels. Twenty email and calendar sync can pull customer mail, including medical details, into the CRM. Sync is off by default, enabled per tenant only for business mailboxes after a recorded tenant decision, with attachment import disabled. Policy and proposal documents are uploaded only through the PWA into Core; a nightly job scans Twenty notes and attachments for P3 patterns (ID numbers, medical terms) and raises a compliance task. Twenty API access from the BFF is rate-limited per workspace with backpressure so a runaway client cannot exhaust a cell.
### Security controls
- Identity: Keycloak 26+ with a workforce realm and a customers realm holding one Organization per tenant; federated login to each tenant's own IdP; phone OTP for field users; MFA for privileged roles; step-up for exports and bank-detail changes; Organization-scoped tokens bound to the host-resolved tenant (17B, K1–K7).
- Authorisation: BFF enforces role, branch and record scope on every call; Twenty's own UI is limited to head-office roles cleared to see the whole tenant, while branch-scoped users work in the Manager Console; Core RLS is the last line.
- Secrets: cloud secrets manager; per-workspace Twenty API keys and insurer credentials rotated; no secrets in Strapi or Twenty config UIs.
- Supply chain: pinned, digest-referenced Twenty and Strapi images rebuilt on our base; SBOM per release; dependency and container scanning in CI; critical CVEs patched within 72 hours.
- Network: WAF and bot control at the edge; private subnets for data stores; egress allow-list per service; Integration Hub has the only path to insurer endpoints.
- Logging and incidents: security and audit logs retained 180 days in India in line with CERT-In directions; incident runbook covers the six-hour CERT-In report, DPDP breach notice and tenant notification; vendor-risk evidence pack for tenants.
- Testing: threat model per release train, SAST/DAST, annual third-party penetration test, tenant-isolation test suite in CI (cross-tenant read attempts on every API, file URL, report and AI query).
## 12. Resilience and robustness
Selling, due management and reminders keep working when Twenty, Strapi, AI or an insurer API is down; only the affected feature degrades. Proposed launch targets are 99.5% monthly availability for agent and customer journeys, RPO 5 minutes and RTO 4 hours for a regional loss, and RTO 30 minutes for a zone loss.
### Degraded modes
| Failure | What users see | Mechanism |
| Twenty unavailable | Daily plan, dues, policies, quotes and proposals work; new leads and tasks queue and show "syncing" | CRM Port writes to Core outbox first; sync worker replays with idempotency keys when Twenty returns; PWA reads its work list from a Core cache refreshed by Twenty webhooks |
| Strapi unavailable | Portal and microsites served from CDN and last regenerated pages; editors cannot publish | ISR pages + stale-while-revalidate; lead forms post to the BFF, not Strapi |
| Insurer API down or slow | Quote or submission switches to assisted route with a banner | Circuit breaker per insurer; capability manifest falls back to Assisted; queued status checks resume later |
| AI provider down | Manual entry, manual drafting, typed notes | Each AI skill has a non-AI path (Rev 3.0 rule); gateway fails fast with a fallback model only where that model has passed the same gate |
| WhatsApp BSP down | Click-to-chat still works; template sends queue | Messaging Port retries with backoff; optional SMS fallback only where consent covers SMS |
| Zone failure | No user-visible change beyond seconds | Multi-AZ Postgres, Redis and services |
| Region failure | Read-only banner, then full service in DR | Warm standby in second India region: cross-region replicas for Postgres, replicated buckets, infra as code, runbook drilled twice a year |

### Robustness of business state
- Outbox/inbox everywhere. Every state change and its event commit in one transaction; consumers deduplicate on event ID. This covers Core → Twenty, Core → messaging, Twenty → Core and insurer callbacks.
- Sagas with compensation. Proposal submission, book import and tenant provisioning are durable workflows on a Postgres-backed job engine; each step is idempotent and resumable after a crash.
- Unknown is a state. Timeouts on submission or payment never retry blindly; a status query or operator reconciliation resolves them first.
- Reconciliation jobs. Nightly Core ↔ Twenty count-and-hash comparison per workspace per object; insurer status sweeps for proposals pending over 48 hours; paid-but-not-issued queue (F19). Drift opens an operations ticket, not a silent fix.
- Poison handling. Three-strike rule to dead-letter with payload, error and owner; operations screen to inspect, fix mapping, and replay.
- Input hardening. Schema validation at the edge and in Core, file-type and size checks, AV scan before any OCR or AI read, and allow-listed fields on public forms.
- Offline PWA. Cached daily plan and due list; queued notes and activities carry client-generated idempotency keys; sensitive documents are never cached offline.
### Verification
Monthly backup restore test into an isolated account; quarterly game day (kill Twenty, kill an insurer adapter, fail a zone); load test before every pilot wave against section 13 targets.
## 13. Scalability and performance
The design scales horizontally inside a cell and by adding cells; no component needs a re-architecture to reach the year-1 envelope in section 2.
| Component | Scaling approach | Trigger to change approach |
| BFF, Core API, Integration Hub | Stateless containers, autoscale on CPU and p95 latency | Split a Core module into its own service when it needs independent scaling or release cadence |
| Core Postgres | Vertical first; read replica for MIS and exports; partition premium_due, audit_event, message_send by month | Sustained 60% CPU or table over 500 GB → cell split |
| Twenty | Server replicas behind the load balancer; worker replicas per queue; workspaces spread across cells | Cell limits in section 10 |
| Strapi | Two replicas per cell; read traffic absorbed by CDN and ISR | Editor concurrency or tenant isolation need → dedicated instance |
| Jobs and reminders | Postgres-backed queues partitioned by tenant; month-end due runs chunked and rate-limited per BSP | Queue lag over 10 minutes at peak → move fan-out to managed queue consumers |
| Search and dedupe | Postgres full-text + trigram indexes, per-tenant | Over 2 million parties in a cell or p95 search over 500 ms → OpenSearch |
| Reporting | Materialised views refreshed every 15 minutes on the replica | Cross-tenant or long-horizon analytics → warehouse later |
| Documents and AI | Async workers on spot capacity; OCR and extraction batched | n/a |

Performance budgets (proposed). Agent PWA first load under 3 seconds on a low-end Android over 3G-equivalent, JS bundle under 250 KB compressed; API p95 under 400 ms for reads and 800 ms for writes excluding insurer calls; daily plan computed in under 1 second from precomputed due and task views; portal pages served from CDN with p95 time-to-first-byte under 200 ms.
Peak handling. Month-end and festival peaks are known in advance: reminders are pre-computed overnight and released only inside the delivery windows that messaging rules permit, pre-warmed workers scale the evening before, and BSP throughput limits are enforced by token buckets per sender identity.
## 14. AI gateway and skills
All four launch skills (F87 policy reader, F88 vernacular drafting, F89 voice-to-CRM, F90 grounded product assistant) run through one AI Gateway in Core; Twenty's and Strapi's built-in AI features stay off so every model call is governed, metered and evaluated in one place.
| Gateway function | Design |
| Skill contract | Typed input and output schema, allowed tools, model and prompt version, timeout, cost ceiling, tenant enablement flag (F54) |
| Data minimisation | Consent check; P3 fields redacted unless the skill needs them (policy reader on a policy the agent uploaded); party IDs tokenised |
| Grounding (F90) | Retrieval over approved, versioned content from Strapi and the Product Catalogue, filtered by tenant and comparison scope before ranking; pgvector in Core Postgres at launch; citations required, abstain otherwise |
| Provider abstraction | Pluggable providers with processing region, no-training and retention terms recorded; routing by skill to the smallest model that passes its gate |
| Human in the loop | Outputs land as drafts (held policy, message, task); nothing is saved, sent or submitted without user confirmation |
| Evaluation | Rev 3.0 gates (95% policy fields, 85% draft acceptance, 90% voice capture, zero uncited answers) run in CI on curated sets per language; a model or prompt change that fails the gate cannot deploy |
| Cost control | Per-tenant credits and hard limits (F99), response caching for product Q&A, batch extraction for book imports, monthly cost per tenant report |
| Audit | Skill, versions, input reference, output, reviewer decision and cost stored as AI interaction records |

AI provider and processing region remain open decision OD-3, owned by the CISO and compliance review.
## 15. Deployment topology and cost optimisation
Launch runs one production cell across three availability zones in the primary India region, a warm DR footprint in the second region, and separate non-production accounts. Everything is infrastructure as code (Terraform) with GitOps deployment.
deployment diagram · global layer, primary region subnets, warm DR region
All eight services run as serverless containers across three zones in private subnets; only the load balancer is public and only the Integration Hub has egress to insurers and vendors. Postgres and buckets replicate asynchronously to Hyderabad, where compute stays at zero until a drilled failover scales it up.
| Layer | Launch choice |
| Edge | CDN + WAF + managed TLS for custom domains; edge routing to the tenant's cell |
| Compute | Container service on Fargate-class serverless containers for BFF, Core, Hub, Twenty server, Strapi; Twenty worker and Core workers on separate task groups; batch and AI workers on spot capacity. No Kubernetes at launch. |
| Data | Managed Postgres (Multi-AZ) per cell, with separate databases for Core, Twenty and Strapi and least-privilege roles; managed Redis (Multi-AZ) for Twenty queues and BFF cache; object storage with lifecycle tiers |
| Messaging | Transactional outbox → event relay → managed pub/sub topics and queues for fan-out |
| Accounts | Separate accounts for production, DR, staging, development and security tooling; central audit log account |

### Cost levers
| Lever | Effect |
| Licences: Strapi Community and Twenty Community, both self-hosted at no licence fee | No CRM or CMS licence cost at launch; paid tiers stay optional because the publish gate, BFF scoping and Core audit cover approval, access and audit needs |
| Cells sized by measurement | Twenty workspace density from the week-1 spike sets cost per tenant; idle solo workspaces archived after 90 days |
| Modular monolith + Postgres-first | One database engine to operate; no Kafka, search cluster or warehouse until thresholds in section 13 |
| Serverless containers + spot for batch | Pay per use for spiky imports, OCR and AI; Graviton/ARM images where supported |
| Commitments after pilot | Savings plans or reserved capacity only for the steady baseline measured in pilot |
| Storage tiering | Documents move to infrequent-access after 90 days and archive tier per retention class |
| AI routing | Smallest passing model per skill, caching, batching, hard per-tenant caps |
| Messaging mix | Solo uses WhatsApp click-to-chat (no API cost); utility templates preferred over marketing templates for reminders |
| DR as warm standby | Replicas and images kept warm; compute scaled to zero until failover |
| Unit economics | Per-tenant cost report (compute share, storage, AI, messaging, licence share) compared monthly with plan price (F99) |

A priced bill of materials is a week-1 task using the cloud provider's calculator, Twenty's Organization quote and BSP rate cards; this HLD deliberately does not guess those figures.
## 16. Observability, operations and upgrades
Every request carries a trace ID and a tenant tag from the edge to Twenty, Strapi, the Hub and insurer calls, so an incident can be scoped to one tenant and one dependency within minutes.
- Telemetry: OpenTelemetry traces, metrics and structured logs from BFF, Core, Hub, Twenty and Strapi; tenant ID and cell on every signal; personal data excluded by the log schema.
- SLOs: per journey (daily plan load, quote, proposal submit, reminder send, portal page) and per dependency (each insurer adapter, Twenty sync lag, BSP delivery). Error budgets gate release pace.
- Business monitors: sync drift count, dead-letter depth, unknown submissions older than 2 hours, paid-not-issued older than 24 hours, reminder backlog at 08:00.
- Support tooling: tenant console for operators with impersonation only under ticket, time-boxed and audited.
### Upgrade strategy for Twenty and Strapi
| Step | Rule |
| Version policy | Pin exact versions; track upstream releases; plan one minor upgrade per quarter and security patches within the CVE SLA |
| Contract tests | CI suite covers every Twenty API, webhook and SDK call the CRM Port and Platform App use, and every Strapi API, middleware and plugin hook we rely on |
| Rollout | Staging cell with production-like workspace count → canary cell or tenant group → remaining cells; Twenty per-workspace migrations monitored for duration and failures |
| Rollback | Database snapshot before upgrade; blue-green application tier; Platform App versions backward compatible for one release |
| Ownership | A named platform engineer owns each product's upgrade runbook and upstream relationship |

## 17. Delivery impact, risks and open decisions
The Rev 3.0 18–20 week plan holds: Twenty removes most pipeline, task, email-sync and view-building work, and that saving is spent on the Platform Twenty App, the CRM sync worker, the Strapi tenancy plugin and publish gate. The Rev 3.0 cost estimate should be re-baselined once licence quotes arrive.
| Rev 3.0 phase | Change under this HLD |
| Week 1: foundation | Twenty fit test on the 13 scenarios; workspace-density spike (1,000 workspaces); Strapi tenancy plugin and publish-gate prototype; licence quotes; priced bill of materials |
| Weeks 2–5: capture and book | Platform Twenty App v1, CRM Port, outbox and sync worker, provisioning saga, Core party/consent/book modules |
| Weeks 6–10: advise and sell | Integration Hub with first two insurer adapters (one API, one assisted), comparison scope engine, proposal saga |
| Weeks 11–14: agent experience and AI | Twenty read-only projections, AI Gateway with gates, Strapi share-card and microsite templates, white-label domains |
| Weeks 15–18: pilot | Game day and restore test added to pilot exit criteria |

Scope deliberately deferred from module builds is tracked in the [future scope register](FUTURE-SCOPE.md).

### Risks
| Risk | Mitigation |
| Twenty Community limits the number of workspaces per instance | Day-3 spike; fallback is one Twenty instance per organisation tenant on shared data services; Solo-CRM-lite in Core for solo agents |
| AGPL obligations if Twenty is modified | No core fork (Q15); Platform App uses public APIs; Legal confirms in week 2 |
| Twenty or Strapi breaking change on upgrade | Pinned versions, contract tests, canary cell, rollback snapshots |
| Workspace-per-tenant does not scale for thousands of solo agents | Density spike with explicit thresholds; lazy creation and archival; pooled fallback |
| Sync drift between Core and Twenty | Field ownership matrix, outbox/inbox, nightly reconciliation, drift monitor |
| Strapi lacks native multi-tenancy and approval workflow | Tenancy plugin with isolation tests; publish gate in Core; Enterprise upgrade path kept open |
| Insurer integration variability | Adapter SPI, capability manifest, certification checklist, assisted route always available |
| Sensitive data leaking into CRM, logs or prompts | Classification-driven projection, log schema, AI redaction, isolation and privacy test suites |

### Open decisions
| ID | Decision | Owner | Needed by |
| OD-1 | Twenty Community workspace limit and tenancy fallback (Q3) | Architecture | Week 1 |
| OD-2 | Solo tenancy — resolved: Solo-CRM-lite in Core (Q4) | Architecture, from the density spike | End of week 1 |
| OD-3 | AI provider and processing region | CISO + compliance | Week 4 |
| OD-4 | Identity provider — resolved: self-hosted Keycloak (Q6) | Architecture + Security | Week 2 |
| OD-5 | Cloud — resolved: AWS Mumbai + Hyderabad (Q1) | IT lead + CISO | Week 1 |
| OD-6 | Strapi Enterprise (Review Workflows, Audit Logs) for large white-label tenants | Product, after pilot | Before GA |

## 17A. Week 1–4 implementation decisions
Fifteen questions gate weeks 1–4; each has a recommended resolution so work can start on day 1, and only five need an answer from outside the delivery team. Change a status to Confirmed once agreed.
| ID | Question | Recommended resolution | Owner | Needed by | Status |
| Q1 | Where do we host: AWS India regions, another India cloud, or Inadev's own data centre? | Decided: AWS Mumbai (ap-south-1) primary + Hyderabad (ap-south-2) DR; managed Postgres, Redis, KMS; Terraform from day 1 | IT lead + CISO | Day 2 | Confirmed |
| Q2 | Which Twenty edition and version? | Community, self-hosted, unmodified; pin the latest stable 2.x image digest at kickoff | Architecture | Day 1 | Confirmed |
| Q3 | How do organisation tenants map to Twenty? | Workspace per tenant on one instance if Community allows multiple workspaces; otherwise one Twenty instance per organisation tenant sharing the Postgres cluster (own database) and Redis (own DB index). Spike decides by day 3 | Architecture | Day 3 | Proposed |
| Q4 | Do solo agents get a Twenty workspace? | Decided: no. Solo agents use a Solo-CRM-lite module in Core behind the same CRM Port; revisit after beta | Product + Architecture | Week 1 | Confirmed |
| Q5 | Who logs into Twenty's own UI? | Nobody by default: Twenty runs headless and everyone uses the Manager Console or Agent PWA with Keycloak SSO; Twenty UI is a per-tenant opt-in that needs the Organization licence for SSO (17B, G2) | Product | Week 1 | Proposed |
| Q6 | Which identity provider? | Decided: Keycloak 26+ self-hosted on AWS; customers realm with one Organization per tenant and per-tenant federated IdP; separate workforce realm; SMS OTP authenticator plug-in | Architecture + Security | Week 2 | Confirmed |
| Q7 | Which pilot IMFs and first two insurer-product pairs? | One API-capable insurer and one assisted route; request sandbox credentials in week 1 because insurer lead time is the longest dependency | Business development | End of week 1 | Open |
| Q8 | What book-of-business samples do we have? | Two or three anonymised agent-portal exports per pilot insurer to design F71 mappings | Pilot IMFs via BD | Week 2 | Open |
| Q9 | Which two regional languages for the pilot? | Chosen by pilot geography; Hindi and English fixed | Product | End of week 1 | Open |
| Q10 | Which WhatsApp BSP and DLT SMS aggregator, and who registers sender identities? | Shortlist two of each; pilot tenants start their own DLT and WhatsApp registrations in week 1 because approval takes weeks | Product + pilot tenants | Week 1 | Open |
| Q11 | Which AI provider and processing region? | Build the AI Gateway with a stub provider in weeks 1–4; CISO and compliance choose by week 4 | CISO | Week 4 | Proposed |
| Q12 | Is the week-1 team in place? | Product lead, designer, 3–4 TypeScript engineers (NestJS, Next.js), part-time DevOps, QA, part-time compliance analyst; one engineer named owner for Twenty and one for Strapi | Delivery manager | Day 1 | Open |
| Q13 | Repository, CI and environments? | One monorepo (Turborepo or Nx) for BFF, Core, Hub, Platform Twenty App, Strapi project and PWA; dev, staging and production accounts; contract tests for Twenty and Strapi in CI from week 2 | Engineering lead | Day 2 | Proposed |
| Q14 | When does CISO review health-data handling and the DPA template? | Week 3 review of classification, field-level encryption and DSR design before any real customer data | CISO + compliance | Week 3 | Proposed |
| Q15 | What if a Twenty or Strapi patch becomes unavoidable? | Policy: no core patches; fix upstream or build in Core or the Platform App; if a patch is ever shipped, publish its source as AGPL requires | Legal + Architecture | Week 2 | Proposed |

### Week 1–4 build plan
| Week | Deliverables | Exit check |
| 1 | Cloud accounts and Terraform baseline; monorepo and CI; Twenty Community and Strapi in dev; workspace spike; Strapi tenancy and publish-gate prototype; data model sign-off | Q1–Q5, Q12, Q13 confirmed; spike report written |
| 2 | Keycloak; tenant directory; Core skeleton with RLS; provisioning saga v0 (Core scope, Twenty workspace or instance, Strapi tenant); Platform Twenty App v0 | A test tenant is provisioned end to end in one command |
| 3 | Party and Consent module; CRM Port with outbox and inbox; Twenty webhooks into Core; field ownership rules; tenant-isolation tests in CI | Lead created in PWA appears in Twenty; edit in Twenty round-trips; cross-tenant tests pass |
| 4 | Held policy model; CSV book import with review queue; premium schedules and due generation; read-only projections in Twenty; staging environment; first Twenty-down drill | 200-policy import produces a correct due calendar; PWA keeps working with Twenty stopped |

## 17B. Gap validation and severity
Four gaps were raised against this HLD after round 3. Each was checked against current Twenty, Keycloak and Strapi documentation, rated, and resolved in the design; the review also surfaced six further gaps, four of them about cross-tenant leakage. Severity scale: Critical = cross-tenant data exposure or loss of a regulatory control; High = breaks a stated requirement (SSO, isolation, availability) or blocks launch; Medium = cost, operability or upgrade risk with a workaround; Low = accepted residual.
Bottom line: the SSO gap was the most serious of the four raised (High), because a proxy in front of Twenty is a gate, not single sign-on. It is closed by running Twenty headless and federating every human login through Keycloak Organizations. The most serious overall is token-to-tenant binding (K3, Critical), now closed by a strict organization-claim check.
### Gaps raised
| ID | Gap as raised | Validation | Severity | Resolution in this HLD | Residual |
| G1 | Twenty Community may cap workspaces, and instance-per-tenant would inflate cost | Partly valid. Self-host docs enable many workspaces per instance with the IS_MULTIWORKSPACE_ENABLED flag and state no count, but Twenty's pricing lists unlimited workspaces as an Organization feature, so a licence cap is possible. Cost growth in the fallback is linear (one server and worker per tenant), not exponential, and Q4 removed solo agents from Twenty, leaving about 100 organisation tenants in year 1. | Medium | Day-3 spike confirms the cap. Ladder: multi-workspace Community → Organization licence if cheaper → instance-per-tenant on shared Postgres and Redis, with workers scaled to minimum for idle tenants. Headless Twenty (G2) needs smaller server tasks. | Low |
| G2 | Twenty SSO and row-level permissions are paid; an identity-aware proxy is fragile | Valid, and more serious than stated. The proxy blocks the page but users still hold separate Twenty passwords, leavers disabled in Keycloak keep Twenty accounts and API tokens, and API and webhook paths need bypass rules that can drift on upgrade. That fails the federated-login requirement. | High | Twenty runs headless. No human logs into Twenty by default; only the BFF reaches it, with a per-workspace service key. Pipeline boards, list views and tasks move into the Manager Console, which uses Keycloak SSO natively (estimated 6–8 engineer-weeks, to confirm in week 1). Twenty UI becomes a per-tenant opt-in that requires the Organization licence so Twenty itself does OIDC to Keycloak. The proxy is removed from the Twenty design. | Low |
| G3 | Keycloak is a new critical dependency (detailed in K1–K7 below) | Valid. Keycloak is mature and free, but tenancy model, token binding, SMS OTP, availability and upgrades each need explicit design. | High | Single customer realm with Keycloak Organizations; see K1–K7. | Low |
| G4 | Strapi Document Service middleware is volatile | Partly valid. Middlewares are a documented public Strapi 5 API, not internals, but they are new in v5 and replaced lifecycle hooks, so behaviour may still shift. | Medium | Gate moved off middleware: editor roles have no publish permission (RBAC, long-stable core); only a Core publisher service account publishes, after the Approval Service passes. Middleware stays only for audit events, guarded by a CI contract test, and a nightly job compares published entries with approval records to catch any bypass. | Low |

### Keycloak: federated SSO and tenant isolation
Keycloak 26 made Organizations fully supported: one realm holds many organizations, each with its own members, email domains and linked identity provider, and users can belong to several organizations, with membership reflected in tokens (CNCF, Keycloak 26). Realm-per-tenant is reported to hit practical limits around 500–1,000 realms (Skycloak).
| ID | Keycloak gap | Severity | Resolution | Residual |
| K1 | Wrong tenant model (realm-per-tenant) would not scale and multiplies config | High | Two realms only: workforce for Inadev staff and operators, customers with one Organization per tenant. Realm, clients, flows and themes held as code and applied by config CLI in CI | Low |
| K2 | Federated login required for tenants that have corporate IdPs | High | Per-Organization identity provider (OIDC or SAML: Entra ID, Google Workspace, Okta), identity-first login routed by email domain, first-broker-login links the user to the Organization; tenants without an IdP use Keycloak passwords with MFA; solo agents use phone OTP, optionally Google login | Low |
| K3 | A token from tenant A accepted on tenant B, or a multi-membership user (former agent now an ISP) acting in the wrong tenant | Critical | Login is Organization-scoped: the token carries exactly one active organization; the BFF rejects the call unless that organization equals the tenant resolved from the verified host and the membership is active; Core sets RLS from that claim only; client audience per app; cross-tenant token replay tests in CI | Low |
| K4 | SMS OTP is not built into Keycloak | Medium | Custom authenticator plug-in calling the Messaging Port (SMS or WhatsApp OTP), rate-limited, with contract tests on every Keycloak upgrade | Medium |
| K5 | Keycloak outage stops all logins | High | Clustered across three zones on ECS with the Postgres backend and JDBC-based node discovery; replica in Hyderabad; 10-minute access tokens with refresh so short outages do not sign users out; PWA keeps cached read-only work lists | Low |
| K6 | Upgrade and Java operations burden (four Keycloak feature releases a year) | Medium | Pin versions, upgrade twice a year in staging first, theme and realm as code, one named owner | Low |
| K7 | Leavers keep access in other systems | High | Headless Twenty and service-account-only Strapi publishing leave no human accounts outside Keycloak; Keycloak admin events trigger Core session and API-key revocation | Low |

### Additional isolation and access gaps found
| ID | Gap | Severity | Resolution | Residual |
| G5 | Strapi admin SSO is a paid add-on, so CMS authors would lack federated login | Medium | Tenant marketers build campaign pages from approved blocks in the Manager Console (F62), which writes drafts through the Strapi API; Strapi admin is limited to a small Inadev central content team in the workforce realm. Buy Strapi SSO for that team if CISO requires it | Low |
| G6 | BFF picks the wrong Twenty workspace key, or a forged Twenty webhook is accepted | Critical | Workspace key resolved only from the tenant directory using the verified tenant; client asserts the workspace ID on every response; per-workspace webhook secret and workspace-to-tenant check on inbound events | Low |
| G7 | Pooled Strapi tenant plugin leaks content across tenants | High | Strapi Content API reachable only from the BFF (no public tokens); tenant filter enforced in a policy and re-checked in the BFF; CDN cache key includes host and locale; white-label and Dedicated tenants get their own Strapi instance | Low |
| G8 | Shared Redis keys or job payloads cross tenants | Medium | Cache and queue wrapper that requires a tenant prefix (lint rule bans raw clients); workers re-verify tenant on every job | Low |
| G9 | AI retrieval or prompts mix tenant content | High | pgvector rows under RLS plus tenant and comparison-scope filter before ranking; AI isolation test set in the evaluation gate | Low |
| G10 | Twenty email sync pulls sensitive mail into the CRM | Medium | Already closed in section 11; headless Twenty removes personal mailbox sync entirely | Low |

## 18. Architecture review loop log
The HLD was reviewed in three rounds against a fixed eight-dimension rubric (0–10 each) until every dimension reached 9 or more. The reviewer was Claude acting as a principal architect for regulated Indian insurance SaaS; this is not an independent human review. An independent pass by Inadev's architecture board, CISO and a Twenty/Strapi practitioner is recommended before external circulation.
| Dimension | Round 1 | Round 2 | Round 3 | What closed the gap |
| Resilience | 6.0 | 8.3 | 9.2 | CRM Port with outbox; degraded-mode table per dependency; warm DR in a second India region; game days |
| Extensibility | 7.0 | 8.6 | 9.3 | No-fork rule; Platform Twenty App; Strapi plugin and middleware; ports at every seam |
| Integration with any insurer or vendor | 6.5 | 8.8 | 9.3 | Adapter SPI, capability manifest, declarative mappings, certification checklist, per-insurer bulkheads, tenant-facing API and webhooks |
| Data model extension | 6.0 | 8.5 | 9.2 | Ownership matrix; ranked extension mechanisms; JSON Schema registry; LoB modules; expand-contract migrations; event versioning |
| Robustness | 7.0 | 8.4 | 9.2 | Field ownership and conflict rule; unknown state; sagas; reconciliation; dead-letter operations |
| Scalability | 5.5 | 8.0 | 9.0 | Cells with numeric limits; workspace-density spike; partitioning; measured triggers for search and streaming |
| Data privacy | 5.0 | 8.2 | 9.3 | P3 kept in Core; classification-driven projection; DSR orchestration across all systems; email-sync and attachment controls |
| Cost optimisation | 6.0 | 8.1 | 9.0 | Licence analysis; Postgres-first; serverless containers and spot; workspace archival; per-tenant unit economics |

| Round | Main findings | Actions taken |
| 1 · Draft A | Twenty was planned as master for all customer data, so health and nominee data would sit in a general CRM. One Twenty instance for every tenant. Agent app called Twenty directly, so a CRM outage stopped selling. Strapi Review Workflows assumed free. AGPL and premium gating of unlimited workspaces missed. | Split systems of record (D1); workspace per tenant on cells (D2); Organization licence (D3); custom publish gate (D4); CRM Port (D5). |
| 2 · Draft B | Insurer adapters lacked versioning, certification and capability negotiation. Tenant custom fields could fragment reporting and leak PII. No conflict policy for Party/Person edits. DSR did not reach Twenty or AI logs. Field-user licensing assumed rather than checked. | Adapter SPI and reliability contract (section 9); governed field registry with PII class (section 8); field ownership rule; DSR orchestration; OD-1 raised. |
| 3 · Rev 1.0 | Twenty email sync and attachments could import medical data. No numeric cell limits or solo fallback. No upgrade canary or contract tests. No per-tenant cost view. Night-time reminder scheduling conflicted with messaging windows. | Side-channel controls (section 11); cell limits and density spike (section 10); upgrade strategy (section 16); unit economics (section 15); delivery-window fix (section 13). |

Round 4 · external gap review. Four gaps were raised after round 3: workspace density, Twenty SSO gating, Strapi middleware volatility and Keycloak as a dependency. Validation rated SSO High and found six more, including two Critical cross-tenant leakage paths (token-to-tenant binding and Twenty workspace key selection). All are closed in section 17B by headless Twenty, Keycloak Organizations with federated IdPs, RBAC-based publishing and explicit isolation checks; the only residual Medium is the custom SMS OTP plug-in (K4). Scores after round 4: data privacy 9.5, resilience 9.3, extensibility 9.3, integration 9.3, robustness 9.3, data model extension 9.2, scalability 9.1, cost optimisation 9.0.
Residual items the reviewer accepts as pilot questions, not design gaps: Twenty licence terms and price (OD-1), solo workspace density (OD-2), AI region (OD-3), and validation of all proposed thresholds under real load.
## 19. Evidence register
Research cut-off 3 October 2026. Vendor capabilities and plan contents are as advertised and must be confirmed in the week-1 fit test and licence quotes. Regulatory references are inherited from Rev 3.0 (S01–S41) and remain a design baseline for Compliance/Legal confirmation.
| Ref | Source | Used for |
| H1 | Twenty — Pricing Plans (official docs) | SSO, row-level permissions, audit logs, unlimited workspaces and private source as Organization features |
| H2 | Twenty — Apps (official docs) | Objects, fields, logic functions, sandboxed execution, front components |
| H3 | Twenty — documentation index | Extending standard objects, relations, app roles |
| H4 | Elestio — Self-host Twenty | Auto-generated REST/GraphQL and Metadata APIs; runtime components |
| H5 | Railway — Twenty server + worker template | Two-process model, BullMQ over Redis |
| H6 | Control Plane — Twenty template | Workspace-level schemas in PostgreSQL; HA Postgres option |
| H7 | OpenTechHub — Twenty licence notes | AGPL-3.0 core and separately licensed enterprise code |
| H8 | Strapi — self-hosted pricing | Community vs Growth vs Enterprise feature gating |
| H9 | Strapi — Document Service middlewares | Publish gate design |
| H10 | Strapi — Document Service middleware and lifecycle hooks | Publish and unpublish as first-class actions |
| S06 | MeitY — DPDP Rules 2025 (Rev 3.0) | Fiduciary/processor roles, consent, rights |
| S24 | PostgreSQL — Row Security Policies (Rev 3.0) | RLS and BYPASSRLS caveat |
| S25 | CERT-In Directions, 28 April 2022 (Rev 3.0) | Six-hour reporting, 180-day logs in India |

