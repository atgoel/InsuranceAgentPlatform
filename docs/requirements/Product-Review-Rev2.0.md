> **Superseded by [Requirements Rev 3.0](Requirements-Rev3.0.md).** Kept for history; only its sales-funnel stages and data-model refinements not contradicted by Rev 3.0 are used (see spec 05).

India InsuranceSales Platform
Comprehensive feature catalogue, CRM/CMS choices and lean architecture
Prepared for Atul Goel | Revision 2.0 | 2 October 2026
## Product objective
Enable IMFs and insurance brokers to generate leads, run campaigns, advise prospects, prepare proposals and sell policies through a branded portal and sales workspace. Keep the launch affordable and maintainable. A feature is useful because the business needs it; it does not need to be unique in the market.
## Launch journey
Campaign or referral → landing page → lead → qualified prospect → needs assessment → quote/comparison → proposal and documents → insurer payment/submission → confirmed policy → policy delivery and insurer servicing handoff.
| Decision | Revised scope |
| Primary outcome | Policies sold and attributable premium, with a usable customer/lead database and a repeatable sales process. |
| Post-sale operations | Insurer portal handles endorsements, claims, cancellations and other servicing at launch. Retain these capabilities in the later catalogue. |
| CRM | Compare a small custom sales CRM against an established open-source CRM. Select on total effort, team skills, maintenance and licensing—not breadth of enterprise features. |
| CMS and design system | Use an existing CMS for portal content and campaign pages; a reusable component library controls layout and branding. CRM owns audiences and sales workflows. |
| AI | Optional assistance for extraction, summaries and draft messages. Policy sales must work without AI. |
| Commercial platform | Tenant isolation, basic branding, permissions, backup, audit and data export remain launch essentials. Advanced configuration and enterprise deployment options can wait. |

## What this revision changes
Removes differentiation scoring and revenue-assurance-led positioning. Moves full servicing and advanced commission reconciliation out of launch. Adds ten CMS/content capabilities, a focused CRM data model, an explicit build-versus-adopt cost model and a simpler deployment. Feature IDs F01–F60 are retained; F61–F70 add CMS and portal management.
The catalogue is intended to cover the stated sales-led product and future operations. It is not a claim to enumerate every insurance product worldwide. Stages and dependencies distinguish coverage from a delivery commitment.
Research and platform claims are cited in the evidence register. Estimates are planning assumptions. The detailed implementation specification will follow the CRM/CMS choice and first insurer/product workflow.
# 1. Launch boundary and ownership
| Activity | Our platform at launch | Insurer / later capability |
| Acquisition and campaigns | Branded pages, lead forms, campaign/source IDs, referrals, routing, follow-ups and conversion reports. | Optional lead-source and messaging providers supply channels. |
| Customer and prospect records | Contact/party roles, preferences, interactions, sales opportunities and proposal evidence. | Keep insurer identifiers for reconciliation and handoff. |
| Quote and comparison | Capture insurer quotes or use approved APIs; show verified cover, exclusions, premium and validity. | Insurer owns pricing, eligibility, underwriting and acceptance. |
| Proposal and payment | Collect confirmed data/documents; submit or assist via approved insurer workflow; track payment and issuance separately. | Insurer approves proposal, collects/settles premium through agreed route and issues policy. |
| Sold policy and delivery | Record insurer policy number, product, dates, premium, selling person, document/reference and handoff. | Insurer policy system remains authoritative. |
| Post-sale servicing | Display approved insurer portal/contact links and instructions. No integrated service-case engine. | Insurer handles endorsements, claims, cancellation, refund and detailed service status; platform workflows are later scope. |
| Customer enquiries and complaints | Provide contact, disclosure and escalation details; route misdirected requests. Maintain only the minimum evidence required for our role. | Outsourcing service execution does not automatically remove intermediary obligations; validate tenant duties. |
| Renewals and commission | Basic renewal sales reminders and expected/received commission records. | Advanced servicing, matching, disputes, payout automation and accounting integrations follow later. |

## Minimum customer experience
Public product/campaign portal plus authenticated proposal save/resume, document upload and purchase confirmation. Customer account is optional until a journey needs authentication. A full policy wallet and customer-service portal are later additions. Staff need a sales workspace; marketers need CMS author/editor access.
## Identity and privacy boundary
Roles: platform admin, tenant admin/principal officer, sales manager, salesperson, operations user for pre-sale checks, finance reader, CMS author, CMS publisher and prospect/customer. Sales qualification and tenant registration remain distinct. Use insurer-approved deep links; customers authenticate with the insurer directly. Never store insurer passwords or silently copy customer credentials.
Insurer handoff can transfer a lead/transaction reference only through an agreed, consented integration. Do not put personal or medical data into URL query strings. Show clearly when the customer is moving to an insurer site. [S03–S05]
# 2. CRM: custom versus established
A sound data model substantially reduces custom CRM risk, but it does not eliminate the work of permissions, search, imports, task UX, audit, security patches and upgrades. Compare the same bounded sales scope on both routes.
| Factor | Small custom CRM | Established CRM |
| Initial delivery | Build only leads, parties, opportunities, activities, quotes, proposals and sold-policy records. More initial UI/testing work. | Contacts, pipelines, tasks and common screens already exist. Insurance entities and portal integration still need implementation. |
| Stack and maintainability | Can use the same TypeScript stack as the portal/CMS and familiar PostgreSQL. Team owns every defect and enhancement. | Product conventions and upgrades are shared with a community/vendor. Team must support the chosen runtime and extension model. |
| Insurance data fit | Natural proposer/insured/payer, quote versions and insurer submission model. No generic CRM mapping layer is necessary. | Custom entities can cover insurance. Deep core modifications or forced mappings increase future upgrade costs. |
| Feature cost | No CRM seat fees for code you own; development and operations dominate. Resist requests to recreate a full CRM suite. | Open-source can reduce licence cost; advanced workflows, connectors and support may cost extra. Hosting is not maintenance. |
| SaaS / white-label | Designed for tenant scope, branded portals and controlled extensions. Those controls must be built and tested. | Verify tenant isolation and redistribution/extension licences. A multi-company setup is not automatically secure SaaS isolation. |
| Best fit | Stable sales scope, strong existing Node/TypeScript team and substantial insurance-specific workflows. | Urgent launch with mostly standard CRM behavior and available skills to configure and maintain that product. |

## Recommendation for this product
Use a lean custom sales CRM as the provisional design if the delivery team is already comfortable with TypeScript/PostgreSQL and the scope below stays small. This choice is about maintaining one familiar stack and a clear insurance model, not creating a differentiating CRM. Do not claim that custom is automatically cheaper.
Before committing, give an established CRM five working days to prove fit. Adopt it if it covers at least 80% of launch CRM acceptance scenarios through configuration/extensions, needs no core fork, and its realistic three-year cost is lower. The 80% threshold is a proposed decision rule, not a market benchmark.
Test: tenant isolation; lead capture and deduplication; two opportunities for one customer; multi-insured proposal; quote-to-policy tracking; branded portal handoff; export; and one upgrade with extensions intact. Record effort and blockers. Select one customer/lead system of record.
# 3. CRM shortlist and cost model
| Option | Practical evaluation |
| Frappe CRM | Leading low-cost adoption candidate. Self-hosting carries no CRM licence charge; allow for hosting, implementation and support. Python/Frappe skills and AGPL obligations must fit your delivery model. [S17, S26] |
| Frappe Framework + custom app | MIT framework can accelerate forms/admin and custom entities. This is framework-assisted custom development, not adopting a complete CRM; assess effort accordingly. [S17] |
| EspoCRM | Candidate for straightforward sales CRM with custom entities. Workflows are an Advanced Pack feature; account for extension licences and SaaS terms. PHP/runtime expertise is needed. [S19, S27] |
| Zoho Vertical Studio | A commercial packaged route; useful if operating support savings exceed subscription costs. Per-tenant branding/custom-domain constraints remain unresolved for this scope. [S16] |
| Odoo / Salesforce / LeadSquared | Keep as alternatives or customer integrations. Broad ERP/enterprise scope is not the default for this lean launch. Odoo app licences and commercial redistribution terms require review. [S14, S15, S20] |
| Custom TypeScript CRM | Provisional route with an experienced TypeScript team. Reuse authentication, UI, validation and CMS libraries; build only the bounded sales domain. |

## Illustrative three-year CRM-only cost comparison
This is a transparent scenario, not market pricing or a project quote. Both routes still need portal/CMS and insurer integration work. Substitute actual estimates from the five-day fit check.
| Assumption / cost | Adopt open-source | Custom sales CRM |
| Initial CRM effort at INR 1.5 lakh/person-month | 4 person-months = INR 6.00 lakh | 7 person-months = INR 10.50 lakh |
| Maintenance across 36 months, same labour rate | 0.12 FTE = INR 6.48 lakh | 0.20 FTE = INR 10.80 lakh |
| CRM hosting allowance, INR 5,000/month | INR 1.80 lakh | INR 1.80 lakh |
| Illustrative subtotal | INR 14.28 lakh + paid add-ons | INR 23.10 lakh + paid add-ons |

Excludes taxes, portal/CMS, insurer connectors, messaging, AI, major migration and sales support. Shared hosting may lower allocated infrastructure cost. An established CRM requiring another 6 person-months of integration/upgrade work adds INR 9 lakh and reverses this example’s advantage. A reusable custom codebase may likewise reduce custom effort.
Decision: prefer adoption when the fit test succeeds; prefer custom when a second technology stack or extensive adaptation erases the saving. Require an owner for upgrades, backups and security on either route. Do not buy enterprise features before a launch workflow needs them.
# 4. Focused sales data model
| Entity group | Relationships and minimum information |
| Tenant, branch, user, membership | Tenant owns data; user has role and branch/record scope. Registration and salesperson appointment records control permitted activity. |
| Party, contact point, party relationship | Separate person/company from email/phone. A party can be proposer, insured or payer; household linking is optional. Shared phone numbers do not imply identical people. |
| Lead and opportunity | Lead stores source/campaign and qualification. One party can have several opportunities; each opportunity represents one product need and sales process. Lead conversion preserves original attribution. |
| Activity, task and stage history | Calls, notes, messages, owner, due time, stage changes and lost reason. Timeline belongs to the relevant party/opportunity; enforce record permissions. |
| Insurer and product version | Product/line, insurer, approved distribution channel, UIN/reference, wording version, quote requirements and active dates. |
| Quote and quote option | One opportunity has many quote options. Store coverage, premium components, exclusions/reference, insurer quote ID, expiry and comparison snapshot. |
| Proposal and proposal party | Chosen quote, insurer form version, declarations, proposer/insured/payer role links, validation and customer confirmation. Multiple insured persons use child records. |
| Document and consent evidence | File pointer, classification, source, checksum, retention and access. Consent holds purpose/channel, notice version, evidence time and withdrawal. |
| Submission, payment and policy sale | Separate insurer submission attempt/status, payment reference/status and issued-policy record. Policy number and insurer confirmation establish sale completion. |
| Commission estimate and receipt | Policy-linked expected amount, rule/basis and actual received amount. Simple adjustments initially; statement matching and full subledger later. |
| Campaign and content reference | CRM campaign owns audience, budget and results; it references immutable CMS content/page version IDs. CMS does not own customer profiles. |
| Audit event and job | Actor, action, tenant, resource and timestamp; background job status, idempotency key and retry count. Keep unnecessary personal data out of logs. |

Boundary: no claim, endorsement, service-case or general-ledger tables are required to launch. Later modules attach through party_id, policy_sale_id and insurer references. Keep issued-policy changes append-only or audited; no event-sourcing or bitemporal framework is required for every table.
Use relational keys and typed amounts/dates for the core. Use versioned JSON for insurer proposal answers and modest custom fields. Avoid a generic entity/attribute/value engine. Separate money decimals and currencies; never use binary floating point for financial amounts.
In an adopted CRM, map these entities explicitly. The CRM should own customer/lead/opportunity; a proposal module may own proposal/submission/payment. Share IDs and APIs, not competing copies with uncontrolled bidirectional synchronization.
# 5. CMS, design system and campaigns
| Responsibility | Owner and scope |
| CMS | Pages, banners, approved product summaries, FAQs, articles, navigation, media, localized copy, reusable content blocks, draft/preview/publish and expiry. |
| Design system | Coded components, tokens, responsive behavior, accessibility, permitted layouts and tenant themes. CMS selects approved components; it does not inject arbitrary UI code. |
| CRM / campaign service | Audience/consent, lead capture, owner routing, source attribution, follow-ups, send scheduling, delivery status and conversion. |
| Insurer/product module | Verified premiums, product eligibility, quote validity and proposal questions. CMS marketing text cannot overwrite insurer pricing or policy wording. |
| Messaging provider | Email/SMS/WhatsApp delivery. The platform chooses approved recipients/templates and records outcomes. |

## CMS choice
| Candidate | Fit and decision |
| Payload CMS | Preferred for the custom TypeScript route: MIT core, TypeScript/Next.js, PostgreSQL support, APIs, admin and access control. Drafts/versioning are documented. Publishing workflows/visual editor may be enterprise features; implement only a simple approved/published gate initially. [S28–S31] |
| WordPress | Practical low-cost alternative where editors want conventional page publishing and WordPress skills are available. Keep it on the public-content side and submit leads through the sales API. Budget plugin maintenance and separate PHP hosting. GPL applies. [S32] |
| Strapi | Viable headless CMS alternative. Check self-hosted edition, editor seats and paid feature boundaries against requirements; do not assume cloud pricing equals self-hosted licensing. [S33] |
| Existing CRM website tooling | Potentially fewer moving parts when adopting a platform. Evaluate the same content-authoring scenarios before adding a second CMS; avoid deep customization just to save a small hosting charge. |

## Example campaign flow
A marketer creates a motor-renewal page using approved hero, benefit, FAQ and lead-form blocks. A publisher approves the page and disclosure version. The published page includes campaign/source IDs. The sales API validates and deduplicates submissions, captures consent and creates a lead/task. Conversion is tracked when insurer issuance is confirmed. A CMS page view is not a policy sale.
Portal models: TenantBrand, Page, CampaignPage, ProductContent, FAQ, Article, MediaAsset, Navigation, FormDefinition and DisclosureVersion. FormDefinition contains field layout/validation references, never submitted medical or customer records.
Launch customization: logo, domain, color tokens, approved page blocks, navigation, contact details and selected form fields. Defer a free-form page designer, arbitrary tenant scripts, visual workflow builder and plugin marketplace.
# 6. Feature catalogue — Acquisition and CRM
L = launch; N = later; G = access/contract-dependent. B = buildable, C = configuration/data, I = integration, R = regulatory/contract review, A = AI evaluation. “Lite” is explicitly bounded below. Existing F01–F60 identifiers are preserved.
| ID | Feature and phase boundary | Stage |
| F01 | Tenant setup: legal profile, insurer appointments, permitted products, branches and salesperson eligibility. Operator-assisted onboarding is sufficient. | L · C/R |
| F02 | Staff login: invitations, role/branch/record permissions, privileged MFA and deactivation. Customer login only for authenticated proposal journeys. | L · B |
| F03 | Lead intake: CMS/web forms, CSV, manual entry, referral source and inbound API. Preserve campaign/source and purpose evidence. | L · B |
| F04 | Social/ad lead connectors: Meta and other approved sources; account authorization, mapping, source attribution and duplicate handling. | N · I |
| F05 | Lead allocation: owner assignment, basic round-robin, product/territory eligibility and reassignment. Complex capacity optimization later. | L · C |
| F06 | Sales pipeline: configurable stage names, required fields, task reminders, next action, lost reasons and stage history. | L · B |
| F07 | Customer/party records: proposer, insured, payer and nominee roles; related contacts. Full household analytics later. | L · B |
| F08 | Data import and deduplication: validated CSV, contact normalization, candidate matches, approved merges and rejected-row report. | L · C |
| F09 | Sales customer 360: contact details, opportunities, quotes, proposals, sales, activities and preferences. Detailed claims/service history later. | L · B |
| F10 | Communication: call notes, email and one selected WhatsApp/SMS delivery integration; approved templates, preferences and delivery status. | L · I/R |
| F11 | Campaign execution: campaign IDs, simple audience lists, approved content, scheduling and lead-to-sale attribution. Advanced drip journeys later. | L · C/I |
| F12 | Lead-generation expansion: referral attribution, additional landing templates, telephony, lead marketplaces and ad-platform integrations. Paid referral rewards remain conditional. | N · I/R |

Catalogue inclusion is not a launch commitment. Later scope remains visible so the architecture can accommodate it without implementing it now.
# 7. Feature catalogue — Quote to policy sale
| ID | Feature and phase boundary | Stage |
| F13 | Insurer/product catalogue: approved saleable products, line, UIN/reference, current wording, eligibility, required information and insurer contacts. | L · C/R |
| F14 | Needs capture and quote comparison: verified benefits/exclusions, waiting periods, deductibles, premium and customer selection rationale. | L · C |
| F15 | Quote workspace: capture manual insurer quotes or connected quotes; attach source, validity, assumptions, selected option and shareable comparison. | L · C/I |
| F16 | Proposal forms: insurer/product templates, prefill confirmed facts, validation, save/resume, document collection and explicit declarations. | L · C |
| F17 | Pre-sale operations: missing-document checks, medical/inspection requests, insurer follow-ups, pending/rejected proposals and ownership. | L · C |
| F18 | API quote/submission/issuance: add a contracted insurer/product journey. Launch must have an assisted insurer-portal route if API access is unavailable. | G · I/R |
| F19 | Premium/payment status: insurer-approved links, references and pending/failed/success states; reconcile paid-but-not-issued transactions. No premium custody. | L · I/R |
| F20 | Policy-sale register: insurer-confirmed policy number, product, premium, dates, seller and document/reference; delivery evidence and insurer servicing links. | L · B |
| F21 | Renewal sales: due-date list, reminders, renewal opportunity and quote follow-up. Life installment tracking and lapse/revival workflows expand later. | L · C |
| F22 | Endorsements and servicing: integrated change, correction, nominee, cancellation, free-look and refund requests. At launch, direct the customer to the insurer portal. | N · I/C |
| F23 | Claims assistance: intimation, documents, insurer/TPA status, queries and follow-ups. At launch, insurer portal/contact owns execution. | N · I/C |
| F24 | Customer portal: launch provides proposal save/resume, upload, purchase confirmation and insurer handoff/contact. Full policy wallet, service cases and grievance workflow later. | L lite / N full |

Catalogue inclusion is not a launch commitment. Later scope remains visible so the architecture can accommodate it without implementing it now.
# 8. Feature catalogue — Commission and distribution
| ID | Feature and phase boundary | Stage |
| F25 | Basic commission setup: approved insurer/product rates, new/renewal basis and effective date. Complex slabs and multi-party splits later. | L · C/R |
| F26 | Commission records: expected and received amounts linked to policy sale, with audited adjustments. Full accrual/reversal subledger later. | L lite / N full |
| F27 | Advanced reconciliation: insurer statement import, policy matching, deduction components, partial receipts and discrepancy queues. | N · C |
| F28 | Commission disputes: evidence packs, recovery follow-ups, insurer response and resolution history. | N · B |
| F29 | Distribution payouts: approved payees and split schedules, bank-change controls and maker-checker statements; bank disbursement separately gated. | N · C/R |
| F30 | Finance handoff: export sales and commission records for accountant use. Detailed tax mappings and Tally/Zoho Books synchronization later. | L lite / N full |
| F31 | Accounting expansion: bank matching, forecasts, reviewed fee invoices and accounting connectors. Full accounting remains external. | N · I/R |
| F32 | Salesperson onboarding: qualification/appointment evidence, active products, expiry and activation approval. Full LMS or automatic external verification later. | L · C/R |
| F33 | Team structure: basic branches, managers, assignment and ownership transfer. Complex territory/hierarchy policy later. | L · B |
| F34 | Internal campaigns: assign product drives, approved collateral and sales targets; simple progress dashboard. Contests/rewards need approved rules. | L lite / N full |
| F35 | Sales MIS: leads, activity, conversion, issued policies, premium and commission; source/product/insurer/salesperson breakdown. | L · B |
| F36 | Sales knowledge: approved product notes and SOP links in CMS; training assessments/LMS expansion later. | L lite / N full |

Catalogue inclusion is not a launch commitment. Later scope remains visible so the architecture can accommodate it without implementing it now.
# 9. Feature catalogue — SaaS, privacy and PWA
| ID | Feature and phase boundary | Stage |
| F37 | Consent and preferences: purpose/notice version, channel choice, timestamps and suppression. Retention obligations handled separately. | L · B/R |
| F38 | Privacy operations: field/document permissions, secure uploads, export controls, incident contact and rights-request intake. Automate casework later. | L · B/R |
| F39 | Audit/disclosures: changes to proposals, sales, users, rates and published content; distribution disclosures and evidence retention. | L · B/R |
| F40 | Tenant isolation: scope application records, files, reports, jobs and CMS drafts. No cross-broker customer deduplication. | L · B |
| F41 | White-label portal: tenant logo, domain, theme tokens, sender/contact identity and disclosures. Avoid separate code forks. | L · C/I |
| F42 | Configuration: bounded fields, stage names, forms, templates and feature switches. Defer general-purpose workflow/configuration platforms. | L lite / N full |
| F43 | Sales PWA: installable, responsive lead/tasks/proposal flow with upload and clear retry status. Online-first; offline sensitive data and native apps later. | L · B |
| F44 | SaaS administration: operator provisions tenant/plan/users, usage limits and invoices. Automated signup/subscription billing later. | L lite / N full |
| F45 | Data exit: scoped contact, opportunity, sale and document-manifest exports; controlled deletion subject to retention/holds. | L · B/R |
| F46 | Integration support: credentials, request/reference IDs, error/retry queue, capability flags and manual fallback. No generic integration designer. | L · B/I |
| F47 | Reporting: fixed sales/funnel/commission reports and CSV export. Ad-hoc report designer, BI warehouse and advanced cohort analysis later. | L lite / N full |
| F48 | Enterprise options: dedicated data plane, enterprise SSO, custom keys, private connectivity and stronger SLAs when commercially required. | N · B/I |

Catalogue inclusion is not a launch commitment. Later scope remains visible so the architecture can accommodate it without implementing it now.
# 10. Feature catalogue — AI and conditional integrations
| ID | Feature and phase boundary | Stage |
| F49 | AI document extraction: suggest proposal/policy fields with source and review. Optional launch add-on; manual entry remains fully usable. | N / optional L · A |
| F50 | AI sales assistant: summarize customer context, prepare follow-ups and draft campaign copy; staff approves messages and publication. | N / optional L · A |
| F51 | Product knowledge AI: approved, versioned wording/SOP retrieval with citations and abstention. | N · A/C |
| F52 | Proposal AI: map confirmed facts to approved fields and highlight unanswered questions. Never invent declarations or sign for customers. | N · A/I |
| F53 | Commission AI: explain deterministic mismatches and suggest evidence once reconciliation exists. | N · A |
| F54 | AI skill controls: typed inputs/outputs, tenant authorization, approved tools, human approval, audit and spending limits, introduced with any AI feature. | With AI · B/A |
| F55 | Predictive AI: lead/renewal scores, next-best action and cross-sell suggestions after data and evaluation justify them. | N · A/C |
| F56 | Anomaly detection: duplicate documents and unusual submission/payment/commission patterns, for review only. | N · A/C |
| F57 | DigiLocker / e-insurance repository. Separate requester and repository integrations, consent and partner onboarding. Internal vault remains available without them. [S02, S21] | G · I/R |
| F58 | KYC and signature providers. Authorized CKYC/eKYC/eSign pathways where accepted by the insurer. Provider eligibility and customer consent precede integration. | G · I/R |
| F59 | Bima Sugam / future registry adapter. Contract and capability placeholder only. Quote, submission, attribution and claims APIs require verified onboarding and specification. [S01] | G · I/R |
| F60 | Adjacent products. Corporate RFQ/placement, employee benefits enrollment, marine declarations, reinsurance, native offline app and full accounting are separate product investments. | G · C/R |

Catalogue inclusion is not a launch commitment. Later scope remains visible so the architecture can accommodate it without implementing it now.
# 11. Feature catalogue — CMS and portal
| ID | Feature and phase boundary | Stage |
| F61 | Portal content: home/product/contact pages, navigation, FAQs, articles and tenant contact/disclosure blocks; drafts, preview and publishing. | L |
| F62 | Campaign pages: reusable landing-page templates, lead forms, campaign/source tracking and approved calls to action. | L |
| F63 | Content approval: author/publisher roles, approval state, version history and rollback. Scheduled publishing/expiry may begin as manual actions. | L lite / N full |
| F64 | Design system: reusable accessible components, form patterns, status labels, mobile layouts and tenant branding tokens. | L |
| F65 | Assets and collateral: images, brochures, approved wording/disclosures, product association and expiry/version control. Keep customer uploads elsewhere. | L |
| F66 | Localization and SEO: localizable labels/content, English/Hindi initial templates, metadata, canonical URLs, sitemap and social preview. | L basic / N full |
| F67 | Product content governance: insurer/UIN reference, approved wording link, effective date and stale-content warning. Marketing copy cannot set premiums. | L |
| F68 | Forms and attribution: field definitions with validation references, consent text version, anti-spam, campaign IDs and sales API submission. | L |
| F69 | Campaign optimization: page analytics, A/B experiments, conversion dashboards and content personalization. Avoid sensitive profiling. | N |
| F70 | Advanced portal management: visual page designer, reusable site templates, multi-site publishing, approval workflow builder and richer editorial governance. | N |

## Coverage of the original attachment
Core CRM, leads, funnel, communication and segmentation → F03–F12. Quote/proposal/issue → F13–F20. Renewals → F21. Servicing/claims → F22–F24 later. Commissions/accounting → F25–F31. Teams/internal campaigns → F32–F36. Compliance/privacy → F01/F32/F37–F40. SaaS/PWA/white-label → F41–F48. AI → F49–F56. DigiLocker/KYC/Bima Sugam → F57–F59. Corporate/other lines → F60. CMS/portal content → F61–F70.
The original full P&L/balance sheet/trial balance stay in external accounting; the product can integrate later. Bima Sugam and e-insurance repositories stay conditional. QuickBooks India is removed because Intuit discontinued it. [S01, S02, S07, S21]
Competitor products remain useful coverage references, not a differentiation scorecard: InsuredBoard, InsureFlow, Ensuredit, insureMO, LeadSquared and Salesforce. Whether a feature is already available elsewhere does not affect its inclusion. [S10–S15]
# 12. Lean technical architecture
## Provisional custom route
Use a TypeScript modular application, PostgreSQL, private object storage and one background worker. Reuse a CMS and established identity/UI libraries. Keep the number of frameworks and operational services low.
| Component | Recommendation |
| Public portal / PWA | React/Next.js for a new TypeScript portal if choosing Payload; shared UI components for staff and customer sales journeys. If Angular is already staffed and reusable, keep it and run Payload headlessly. |
| CMS | Payload manages content collections, media and editorial permissions. Its admin/API/database capabilities can accelerate admin work; it is not an out-of-the-box CRM. [S28–S31] |
| Sales domain | Leads, opportunities, proposals, payment/issuance tracking and sales records. Start with explicit domain modules in the same codebase; add a separate NestJS service only if existing team assets or API boundaries justify it. |
| Database | One managed Postgres instance initially, with separately owned CMS and sales databases/roles or strictly managed schema boundaries. One migration owner per table; CMS migrations must never recreate sales tables. |
| Identity | Use one established identity approach for staff/customer journeys, with an adapter for CMS editorial access. Do not build password/OTP cryptography. Reuse Keycloak only if the team can operate it economically. |
| Jobs and connectors | A durable job table/worker can start imports, reminders and insurer-status checks. Add a managed queue as traffic warrants. Persist an outbox for reliable side effects; keep retries idempotent. [S23] |
| Hosting | Approved India hosting, managed database/backups, container deployment, private object storage, secrets and monitoring. Size for measured pilot volume; do not require EKS, Kafka, service mesh or a warehouse at launch. |
| Adopted CRM alternative | Existing CRM owns leads/customers/tasks, an insurance extension/module owns proposals and sales, and CMS owns content. Reuse CRM portal/site tooling if adequate. Integrate by APIs with clear field ownership. |

## Tenant isolation and bounded customization
Resolve the tenant from verified domain and authenticated membership; never trust a caller-supplied tenant ID alone. Apply tenant and record permissions to database access, documents, CMS previews, reports and worker jobs. For custom Postgres use RLS where compatible and tested, including non-owner runtime roles and transaction-scoped tenant context. [S24]
For an established CRM, prefer a supported isolated-site/instance pattern over retrofitting pooled tenancy. Automate provisioning only after the second or third customer demonstrates the process. Branding and allowed field/stage settings are configuration; customers do not receive code forks.
Simple deployment does not justify weak privacy: enforce privileged MFA, encryption, access logging, secure uploads, credential rotation, backups and tested restore. Shared public content caches must never contain customer or draft data.
# 13. Sales reliability and AI implementation
## A sale is confirmed by the insurer
Keep opportunity, proposal, payment and issuance status separate. The sales funnel may display: new → contacted → qualified → quote shared → proposal complete → insurer pending → issued/lost. Payment success alone cannot move a deal to issued. Persist insurer reference, source and last-observed status.
If an insurer submission times out, mark it unknown and query/reconcile before retrying. Reuse an idempotency key; never create a new sale or charge on a blind retry. Where no API exists, record the assisted insurer-portal transaction and evidence. Do not scrape portals or bypass access controls.
## A few explicit contracts
| Interface | Contract |
| CMS → sales lead API | Tenant/page/campaign IDs, source metadata, validated customer answers and consent version. Public forms are untrusted: anti-spam, allowlisted fields and server-side tenant routing. |
| Submit proposal | Authenticated tenant/user, proposal version and idempotency key. Freeze submitted declarations. Return accepted/pending operation reference, not a guessed policy number. |
| Insurer callback/status | Verify sender/signature where available; deduplicate events; preserve raw reference and normalized status; reject stale transitions. |
| Campaign send job | Authorized campaign/content version and recipient reference. Recheck suppression at send time; record delivery outcome and prevent duplicate sends. |
| CMS publishing | Content version, author/approver and approved state. Sanitize content; preview is authenticated and must not leak drafts into public caches. |

## AI as optional assistance
Start with one useful skill: extract confirmed proposal fields from an authorized document, or draft a salesperson follow-up. Require staff review before writing declarations or sending messages. No AI-generated premium, coverage guarantee or unauthorized insurer submission.
A skill contract includes input/output schema, authorized tenant/actor, allowed data/tools, model/prompt version, timeout, cost limit and approval rule. Read/draft-only skills do not need a multi-agent framework. Evaluate field accuracy and source grounding on real representative samples before activation.
## Privacy and insurer handoff
Collect the minimum information needed at each funnel stage. Do not request medical documents just to capture a lead. Keep public CMS media separate from private proposal documents. Marketing consent, proposal declarations and insurer sharing purposes are distinct records. Retain statutory evidence even when routine processing stops, under a reviewed retention policy. [S06]
Post-sale portal links, insurer contact details and delivery acknowledgement complete the initial handoff. Keep a minimal route for customer enquiries and any intermediary obligations; detailed service operations remain with the insurer. [S03–S05]
# 14. Delivery, cost control and acceptance
| Phase | Deliverable and exit condition |
| Week 1: decide the foundation | Five-day CRM fit test, CMS editor demo, first insurer/product workflow and data-model agreement. Select one architecture and identify API access gaps. |
| Weeks 2–4: capture and follow up | Tenant/user setup, CMS pages/forms, leads, customers, activities, routing, consent and basic pipeline. A marketer can publish a page and sales staff can act on its leads. |
| Weeks 5–8: convert to sale | Quotes, comparison, proposal forms, documents, insurer-assisted submission/payment and issue confirmation. Demonstrate a complete sale with no live API dependency. |
| Weeks 9–12: pilot readiness | Commission basics, source-to-sale reports, white-label settings, PWA, import/export, audit, restore and security checks. Run a pilot with two isolated tenants. |
| Weeks 13–16: contingency / integration | Use only where insurer UAT, data migration or pilot feedback requires it. Add a contracted API or optional AI skill without blocking the assisted sales journey. |

Planning range: roughly 10–16 weeks for a bounded launch, assuming an experienced small team, usable insurer processes and limited product/form variants. This replaces the larger operations-heavy plan. API access, formal approvals and partner turnaround are external dependencies, not guaranteed timelines.
## Keep the budget tied to the chosen scope
Illustrative full-launch effort envelope: 8–12 person-months × INR 1.5 lakh loaded monthly cost = INR 12–18 lakh; with 20% contingency, INR 14.4–21.6 lakh. Includes bounded CRM/CMS/portal implementation and basic integration work; excludes taxes, commercial licences, recurring cloud/messaging/AI fees, substantial data cleanup and multiple complex insurer connectors. Replace with measured estimates after the foundation check.
Do not add this full-launch estimate to the CRM-only comparison: they overlap. Ongoing cost = cloud/backup/monitoring + third-party licence/connector fees + messaging/AI usage + support and maintenance labour. Use per-tenant usage limits and a monthly cost report; defer paid tools until needed.
## Launch acceptance
1. A marketer publishes an approved branded campaign without a developer. 2. Its lead is validated, deduplicated, attributed and assigned. 3. Staff complete quote/proposal and obtain insurer-confirmed issuance. 4. Payment retries and callbacks do not duplicate transactions. 5. Policy delivery includes the correct insurer servicing route. 6. Two tenants cannot access each other’s records, files or CMS drafts. 7. Export and restore work. 8. Required disclosures, suppression and audit evidence are present.
Primary KPIs: leads by source, contact rate, quote-to-proposal rate, proposal-to-issued rate, time to issue, issued premium and commission expected/received. Report acquisition cost where campaign-spend data exists. Later service KPIs should not drive launch scope.
Next review needs only the first product/insurer combinations, available API/portal access and the delivery team’s strongest stack. Those inputs finalize custom-versus-adopt and the implementation specification. No requirement to invent new differentiating capabilities remains.
# 15. Evidence register
Research cut-off: 2 October 2026. Vendor capabilities are advertised/documented, not production-validated here. Architecture choices, fit thresholds, costs and schedules are proposals. Original references are retained for later catalogue items as well as launch scope.
[S01] IRDAI — Bima Sugam regulations, 2024
https://irdai.gov.in/document-detail?documentId=4583640
Official index discovered; marketplace framework. Production API/access remains a gate.
[S02] IRDAI — Insurance Repository FAQ
https://irdai.gov.in/faq-on-insurance-repository
Official search evidence distinguishing regulated repositories from a broker document vault.
[S03] IRDAI — Insurance Marketing Firm department / FAQs
https://irdai.gov.in/department/insurance-marketing-firm
Official baseline. Current amendments and each tenant’s registration must be checked before numeric rules are configured.
[S04] IRDAI — Brokers
https://irdai.gov.in/intermediaries/brokers
Official description of direct broker and permitted activities; not a substitute for amended regulations.
[S05] IRDAI — Insurance Self Network Platform
https://irdai.gov.in/insurance-self-network-platform-isnp-
Official baseline for online insurance distribution; launch applicability requires current review.
[S06] MeitY — Digital Personal Data Protection Rules, 2025
https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
Official Gazette; Rule 1 commencement and Rules 13/15 transfer provisions. English section starts at PDF page 24.
[S07] Intuit — QuickBooks India service notice
https://quickbooks.intuit.com/in/resources/technology/why-you-should-focus-on-local-seo/
Official site carries India discontinuation notice; no access from 1 July 2023.
[S08] Reuters — proposed distribution reform, 29 September 2026
https://www.reuters.com/commentary/breakingviews/indias-big-insurance-overhaul-will-test-demand-2026-09-29/
Secondary current-event evidence. Consultation watch only; not an enacted rate table.
[S09] IRDAI 2026 cyber circular, reproduced by TaxGuru
https://taxguru.in/corporate-law/irdai-information-cyber-security-guidelines-2026.html
Secondary reproduction dated 6 April 2026, with official annexure links. Obtain signed official annexures for clause-level compliance mapping.
[S10] InsuredBoard — product site
https://insuredboard.com/
Vendor claims: policy CRM, PWA and one-tap WhatsApp.
[S11] InsureFlow India — product site
https://insureflow.biz/
Vendor claims and customized source-code delivery proposition; distinct from similarly named overseas products.
# 15. Evidence register — continued
Research cut-off: 2 October 2026. Vendor capabilities are advertised/documented, not production-validated here. Architecture choices, fit thresholds, costs and schedules are proposals. Original references are retained for later catalogue items as well as launch scope.
[S12] Ensuredit — ICE
https://www.ensuredit.com/ice.html
Vendor claims: distribution, operations, finance and compliance modules.
[S13] insureMO — API platform
https://insuremo.com/en/platform/api-platform
Vendor platform description; tenant-specific Indian carrier rights require validation.
[S14] LeadSquared — insurance CRM
https://www.leadsquared.com/insurance-crm/
Vendor insurance sales and engagement capabilities.
[S15] Salesforce — insurance brokerage platform
https://www.salesforce.com/in/financial-services/insurance-brokerage-management-software/?bc=OTH
Vendor brokerage capability reference; not proof of India insurer integration.
[S16] Zoho Vertical Studio — official FAQ
https://help.zoho.com/portal/en/kb/zoho-vertical-studio/overview/articles/vertical-studio-faqs
Official limits on mobile app, data centres, customization and custom domains; reconcile conflicting branding language commercially.
[S17] Frappe — License and Trademark
https://docs.frappe.io/legal/others/license-and-trademark
Official policy updated 28 June 2026; framework/application licences are different.
[S18] Frappe Framework — sites
https://docs.frappe.io/framework/user/en/basics/sites
Official technical documentation for site model.
[S19] EspoCRM — licence and extensions
https://www.espocrm.com/open-source/
Official core licence. Extension agreement: https://www.espocrm.com/extension-license-agreement/
[S20] Odoo — licences
https://www.odoo.com/documentation/19.0/th/legal/licenses.html
Official indexed documentation for Community and Enterprise licensing; validate selected release and modules.
[S21] API Setu — DigiLocker partner resources
https://apisetu.gov.in/digilocker
Official requester/issuer API documentation, terms and onboarding SOP.
[S22] TRAI — Advice to Senders
https://www.trai.gov.in/advice-to-senders
Official guidance on sender registration and consent/templates.
# 15. Evidence register — continued
Research cut-off: 2 October 2026. Vendor capabilities are advertised/documented, not production-validated here. Architecture choices, fit thresholds, costs and schedules are proposals. Original references are retained for later catalogue items as well as launch scope.
[S23] AWS — Transactional outbox pattern
https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
Official engineering reference for state/event consistency and duplicate handling.
[S24] PostgreSQL — Row Security Policies
https://www.postgresql.org/docs/current/ddl-rowsecurity.html
Official documentation; owner, superuser and BYPASSRLS exceptions matter.
[S25] CERT-In — Directions, 28 April 2022
https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
Official indexed direction for incident reporting and ICT logs; obtain current amendments for launch register.
[S26] Frappe CRM — pricing and self-hosting
https://frappe.io/crm/pricing
Official self-hosting/licence-cost statement; hosting and maintenance remain separate.
[S27] EspoCRM — workflows and entity manager
https://www.espocrm.com/features/workflows/
Official: workflows are an Advanced Pack feature. Custom entities: https://www.espocrm.com/features/entity-manager/
[S28] Payload — MIT licence
https://github.com/payloadcms/payload/blob/main/LICENSE.md
Official repository licence; review separately licensed enterprise functionality.
[S29] Payload — product architecture
https://payloadcms.com/docs/getting-started/what-is-payload
Official TypeScript/Next.js, admin, API and access-control overview; enterprise features are separately identified.
[S30] Payload — versions and drafts
https://payloadcms.com/docs/versions/overview
Official version history, draft and access-control documentation.
[S31] Payload — PostgreSQL adapter
https://payloadcms.com/docs/database/postgres
Official adapter/migration documentation; maintain explicit schema/table ownership.
[S32] WordPress — licence
https://wordpress.org/about/license/
Official GPL licensing; implementation choice remains an engineering assessment.
[S33] Strapi — pricing
https://strapi.io/pricing-cloud
Official cloud offering. Request current self-hosted edition/feature terms before comparing total costs.
