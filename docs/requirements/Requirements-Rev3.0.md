India Insurance
Distribution Platform
SaaS and white-label sales, advice and retention platform for IMFs, brokers and individual agents — feature catalogue, launch scope, commercial model and lean architecture
Prepared for Atul Goel | Revision 3.0 | 2 October 2026
## Product objective
Give insurance distributors one mobile-first workspace to acquire leads, research and advise, sell across their permitted insurers, retain their book through renewals and track their own income. Insurance Marketing Firms (IMFs) are the launch anchor; brokers and individual agents are first-class target users of the same platform. The product is sold as multi-tenant SaaS and as a white-label platform under the distributor’s own brand.
AI removes effort — reading policy documents, drafting vernacular messages, turning voice notes into CRM records and answering product questions from approved content — but every sale, renewal and record still works without AI.
## Positioning
| Audience | One-line value proposition |
| Individual agent | Your whole book, every renewal and every follow-up in one app — in your language, with AI that reads policies, drafts WhatsApp messages and never lets a premium due slip. |
| IMF | Run your ISP/POSP network across up to six insurers per line with one branded platform: supervised selling, compliance evidence, renewals and commission visibility from day one. |
| Broker | Market-wide comparison, documented advice and renewal retention for retail and SME books, on your own brand and domain, without building or maintaining software. |
| White-label buyer | Launch your own branded distribution app and portal in weeks: your domain, sender identities and legal terms, on a platform someone else secures and upgrades. |

Wedge versus the market: the distributor keeps its own licence, brand, customers and data (unlike aggregator-backed POSP platforms), sees a multi-insurer book in one place (unlike single-insurer agent apps), and gets vernacular, AI-assisted daily operations (unlike generic CRMs). Competitor products remain coverage references, not a scorecard. [S10–S15, S38]
## End-to-end journey
Campaign, referral or existing book → lead or held policy → qualified prospect → needs analysis and product research → permitted comparison and quote → benefit illustration/disclosures → proposal and documents → insurer payment/submission → insurer-confirmed policy → delivery and servicing handoff → premium-due and renewal cycle → cross-sell → commission and persistency tracking.
## Launch decisions
| Decision | Revision 3.0 scope |
| Launch customer | IMFs first (2–3 pilot tenants, 50–200 ISPs/POSPs). Solo-agent invite beta in parallel. One broker design partner during pilot; brokers onboard at general availability. |
| Primary outcome | Issued, attributable premium plus retained renewal premium, on a customer and policy database the distributor owns. |
| Book and renewals | Moved into launch: book import, premium-due calendar, lapse/revival tracking and a lightweight servicing tracker. Full integrated servicing and claims remain later. |
| Research and advice | Moved into launch: needs-analysis calculators, product research library, benefit-illustration evidence and distributor-aware comparison. |
| AI | Four bounded, human-approved AI skills at launch (policy reader, vernacular drafting, voice-to-CRM, grounded product assistant). AI is a headline feature but never a dependency. |
| Commercial model | Multi-tenant SaaS (Solo, Team, Business) plus White-label at launch; Dedicated deployment later. Pricing is a pilot hypothesis, not a commitment. |
| CRM and CMS | Provisional lean custom TypeScript sales CRM plus Payload CMS, subject to the five-day adoption fit test. The expanded agent scope strengthens the custom case. |

## What this revision changes
| Area | Change from Revision 2.0 |
| Personas | Adds an explicit IMF / broker / individual-agent model with regulatory position, needs and buying route. Corrects a structural point: individual agents are solo tenants, not members of an IMF. |
| Features | Retains F01–F70 with revised stages and a fit column; adds F71–F100 for book of business, research and advice, agent productivity, vernacular, AI launch skills, distribution network and commercial packaging. |
| Commercial | Adds plan tiers, white-label packaging, pricing hypotheses, go-to-market sequence, data-ownership rules and adoption KPIs. |
| Compliance | Adds a persona-wise regulatory control matrix (tie-up limits, comparison scope, advertisement approval, rebating, commission policy, online solicitation, DPDP, messaging, cyber). |
| Delivery | Replans to 18–20 weeks with a larger, bounded team; adds AI evaluation gates, white-label and solo-signup acceptance criteria, a risk register and a review log. |

Research and platform claims are cited in the evidence register. Regulatory statements are a design baseline that must be confirmed by Compliance/Legal against current IRDAI regulations before configuration. Estimates, thresholds and prices are planning assumptions.
# 1. Market and personas
The three audiences share most of the sales and retention journey but differ in regulatory position, product scope and how they buy. The platform models these differences as configuration on a Distributor Entity, not as separate products.
| Persona | Regulatory position (verify per tenant) | What they need most | How they buy | Launch status |
| IMF | IRDAI-registered firm; sells through Insurance Sales Persons (ISPs) and POSPs; tie-ups with up to six insurers in each of life, general and health. [S03, S34] | ISP/POSP onboarding and supervision, multi-insurer selling, branded portal, compliance evidence, renewals, commission across insurers. | Team or Business SaaS; White-label for larger firms. | Primary. 2–3 pilot tenants. |
| Broker (direct/composite) | Represents the client; may advise and compare across the market; uses employees and POSPs; Principal Officer accountable. [S04] | Market-wide comparison, documented advice, retail/SME renewals, POSP network, branded portal. | Business SaaS, White-label; Dedicated later. | Design partner in pilot; GA onboarding. |
| Individual agent | Appointed by insurers; currently one insurer per line, with open architecture for agents proposed but not yet in force; cannot simply join an IMF while holding an agency licence. [S36–S38] | Book and renewals, daily plan, WhatsApp in own language, calculators, personal branding, income and persistency tracking. | Solo plan (freemium to paid); later via insurer agency channels. | Invite-only beta (100–300 agents). |
| ISP / POSP | Salesperson inside an IMF or broker tenant; POSP limited to specified simple products. | Simple mobile flow, permitted products only, quick quotes, follow-ups, own earnings view. | Seat within tenant plan. | Launch, inside IMF tenants. |
| Insurer agency channel | Insurer deploying the tool to its tied agents and agency managers. | Agent productivity, adoption analytics, insurer-approved content. | White-label or channel licence. | Later (G). Architecture-ready. |

## Structural rules that follow
A Distributor Entity has a type (IMF, broker, individual agent, later corporate agent), registration number and validity, Principal Officer where applicable, and tie-ups per line of business with configurable limits. Limits are data, not code, because IRDAI has changed them before and agent open architecture is under discussion. [S34, S37]
Comparison scope, product eligibility and advertisement approval rules derive from the entity type and its tie-ups. A broker can compare across configured insurers; an IMF or agent sees only products of insurers it is tied to; a POSP sees only POSP-eligible products.
A person may hold memberships in more than one tenant over time (for example, a former agent who later works as an ISP), but each membership is a separate identity scope. No customer data crosses tenants, and no cross-tenant deduplication is performed.
# 2. Commercial model: SaaS and white-label
| Plan | Who and what | Branding and deployment | Stage |
| Solo | Individual agent. Book, renewals, CRM, calculators, research, branding, WhatsApp click-to-chat, AI credits within limits. Freemium entry with paid Pro. | Platform brand with agent card/microsite. Pooled tenancy. | L (beta) |
| Team | Small IMF or broker (up to an agreed seat count). Adds hierarchy, ISP/POSP onboarding, shared campaigns, manager MIS. | Tenant logo, colours and subdomain. Pooled. | L |
| Business | IMF or broker with branches. Adds CMS portal, WhatsApp Business API templates, advanced reporting, imports, data export, priority support. | Custom domain, tenant theme, sender identities. Pooled. | L |
| White-label | Distributor or insurer channel selling under its own brand. Adds full brand kit, branded installable app, tenant legal documents, optional powered-by removal, sub-tenant support later. | Own domain, DLT headers and WhatsApp number registered by the client entity; pooled data plane with strict isolation. | L (1 pilot) / N scale |
| Dedicated | Large broker, IMF group or insurer. Isolated data plane or instance, enterprise SSO, customer-managed keys, private connectivity, stronger SLAs. | As White-label, plus isolated infrastructure. | N / G |

## Pricing hypotheses to test
These are placeholder ranges for willingness-to-pay interviews during the pilot, not market benchmarks or quotes. Solo: free tier with limits on customers and AI actions; Pro around INR 299–599 per agent per month. Team/Business: around INR 400–800 per active user per month plus a tenant platform fee. White-label: one-time setup around INR 3–8 lakh plus an annual platform fee. AI and messaging usage are sold as included credits with metered overage.
Avoid pricing linked to premium or commission (for example, a percentage of commission earned) until Legal confirms it does not create fee-sharing, outsourcing or remuneration concerns under insurer commission policies and IRDAI rules. Subscription fees are paid by the distributor, never collected from or rebated to policyholders. [S39, S40]
## White-label packaging
| Element | Launch scope and boundary |
| Brand kit | Logo, colour tokens, typography choice from an approved set, favicon, email templates, PDF letterheads and share-card frames. No code forks. |
| Domain and app | Custom domain with managed TLS; installable branded PWA at launch. Store-listed app wrapper under the client’s developer account is later scope. |
| Sender identities | Email domain, SMS headers/templates and WhatsApp Business number are registered by the client legal entity; the platform stores references and enforces templates. [S22] |
| Legal and disclosures | Tenant privacy notice, terms, grievance contacts, registration numbers and mandatory disclosures rendered from tenant configuration. |
| Data roles | The distributor is expected to act as data fiduciary and the platform as data processor; confirm per contract with a data processing agreement. [S06] |

## Go-to-market sequence
| Wave | Motion and exit condition |
| A. IMF pilot | Weeks 15–18. 2–3 IMFs, assisted onboarding and book migration. Exit: issued policies through the platform, weekly active ISPs above target, renewals tracked for imported books. |
| B. Solo beta | Parallel with wave A. Invite agents through agent communities, agency managers and IMF referrals (non-monetary or compliant incentives only). Exit: activation and 4-week retention targets, first paid conversions. |
| C. Broker and GA | After pilot fixes. One broker design partner moves to production; Business and White-label plans open; insurer channel conversations start. |

Switching-cost killer: assisted, AI-supported import of the distributor’s existing book (F71, F87). Without it, agents face double entry and will not adopt.
# 3. Launch boundary and ownership
| Activity | Our platform at launch | Insurer / later capability |
| Acquisition and campaigns | Branded pages, agent microsites, lead forms, campaign/source IDs, referrals, routing, follow-ups and conversion reports. | Ad-platform and lead-marketplace connectors later; insurer approval where advertisement rules require it. |
| Customer and book of business | Parties and roles, preferences, interactions, opportunities, and held policies imported from the existing book (sold elsewhere or before the platform). | Insurer policy system remains authoritative; imported data is labelled with source and as-of date. |
| Research and advice | Needs-analysis calculators, product research library, distributor-aware comparison, suitability notes and benefit-illustration evidence. | Insurer owns product terms, benefit illustration logic, pricing and eligibility. |
| Quote and comparison | Capture insurer quotes or use approved APIs; show verified cover, exclusions, premium and validity within permitted scope. | Insurer owns pricing, underwriting and acceptance. |
| Proposal and payment | Collect confirmed data/documents; submit or assist via approved insurer workflow; track payment and issuance separately. | Insurer approves proposal, collects premium through agreed route and issues policy. |
| Sold policy and delivery | Record insurer policy number, product, dates, premium, seller, document reference, delivery evidence and servicing route. | Insurer policy system remains authoritative. |
| Renewals and premium dues | Due calendar, grace and lapse tracking, revival follow-ups, renewal opportunities, reminders and maturity/survival alerts. | Insurer collects premium and decides revival; payment links come from insurer-approved routes. |
| Servicing and claims | Lightweight servicing tracker: log the customer request, insurer reference, status, follow-up date and insurer portal link. | Insurer handles endorsements, claims, cancellations and refunds; integrated service workflows are later scope. |
| Agent business | Expected/received commission, targets, persistency, licence and training calendar. | Statement matching, disputes, payouts and accounting integrations later. |
| Customer enquiries and complaints | Contact, disclosure and escalation details; route misdirected requests; minimum evidence for our role. | Outsourced execution does not remove intermediary obligations; validate each tenant’s duties. |

## Minimum experience by user
| User | Launch experience |
| Agent / ISP / POSP | Mobile-first app (installable PWA): today’s plan, leads, customers, held policies, dues, quotes, proposals, calculators, research, share cards, voice notes and AI drafts. |
| Manager / Principal Officer | Web console: team pipeline, supervision queues, onboarding approvals, advertisement approvals, MIS, persistency and compliance evidence. |
| Marketer / CMS author | Approved page blocks, campaign pages, collateral library, greeting templates and publishing with approval. |
| Customer | Public pages and agent microsite, authenticated proposal save/resume, document upload, purchase confirmation and insurer servicing handoff. Policy wallet is later. |
| Platform / white-label operator | Tenant provisioning, plans, brand kits, domains, usage and cost reports, support tooling. |

## Identity and privacy boundary
Roles: platform admin, white-label operator, tenant admin, Principal Officer, branch manager, sales manager, ISP, POSP, employee salesperson, solo agent (owner and seller), operations user, finance reader, CMS author, CMS publisher, compliance reviewer and prospect/customer. Salesperson qualification, appointment and tenant registration remain distinct records.
Use insurer-approved deep links; customers authenticate with the insurer directly. Never store insurer passwords or silently copy customer credentials. Do not put personal or medical data into URL query strings, and show clearly when the customer is moving to an insurer site. [S03–S05]
# 4. CRM: custom versus established
A sound data model reduces custom CRM risk but does not remove the work of permissions, search, imports, task UX, audit, security patches and upgrades. Revision 3.0 adds agent-specific scope — held policies, premium schedules, vernacular UI, offline-tolerant mobile and AI skills — that generic CRMs rarely cover without heavy extension. This strengthens the custom case but does not make it automatic.
| Factor | Small custom CRM | Established CRM |
| Initial delivery | Build only the bounded sales and retention domain. More initial UI/testing work. | Contacts, pipelines and tasks exist; insurance entities, book import, dues and portal integration still need implementation. |
| Stack and maintainability | Same TypeScript/PostgreSQL stack as portal and CMS. Team owns every defect. | Upgrades shared with a community/vendor; team must support another runtime and extension model. |
| Insurance data fit | Natural proposer/insured/payer, held policy, premium schedule and distributor-entity model. | Custom entities can cover insurance; deep modifications raise upgrade cost. |
| Mobile, vernacular, offline | Designed in from the start. | Often limited mobile customisation and Indic language support; verify. |
| SaaS / white-label | Tenant scope, brand kits and plans designed in; must be built and tested. | Verify tenant isolation and redistribution/extension licences. |
| Best fit | Strong Node/TypeScript team; substantial insurance-specific and agent workflows. | Urgent launch with mostly standard CRM behaviour and available skills. |

## Recommendation
Provisional route: lean custom TypeScript sales CRM. Before committing, give an established CRM five working days. Adopt it if it covers at least 80% of launch CRM acceptance scenarios through configuration/extensions, needs no core fork, supports the mobile/vernacular requirements and its realistic three-year cost is lower. The 80% threshold is a proposed decision rule, not a market benchmark.
Fit-test scenarios: tenant isolation; solo-agent tenant; lead capture and deduplication; book import of 200 held policies; premium-due calendar; two opportunities for one customer; multi-insured proposal; quote-to-policy tracking; tie-up-aware comparison; branded portal handoff; Hindi UI; export; and one upgrade with extensions intact.
# 5. CRM shortlist and cost model
| Option | Practical evaluation |
| Frappe CRM | Leading low-cost adoption candidate. Self-hosting carries no CRM licence charge; allow for hosting, implementation and support. Python/Frappe skills and AGPL obligations must fit the delivery model. [S17, S26] |
| Frappe Framework + custom app | MIT framework can accelerate forms/admin and custom entities; this is framework-assisted custom development. [S17, S18] |
| EspoCRM | Straightforward sales CRM with custom entities. Workflows are an Advanced Pack feature; account for extension licences and SaaS terms. [S19, S27] |
| Zoho Vertical Studio | Commercial packaged route; per-tenant branding/custom-domain constraints remain unresolved for white-label scope. [S16] |
| Odoo / Salesforce / LeadSquared | Alternatives or customer integrations; broad enterprise scope is not the default for this lean launch. [S14, S15, S20] |
| Custom TypeScript CRM | Provisional route. Reuse authentication, UI, validation and CMS libraries; build only the bounded domain. |

## Illustrative three-year CRM-only comparison
| Assumption / cost | Adopt open-source | Custom sales CRM |
| Initial CRM effort at INR 1.5 lakh/person-month | 6 person-months = INR 9.00 lakh | 9 person-months = INR 13.50 lakh |
| Maintenance across 36 months | 0.15 FTE = INR 8.10 lakh | 0.20 FTE = INR 10.80 lakh |
| CRM hosting allowance, INR 5,000/month | INR 1.80 lakh | INR 1.80 lakh |
| Illustrative subtotal | INR 18.90 lakh + paid add-ons | INR 26.10 lakh + paid add-ons |

Revision 3.0 raises both routes because book, dues, mobile and vernacular scope apply to either. If the adopted CRM needs another 6 person-months of extension work for agent mobile and vernacular requirements (INR 9 lakh), the advantage reverses. Excludes taxes, portal/CMS, insurer connectors, messaging, AI usage and sales support. Do not add this to the full-launch estimate in section 21; they overlap.
# 6. Sales and retention data model
| Entity group | Relationships and minimum information |
| Tenant, plan, brand kit | Tenant type (organisation or solo), plan, limits, brand kit, domains, sender identity references and white-label settings. |
| Distributor entity, licence, tie-up | Entity type (IMF, broker, agent), registration number and validity, Principal Officer, tie-ups per insurer and line with dates and configured limits. |
| Branch, team, user, membership | Hierarchy, role, record scope; salesperson type (ISP, POSP, employee, solo agent), insurer codes, certification and activation status. |
| Party, contact point, relationship | Person/company separate from email/phone; proposer, insured, payer, nominee roles; optional household linking. Shared numbers do not imply identical people. |
| Lead and opportunity | Source/campaign and qualification; one party can have several opportunities; conversion preserves attribution. |
| Held policy | Policy in the book not necessarily sold through the platform: insurer, product, policy number, sum assured, premium, mode, dates, status, source (import/AI/manual), as-of date and confidence. |
| Premium schedule and due | Mode, next due date, grace end, due instances and outcome (paid/unpaid/lapsed/revived) as observed or reported; never a premium ledger. |
| Needs analysis and advice record | Calculator inputs, assumptions version, outputs, recommended products, customer choice and suitability notes. |
| Insurer and product version | Line, insurer, approved channel/distributor types, UIN/reference, wording version, POSP eligibility, quote requirements, research content and active dates. |
| Quote, benefit illustration | Quote options with coverage, premium components, exclusions, expiry; insurer benefit illustration file/version and customer acknowledgement. |
| Proposal and proposal party | Chosen quote, insurer form version, declarations, role links, validation and customer confirmation. |
| Submission, payment, policy sale | Separate submission attempt/status, payment reference/status and issued-policy record; a sale creates a held policy. |
| Servicing request (lite) | Customer, policy, request type, insurer reference, status, follow-up date, notes and insurer link. |
| Commission, persistency, target | Policy-linked expected and received amounts, rule basis; persistency snapshots by cohort; salesperson targets. |
| Document, consent, advertisement approval | File pointer, classification, checksum, retention; consent purpose/channel/notice version; advertisement approval reference, insurer, scope and expiry. |
| Campaign and content reference | CRM campaign owns audience and results; references immutable CMS content versions. |
| AI interaction, usage, audit, job | Skill, model/prompt version, inputs reference, output, reviewer decision, cost; usage counters; audit events; background jobs with idempotency keys. |

Boundary: no claim, endorsement or general-ledger tables at launch. Later modules attach through party_id, held_policy_id and insurer references. Use relational keys and typed money/dates; versioned JSON for insurer proposal answers and modest custom fields; no generic entity/attribute/value engine; never binary floating point for money.
# 7. CMS, design system and campaigns
| Responsibility | Owner and scope |
| CMS (Payload preferred) | Pages, banners, approved product summaries, research content, FAQs, articles, navigation, media, localised copy, greeting templates, reusable blocks, draft/preview/publish and expiry. [S28–S31] |
| Design system | Coded, accessible components, tokens, Indic typography, mobile layouts and tenant themes. CMS selects approved components; no arbitrary UI code. |
| CRM / campaign service | Audience and consent, lead capture, routing, attribution, follow-ups, send scheduling, delivery status and conversion. |
| Insurer/product module | Verified premiums, eligibility, quote validity and proposal questions. Marketing text cannot overwrite insurer pricing or wording. |
| Messaging provider | Email/SMS/WhatsApp delivery under tenant sender identities; platform selects approved recipients/templates and records outcomes. |

Agent self-service content: agents personalise microsites, share cards and greetings only by filling approved templates (name, photo, contact, language). Product-specific creatives come from insurer- or tenant-approved collateral; the advertisement approval register (F93) blocks publication where the tenant’s rules require an approval reference that is missing or expired. [S35]
Example campaign: an IMF marketer creates a health-renewal page from approved blocks; the compliance reviewer attaches the insurer approval reference; a publisher approves; ISPs share personalised links on WhatsApp; leads are validated, deduplicated, consented and assigned; conversion counts only on insurer-confirmed issuance.
# 8. Feature catalogue — Acquisition and CRM
Fit: I = IMF, B = broker, A = individual agent (solo). Stage: L = launch, L lite = bounded launch version, N = later, G = gated by access/contract. Type: B = build, C = configuration/data, I = integration, R = regulatory/contract review, A = AI evaluation. Catalogue inclusion is not a launch commitment.
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F01 | Tenant setup: distributor entity, registration, insurer tie-ups, permitted products, branches and salesperson eligibility. Operator-assisted for organisations; self-serve for solo agents via F94. | I · B · A | L · C/R |
| F02 | Staff login: invitations, mobile OTP or password plus MFA for privileged roles, role/branch/record permissions and deactivation. Customer login only for authenticated proposal journeys. | I · B · A | L · B |
| F03 | Lead intake: CMS/web forms, microsite, CSV, manual, referral source and inbound API, preserving campaign/source and purpose evidence. | I · B · A | L · B |
| F04 | Social/ad lead connectors: Meta and other approved sources with mapping, attribution and duplicate handling. | I · B · A | N · I |
| F05 | Lead allocation: owner assignment, round-robin, product/territory/licence eligibility and reassignment. | I · B | L · C |
| F06 | Sales pipeline: configurable stages, required fields, reminders, next action, lost reasons and stage history. | I · B · A | L · B |
| F07 | Customer/party records: proposer, insured, payer and nominee roles; related contacts; optional household. | I · B · A | L · B |
| F08 | Data import and deduplication: validated CSV and insurer export templates, normalisation, candidate matches, approved merges and rejected-row report. | I · B · A | L · C |
| F09 | Customer 360: contacts, opportunities, held policies, dues, quotes, proposals, servicing requests, activities and preferences. | I · B · A | L · B |
| F10 | Communication: call notes, email and one WhatsApp/SMS provider with approved templates, preferences and delivery status; extended by F80. | I · B · A | L · I/R |
| F11 | Campaign execution: campaign IDs, simple audiences, approved content, scheduling and lead-to-sale attribution. Drip journeys later. | I · B | L · C/I |
| F12 | Lead-generation expansion: telephony, lead marketplaces, ad platforms, more templates. Any paid referral reward needs legal review for rebating and inducement rules. | I · B · A | N · I/R |

# 9. Feature catalogue — Quote to policy sale
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F13 | Insurer/product catalogue: saleable products by distributor type, UIN/reference, wording, eligibility, POSP flag and insurer contacts. | I · B · A | L · C/R |
| F14 | Needs capture and quote comparison within permitted scope (F78): benefits, exclusions, waiting periods, deductibles, premium and selection rationale. | I · B · A | L · C |
| F15 | Quote workspace: manual or connected quotes with source, validity, assumptions, selected option and shareable comparison. | I · B · A | L · C/I |
| F16 | Proposal forms: insurer/product templates, prefill confirmed facts, validation, save/resume, documents, nominee capture and explicit declarations. | I · B · A | L · C |
| F17 | Pre-sale operations: missing documents, medical/inspection requests, insurer follow-ups, pending/rejected proposals and ownership. | I · B · A | L · C |
| F18 | API quote/submission/issuance for a contracted insurer/product; assisted insurer-portal route always available. | I · B · A | G · I/R |
| F19 | Premium/payment status: insurer-approved links and references; reconcile paid-but-not-issued. No premium custody. | I · B · A | L · I/R |
| F20 | Policy-sale register: insurer-confirmed policy, product, premium, dates, seller, document and delivery evidence; creates a held policy. | I · B · A | L · B |
| F21 | Renewal sales: renewal opportunities and quote follow-up for motor, health and other general policies from expiry dates; life premium dues handled in F72. | I · B · A | L · C |
| F22 | Integrated endorsements and servicing workflows. Launch uses the F74 tracker and insurer portal. | I · B · A | N · I/C |
| F23 | Claims assistance workflows with insurer/TPA status. Launch uses F74 notes and insurer contacts. | I · B · A | N · I/C |
| F24 | Customer portal: proposal save/resume, upload, purchase confirmation and insurer handoff at launch; wallet in F100. | I · B · A | L lite / N full |

# 10. Feature catalogue — Commission and distribution
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F25 | Commission setup: rates per insurer/product from the insurer’s commission policy, new/renewal basis, effective dates; slabs and splits later. [S39] | I · B · A | L · C/R |
| F26 | Commission records: expected and received amounts linked to policy, with audited adjustments; subledger later. | I · B · A | L lite / N full |
| F27 | Advanced reconciliation: statement import, matching, deductions, partial receipts and discrepancy queues. | I · B · A | N · C |
| F28 | Commission disputes: evidence packs, follow-ups, insurer response and history. | I · B | N · B |
| F29 | Distribution payouts to ISPs/POSPs: payees, splits, bank-change controls, maker-checker; disbursement gated. | I · B | N · C/R |
| F30 | Finance handoff: export sales and commission records; Tally/Zoho Books sync later. | I · B · A | L lite / N full |
| F31 | Accounting expansion: bank matching, forecasts, fee invoices, connectors. | I · B | N · I/R |
| F32 | Salesperson onboarding basics; expanded for ISPs/POSPs in F92. | I · B | L · C/R |
| F33 | Team structure basics; expanded into hierarchy and supervision in F91. | I · B | L · B |
| F34 | Internal campaigns: product drives, approved collateral, targets and progress; contests need approved rules. | I · B | L lite / N full |
| F35 | Sales MIS: leads, activity, conversion, issued and renewal premium, commission by source/product/insurer/salesperson. | I · B · A | L · B |
| F36 | Sales knowledge: SOP links and product notes; research library in F77; LMS later. | I · B · A | L lite / N full |

# 11. Feature catalogue — SaaS, privacy and mobile
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F37 | Consent and preferences: purpose/notice version, channel, timestamps, withdrawal and suppression. [S06] | I · B · A | L · B/R |
| F38 | Privacy operations: field/document permissions, secure uploads, export controls, incident contact and rights-request intake. | I · B · A | L · B/R |
| F39 | Audit and disclosures: changes to proposals, sales, users, rates, published content and AI decisions; distributor disclosures. | I · B · A | L · B/R |
| F40 | Tenant isolation across records, files, reports, jobs, CMS drafts, AI context and caches. No cross-tenant deduplication. | I · B · A | L · B |
| F41 | White-label portal basics: logo, domain, theme, sender/contact identity and disclosures; packaged in F95. | I · B · A | L · C/I |
| F42 | Configuration: bounded fields, stages, forms, templates, languages and feature switches. | I · B · A | L lite / N full |
| F43 | Mobile PWA: installable, responsive leads/tasks/dues/proposal flow with upload and retry status; refined by F84. | I · B · A | L · B |
| F44 | SaaS administration for organisations: operator provisions tenant, plan, users and limits; solo self-serve in F94. | I · B | L lite / N full |
| F45 | Data exit: scoped exports of contacts, held policies, opportunities, sales and document manifests; controlled deletion subject to retention. | I · B · A | L · B/R |
| F46 | Integration support: credentials, references, error/retry queue, capability flags and manual fallback. | I · B · A | L · B/I |
| F47 | Reporting: fixed sales, renewal, funnel, commission and adoption reports with CSV export. | I · B · A | L lite / N full |
| F48 | Dedicated deployment: isolated data plane, enterprise SSO, customer keys, private connectivity, stronger SLAs. | I · B | N / G · B/I |

# 12. Feature catalogue — AI and conditional integrations
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F49 | AI document extraction engine with source highlighting and human review; powers F87 at launch. | I · B · A | L · A |
| F50 | AI sales assistant: customer summaries and campaign copy; launch subset is F88 drafting. | I · B · A | L lite / N full |
| F51 | Product knowledge AI on approved, versioned content with citations and abstention; launch as F90. | I · B · A | L · A/C |
| F52 | Proposal AI: map confirmed facts to fields and flag unanswered questions; never invent declarations or sign. | I · B · A | N · A/I |
| F53 | Commission AI: explain deterministic mismatches once reconciliation exists. | I · B | N · A |
| F54 | AI skill controls: typed I/O, tenant authorisation, approved tools, human approval, audit, evaluation gates and spend limits. | I · B · A | L · B/A |
| F55 | Predictive AI: lead/renewal scores, lapse risk, next-best action, cross-sell, after data and evaluation justify them. | I · B · A | N · A/C |
| F56 | Anomaly detection for duplicate documents and unusual submission/payment/commission patterns, review only. | I · B | N · A/C |
| F57 | DigiLocker / e-insurance repository integrations with consent and partner onboarding. [S02, S21] | I · B · A | G · I/R |
| F58 | KYC and e-signature providers where accepted by the insurer. | I · B · A | G · I/R |
| F59 | Bima Sugam adapter placeholder; requires verified onboarding and specification. [S01] | I · B · A | G · I/R |
| F60 | Adjacent products: corporate RFQ, employee benefits, marine declarations, reinsurance, full accounting. | I · B | G · C/R |

# 13. Feature catalogue — CMS and portal
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F61 | Portal content: home/product/contact pages, navigation, FAQs, articles, tenant disclosures; draft, preview and publish. | I · B · A | L |
| F62 | Campaign pages: reusable templates, lead forms, source tracking and approved calls to action. | I · B | L |
| F63 | Content approval: author/publisher roles, approval state, version history and rollback. | I · B | L lite / N full |
| F64 | Design system: accessible components, Indic typography, mobile layouts and tenant tokens. | I · B · A | L |
| F65 | Assets and collateral: brochures, approved wording, product association, expiry and version control. | I · B · A | L |
| F66 | Localisation and SEO: localisable content; English, Hindi and two pilot regional languages; metadata, sitemap and previews. | I · B · A | L basic / N full |
| F67 | Product content governance: UIN, wording link, effective date and stale-content warning. | I · B · A | L |
| F68 | Forms and attribution: field definitions, consent version, anti-spam, campaign IDs and sales API submission. | I · B · A | L |
| F69 | Campaign optimisation: analytics, A/B tests, dashboards, personalisation without sensitive profiling. | I · B | N |
| F70 | Advanced portal management: visual designer, site templates, multi-site, workflow builder. | I · B | N |

# 14. Feature catalogue — Book of business, research and advice (new)
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F71 | Book-of-business import: insurer agent-portal exports, CSV templates, and PDF/photo via F87; mapping, dedup, as-of dates and review queue. Assisted migration for pilot tenants. | I · B · A | L · B/A |
| F72 | Premium-due and renewal calendar: life modes and grace periods, lapse and revival follow-ups, general/health renewal dates, daily due list and reminders. | I · B · A | L · B |
| F73 | Lifecycle alerts: maturity, survival benefit, policy anniversary, free-look end, age-change and birthday opportunities. [S41] | I · B · A | L lite · C |
| F74 | Servicing tracker lite: log request, insurer reference, status, follow-up date and portal link; claims notes. Bridge to F22/F23. | I · B · A | L lite · B |
| F75 | Benefit illustration and disclosure record: attach insurer-generated illustration/quote with version and customer acknowledgement. The platform never generates its own illustration. | I · B · A | L · C/R |
| F76 | Needs-analysis calculators: human life value/protection gap, retirement, child goal, health sum-insured adequacy and floater sizing; educational outputs with stated assumptions. | I · B · A | L · B/R |
| F77 | Product research library: plan summaries, riders, waiting periods, comparison grids and public insurer metrics with source and date; maintained centrally, tenant-filtered. | I · B · A | L · C/R |
| F78 | Distributor-aware comparison and suitability: scope enforced by entity type and tie-ups (broker market-wide; IMF/agent tied insurers; POSP-eligible only) with a stored advice record. | I · B · A | L · B/R |

# 15. Feature catalogue — Agent productivity, branding and vernacular (new)
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F79 | Agent home and daily plan: dues, follow-ups, birthdays, hot leads and pending proposals with one-tap call, WhatsApp and log actions. | I · B · A | L · B |
| F80 | WhatsApp-first engagement: click-to-chat for Solo (no API cost) and Business API templates for tenants; product cards, due reminders, opt-out handling. [S22] | I · B · A | L · I/R |
| F81 | Digital visiting card and agent microsite under the tenant brand, with registration details and lead form. | I · B · A | L · C |
| F82 | Greetings and social creatives: festival, birthday and product templates with auto-applied branding and language; product creatives only from approved collateral. | I · B · A | L · C/R |
| F83 | Vernacular experience: UI, templates and AI output in English, Hindi and two regional languages chosen by pilot geography; transliteration input; more languages later. | I · B · A | L basic / N full |
| F84 | Low-bandwidth, offline-tolerant mobile: cached daily plan and due list, queued notes and activities, low-end Android performance budget; no sensitive documents stored offline. | I · B · A | L lite · B |
| F85 | Income and performance: cross-insurer expected/received commission, targets, persistency by 13th/25th/37th/49th/61st month cohort, club and goal tracker. | I · B · A | L · B |
| F86 | Licence and training calendar: licence/certificate validity, renewal training reminders, exam evidence and CPD hours. | I · B · A | L · C/R |

# 16. Feature catalogue — AI launch skills (new)
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F87 | AI policy reader and coverage review: upload policy PDF/photo, extract key fields with source highlights, create a held policy after confirmation, produce a protection-gap summary. | I · B · A | L · A |
| F88 | AI vernacular drafting: follow-ups, due reminders and product explainers in the chosen language, using only approved claims; the salesperson reviews and sends. | I · B · A | L · A |
| F89 | Voice-to-CRM: voice note in English, Hindi, Hinglish or pilot languages becomes an activity, next action and task after confirmation. | I · B · A | L · A |
| F90 | Grounded product assistant: answers from approved wordings and brochures with citations; abstains on premium, eligibility or claim-outcome questions beyond catalogue data. | I · B · A | L · A/C |

# 17. Feature catalogue — Distribution network, compliance and commercial (new)
| ID | Feature and phase boundary | Fit (I · B · A) | Stage |
| F91 | Distribution hierarchy and supervision: IMF/broker → branch → team → ISP/POSP/employee; manager views, approval rules, ownership transfer. | I · B | L · B |
| F92 | ISP/POSP onboarding and activation: identity checks, training/exam evidence from external providers, certificate, insurer code mapping, product scope and deactivation. | I · B | L · C/R |
| F93 | Advertisement approval register: approval reference per insurer and creative, scope and expiry; blocks publishing where required approval is missing. [S35] | I · B · A | L · C/R |
| F94 | Plans and self-serve signup: Solo signup with mobile OTP and licence capture/verification, trial, plan limits, upgrades and GST invoices via a billing provider. | I · B · A | L · B/I |
| F95 | White-label packaging: brand kit, custom domain, sender identities, tenant legal documents, powered-by toggle, branded PWA; store-listed app wrapper later. | I · B | L / N · C/I |
| F96 | Channel admin: an insurer or IMF invites agents, manages seat pools, sees adoption and non-identifying usage analytics. | I · B | N · B |
| F97 | Data ownership on exit: contract-driven rules when an ISP leaves a tenant; full export for solo agents; consent-aware transfers; retention holds. | I · B · A | L · B/R |
| F98 | Adoption and support: guided setup, demo data, vernacular in-app help, WhatsApp support channel and NPS prompts. | I · B · A | L · C |
| F99 | Usage metering and cost guardrails: AI and messaging credits, per-tenant limits, alerts and monthly cost report. | I · B · A | L · B |
| F100 | Customer policy wallet lite: secure link showing policies held with the distributor, due dates and insurer servicing links. | I · B · A | N · B |

## Launch packaging by plan
| Capability group | Solo agent | Team / Business (IMF) | Broker | White-label |
| CRM, leads, pipeline (F01–F11) | Core | Full | Full | Full |
| Quote to sale (F13–F21, F24) | Assisted | Full | Full + market-wide | Full |
| Book, dues, servicing lite (F71–F74) | Full | Full | Full | Full |
| Research and advice (F75–F78) | Full | Full | Full | Full |
| Productivity, branding, vernacular (F79–F86) | Full | Full | Full | Full + brand kit |
| AI launch skills (F87–F90) | Credits | Credits | Credits | Credits / contract |
| Hierarchy, onboarding (F91–F92) | — | Full | Full | Full |
| CMS portal and campaigns (F61–F68) | Microsite only | Business plan | Business plan | Full |
| Commission, MIS (F25–F26, F35, F85) | Personal | Team | Team | Team |

## Coverage of the original requirements
Core CRM and campaigns → F03–F12, F61–F70. Quote to issue → F13–F20. Renewals and retention → F21, F72–F73. Servicing/claims → F74 at launch, F22–F24 later. Research and advice → F75–F78. Commissions/accounting → F25–F31, F85. Teams and onboarding → F32–F36, F91–F92. Compliance/privacy → F01, F37–F40, F93, F97. SaaS/white-label → F41–F48, F94–F96, F99. AI → F49–F56, F87–F90. Vernacular and mobile → F43, F66, F83–F84. Government rails → F57–F59. Adjacent lines → F60.
# 18. Regulatory and compliance controls by persona
This matrix converts regulatory themes into product controls. It is a design baseline only. Compliance/Legal must confirm current rules, amendments and each tenant’s registration before configuration. Health and medical proposal data, AI processing of customer documents and cross-border model hosting should be reviewed with Inadev’s CISO and compliance team before the pilot.
| Theme | Persona impact | Platform control |
| Insurer tie-up limits | IMF up to six per line; agents one per line today, open architecture proposed; brokers market-wide. [S34, S37, S38] | Tie-ups stored per entity and line with configurable limits and dates; product catalogue filtered by active tie-ups. |
| Comparison and advice | Brokers advise across the market; IMFs and agents compare only within tied insurers; POSPs limited to eligible products. | F78 scope enforcement, advice records, disclosure of tied insurers on comparisons. |
| Advertisements | Advertising norms now sit in the 2024 policyholder-protection framework and insurer Board-approved advertisement policies; agent advertisements have historically required insurer approval. [S35] | F93 approval register; generic branding templates separated from product creatives; mandatory registration details and disclosures on every page and card. |
| Commission | Commission is governed by each insurer’s Board-approved policy under the 2024 expense-of-management regulations. [S39] | Rates configured per insurer policy; disclosure fields where required; no commission-linked platform fees without legal review. |
| Rebating and inducements | Insurance Act section 41 prohibits rebates and inducements to policyholders. [S40] | No customer cashback features; referral rewards disabled by default and legal-gated (F12). |
| Policyholder protection | Nomination at proposal stage, free-look periods and electronic policies under the 2024 regulations. [S41] | Nominee capture in F16; free-look end alerts in F73; e-policy references in F20. |
| Online solicitation | Distributor-branded online selling may engage insurance self-network platform rules. [S05] | Per-tenant review flag before enabling online purchase journeys; assisted sales remain available. |
| Data protection | Distributor as data fiduciary; platform as processor; consent, purpose limitation, rights and breach duties. [S06] | F37–F38, DPA template, data-residency choice, retention schedules, breach runbook. |
| Messaging | Commercial SMS needs registered headers and templates; WhatsApp business policies apply. [S22] | Sender identities owned by tenant; template approval; suppression rechecked at send time. |
| Cyber and logging | IRDAI cyber guidelines and CERT-In directions apply to regulated entities and their vendors. [S09, S25] | Log retention, incident reporting support, vulnerability management, vendor-risk evidence pack for tenants. |

# 19. Lean technical architecture
| Component | Recommendation |
| Mobile app and portal | React/Next.js installable PWA shared by agent, manager and customer journeys; optional Capacitor wrapper later for store listing under white-label brands. |
| CMS | Payload for content, media, greeting templates and editorial permissions; not a CRM. [S28–S31] |
| Sales and retention domain | Modular TypeScript application: leads, parties, held policies, dues, quotes, proposals, servicing lite, commission, hierarchy. Split services only when boundaries justify it. |
| Database | Managed PostgreSQL with separate CMS and sales schemas/roles and one migration owner per table; row-level security for pooled tenants. [S24] |
| Identity | One established identity provider for staff, solo agents and customers; mobile OTP plus MFA for privileged roles; enterprise SSO later. |
| AI gateway | Provider abstraction with approved processing region, no training on customer data, PII minimisation, per-tenant enablement, prompt/model versioning, evaluation sets, cost metering and fallbacks. |
| Document pipeline | Private object storage, virus scan, OCR/extraction through the AI gateway, checksum and retention; public CMS media kept separate. |
| Jobs and connectors | Durable job table/worker with transactional outbox for reminders, imports, sends and insurer status checks; idempotent retries. [S23] |
| Localisation | ICU message formats, Indic fonts, transliteration input, per-tenant language packs; AI outputs labelled with language. |
| Hosting | Approved India hosting, containers, managed backups, secrets, monitoring and tested restore. No EKS, Kafka, service mesh or warehouse at launch. |

## Tenancy modes
Pooled SaaS is the default for Solo, Team, Business and White-label. Resolve the tenant from the verified domain and authenticated membership; never trust a caller-supplied tenant ID. Apply tenant and record scopes to queries, files, previews, reports, AI context and jobs. Dedicated mode (F48) uses the same codebase and configuration with an isolated data plane. Customers never receive code forks.
# 20. Sales reliability and AI implementation
A sale is confirmed by the insurer. Opportunity, proposal, payment and issuance statuses stay separate; payment success alone cannot mark a deal issued. Timed-out submissions become unknown and are reconciled before any retry, reusing the idempotency key. Where no API exists, record the assisted portal transaction and evidence; never scrape portals or bypass access controls.
| Interface | Contract |
| CMS/microsite → lead API | Tenant/page/campaign IDs, source, validated answers and consent version; anti-spam, allowlisted fields, server-side tenant routing. |
| Book import | File or AI extraction batch with source, as-of date and confidence; nothing becomes a held policy without review; re-imports are idempotent by insurer and policy number. |
| Submit proposal | Authenticated tenant/user, proposal version and idempotency key; frozen declarations; returns an operation reference, never a guessed policy number. |
| Insurer callback/status | Verify sender, deduplicate, keep raw and normalised status, reject stale transitions. |
| Campaign and reminder sends | Authorised content version and recipient; suppression rechecked at send time; delivery outcome recorded; no duplicate sends. |

## AI launch skills and evaluation gates
| Skill | Guardrail | Activation gate (proposed) |
| Policy reader (F87) | Source highlights; human confirmation before saving; never edits insurer-issued records. | At least 95% field accuracy on key fields over a 200-document set across pilot insurers; otherwise manual import only. |
| Vernacular drafting (F88) | Approved claims and templates only; no premium promises or guarantees; human sends. | Reviewer acceptance of 85% or more drafts with no prohibited claims in a 300-message evaluation per language. |
| Voice-to-CRM (F89) | Draft activity shown for confirmation; audio retention per tenant policy. | Task and next-action capture judged correct in 90% or more of a 200-note evaluation per pilot language. |
| Product assistant (F90) | Answers only from approved content with citations; abstains otherwise. | Zero uncited answers and 90% or more correct answers or abstentions on a curated question set. |

Thresholds are proposed decision rules, not industry benchmarks. Each skill has a typed contract, tenant authorisation, model/prompt version, timeout and cost limit (F54). No AI-generated premium, coverage guarantee, declaration or insurer submission.
# 21. Delivery, cost control and acceptance
| Phase | Deliverable and exit condition |
| Week 1: foundation | Five-day CRM fit test, CMS demo, first two insurer/product workflows, pilot IMF selection, language choice, data model sign-off. |
| Weeks 2–5: capture and book | Tenants, plans, identity, hierarchy, leads, parties, consent, pipeline, book import, held policies and premium-due calendar. |
| Weeks 6–10: advise and sell | Calculators, research library, distributor-aware comparison, quotes, benefit-illustration evidence, proposals, assisted submission, payment and issuance. |
| Weeks 11–14: agent experience and AI | Daily plan, WhatsApp flows, microsite, greetings, vernacular UI, offline-tolerant mobile, four AI skills behind evaluation gates, commission and persistency, white-label packaging, Solo signup. |
| Weeks 15–18: pilot | IMF pilot with two isolated tenants plus Solo beta; security, restore and compliance checks; weekly fixes. |
| Weeks 19–20: contingency | Insurer UAT, migration or AI gate rework; broker design-partner readiness. |

Planning range: about 18–20 weeks with an experienced team of 6–7 (product, design, 3–4 engineers, QA, part-time compliance analyst). Insurer access, approvals and partner turnaround are external dependencies.
Illustrative full-launch effort: 16–22 person-months × INR 1.5 lakh = INR 24–33 lakh; with 20% contingency, INR 28.8–39.6 lakh. Excludes taxes, commercial licences, cloud, messaging and AI usage, large data cleanup and multiple complex insurer connectors. Ongoing cost is metered per tenant (F99) so plan prices can be checked against run cost monthly.
## Launch acceptance
- An IMF marketer publishes an approved branded campaign without a developer, and an unapproved product creative cannot be published.
- A lead is validated, deduplicated, consented, attributed and assigned to an eligible ISP.
- An ISP completes needs analysis, permitted comparison, quote, benefit-illustration acknowledgement and proposal, and obtains insurer-confirmed issuance.
- A solo agent signs up, verifies licence details and imports a 200-policy book with AI assistance in under 30 minutes of active effort, and the due calendar matches the source data.
- A due reminder is drafted in Hindi or a pilot language, reviewed and sent on WhatsApp; a voice note creates the follow-up task.
- Comparison never shows non-tied insurers for an IMF or agent, or non-eligible products for a POSP.
- Payment retries and callbacks do not duplicate transactions; policy delivery includes the correct servicing route.
- A white-label tenant runs on its own domain and sender identities, and two tenants cannot access each other’s records, files, drafts, AI context or reports.
- Export, restore, disclosures, suppression and audit evidence work; each AI skill passes its gate or stays disabled.
# 22. KPIs, risks and open decisions
| KPI group | Measures |
| Sales | Leads by source, contact rate, quote-to-proposal, proposal-to-issued, time to issue, issued premium. |
| Retention | Policies under management, dues actioned before grace end, renewal premium retained, revivals, 13th-month persistency. |
| Adoption | Weekly active salespeople, share of users with book imported, daily-plan actions, WhatsApp shares, AI acceptance rate, time saved per week. |
| Commercial | Solo free-to-paid conversion, tenant activation time, monthly churn, revenue versus metered run cost per tenant. |

| Risk | Mitigation |
| Insurer API access unavailable | Assisted portal route; AI import from insurer documents; partner with tenants that hold integrations; prioritise two insurers per line. |
| Double entry kills adoption | Book import and AI reader in launch; daily plan driven by dues; measure entry time per policy. |
| Regulatory change (agent open architecture, distribution reform) | Limits and scopes as data; quarterly regulatory review; watch the reform under consultation. [S08, S37] |
| AI errors or prohibited claims | Evaluation gates, citations, human approval, audit, per-tenant disable switch. |
| White-label support burden | Brand kits within tokens only; no forks; paid tier for custom work. |
| Pricing not validated | Willingness-to-pay tests in pilot; metered cost reporting; adjust before GA. |
| Agent data ownership disputes | Contract terms per tenant (F97), consent records and export logs. |

| Open decision | Needed from |
| Pilot IMFs and first insurer/product pairs | Business development, by week 1. |
| Pilot regional languages | Pilot geography, by week 1. |
| Custom versus adopted CRM | Five-day fit test, by end of week 1. |
| AI provider and processing region | CISO and compliance review, by week 4. |
| Pricing and plan limits | Pilot interviews, before GA. |

# 23. Evidence register
Research cut-off: 2 October 2026. Vendor capabilities are advertised, not production-validated. Secondary sources (S34–S38, S41) must be confirmed against IRDAI originals before configuration. Architecture choices, thresholds, costs, prices and schedules are proposals.
[S01] IRDAI — Bima Sugam regulations, 2024
https://irdai.gov.in/document-detail?documentId=4583640
Marketplace framework; production API/access remains a gate.
[S02] IRDAI — Insurance Repository FAQ
https://irdai.gov.in/faq-on-insurance-repository
Distinguishes regulated repositories from a distributor document vault.
[S03] IRDAI — Insurance Marketing Firm department / FAQs
https://irdai.gov.in/department/insurance-marketing-firm
Official baseline; check current amendments and each tenant’s registration.
[S04] IRDAI — Brokers
https://irdai.gov.in/intermediaries/brokers
Broker categories and permitted activities.
[S05] IRDAI — Insurance Self Network Platform
https://irdai.gov.in/insurance-self-network-platform-isnp-
Baseline for online distribution; applicability requires current review.
[S06] MeitY — Digital Personal Data Protection Rules, 2025
https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
Official Gazette; commencement and transfer provisions.
[S07] Intuit — QuickBooks India service notice
https://quickbooks.intuit.com/in/resources/technology/why-you-should-focus-on-local-seo/
India discontinuation notice.
[S08] Reuters — proposed distribution reform, 29 September 2026
https://www.reuters.com/commentary/breakingviews/indias-big-insurance-overhaul-will-test-demand-2026-09-29/
Consultation watch only.
[S09] IRDAI 2026 cyber circular, reproduced by TaxGuru
https://taxguru.in/corporate-law/irdai-information-cyber-security-guidelines-2026.html
Obtain official annexures for clause mapping.
[S10] InsuredBoard — product site
https://insuredboard.com/
Vendor claims: policy CRM, PWA, WhatsApp.
[S11] InsureFlow India — product site
https://insureflow.biz/
Vendor claims and source-code delivery proposition.
[S12] Ensuredit — ICE
https://www.ensuredit.com/ice.html
Vendor claims: distribution, operations, finance, compliance.
[S13] insureMO — API platform
https://insuremo.com/en/platform/api-platform
Vendor platform description.
[S14] LeadSquared — insurance CRM
https://www.leadsquared.com/insurance-crm/
Vendor insurance sales capabilities.
[S15] Salesforce — insurance brokerage platform
https://www.salesforce.com/in/financial-services/insurance-brokerage-management-software/?bc=OTH
Brokerage capability reference.
[S16] Zoho Vertical Studio — official FAQ
https://help.zoho.com/portal/en/kb/zoho-vertical-studio/overview/articles/vertical-studio-faqs
Limits on customisation and custom domains.
[S17] Frappe — License and Trademark
https://docs.frappe.io/legal/others/license-and-trademark
Framework and application licences differ.
[S18] Frappe Framework — sites
https://docs.frappe.io/framework/user/en/basics/sites
Site model documentation.
[S19] EspoCRM — licence and extensions
https://www.espocrm.com/open-source/
Core licence; extension agreement separate.
[S20] Odoo — licences
https://www.odoo.com/documentation/19.0/th/legal/licenses.html
Community and Enterprise licensing.
[S21] API Setu — DigiLocker partner resources
https://apisetu.gov.in/digilocker
Requester/issuer APIs and onboarding.
[S22] TRAI — Advice to Senders
https://www.trai.gov.in/advice-to-senders
Sender registration, consent and templates.
[S23] AWS — Transactional outbox pattern
https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html
State/event consistency reference.
[S24] PostgreSQL — Row Security Policies
https://www.postgresql.org/docs/current/ddl-rowsecurity.html
Owner, superuser and BYPASSRLS exceptions matter.
[S25] CERT-In — Directions, 28 April 2022
https://www.cert-in.org.in/PDF/CERT-In_Directions_70B_28.04.2022.pdf
Incident reporting and ICT logs.
[S26] Frappe CRM — pricing and self-hosting
https://frappe.io/crm/pricing
Self-hosting licence-cost statement.
[S27] EspoCRM — workflows and entity manager
https://www.espocrm.com/features/workflows/
Workflows are an Advanced Pack feature.
[S28] Payload — MIT licence
https://github.com/payloadcms/payload/blob/main/LICENSE.md
Enterprise functionality licensed separately.
[S29] Payload — product architecture
https://payloadcms.com/docs/getting-started/what-is-payload
TypeScript/Next.js, admin, API, access control.
[S30] Payload — versions and drafts
https://payloadcms.com/docs/versions/overview
Versions, drafts and access control.
[S31] Payload — PostgreSQL adapter
https://payloadcms.com/docs/database/postgres
Adapter and migrations.
[S32] WordPress — licence
https://wordpress.org/about/license/
GPL licensing.
[S33] Strapi — pricing
https://strapi.io/pricing-cloud
Cloud offering; confirm self-hosted terms.
[S34] Cafemutual — IMFs can have 6 tie-ups, corporate agents 9 (IRDAI circular)
https://cafemutual.com/news/insurance/28042-imfs-can-have-6-tie-ups-banks-with-9-insurers-irdai
Secondary report of the IRDAI change raising IMF tie-ups from two to six per line. New in Rev 3.0.
[S35] Mondaq — future of insurance advertising norms in India (Sept 2024)
https://www.mondaq.com/india/advertising-marketing-branding/1518396/looking-ahead-the-future-of-insurance-advertising-norms-in-india
Advertising norms moved into the 2024 policyholder-protection framework and insurer Board-approved advertisement policies. Confirm agent-approval specifics. New.
[S36] Cafemutual — IRDAI allows open architecture via IMFs
https://cafemutual.com/news/insurance/3625-irdai-allows-open-architecture-in-insurance-distribution
Older report that individual agents are not eligible to join an IMF unless they surrender the agency licence; verify current position. New.
[S37] Cafemutual — agents can work with multiple insurers: Finance Secretary
https://cafemutual.com/news/insurance/34129-insurance-agents-can-work-with-multiple-insurers-finance-secretary
Government intent to enable agent open architecture; not yet a rule. New.
[S38] PB Partners — selling policies from multiple companies (June 2026)
https://www.pbpartners.com/articles/generic/how-to-sell-insurance-policies-from-multiple-companies
Vendor article: individual agents cannot represent multiple insurers in one category; POSP route via a broker platform. Competitive reference. New.
[S39] ICICI Prudential — Board policy on commission (FY2026 disclosures)
https://www.iciciprulife.com/content/dam/icicipru/kpi-disclosure/2026/Policies_FY2026.pdf
Example insurer Board-approved commission policy under the 2024 expense-of-management regulations. New.
[S40] Insurance Act, 1938 — section 41 (prohibition of rebates)
Statutory reference; obtain current text from India Code.
Policyholder rebates and inducements prohibited. New.
[S41] AMS Shardul — IRDAI policyholder-protection regulations 2024 overview
https://amsshardul.com/?p=15782
Summary of the 2024 regulations and master circulars including free-look and electronic policies. New.
# Appendix A. Review log
Method: structured rubric review repeated until both scores exceeded 9. Reviews were run by Claude acting as an Indian insurance distribution reviewer against a fixed rubric; this is not an independent human or second-model review. An independent pass by a distribution practitioner and by Compliance is recommended before external circulation.
| Rubric dimension (each scored 0–10, equal weight) | Completeness | Sellability |
| Persona coverage and regulatory fit for IMF, broker and agent | ✓ | ✓ |
| End-to-end journey: acquire, research, advise, sell, retain, earn | ✓ |  |
| AI enablement with guardrails and gates | ✓ | ✓ |
| SaaS and white-label packaging | ✓ | ✓ |
| Data model and architecture support for the features | ✓ |  |
| Phasing, acceptance criteria and delivery realism | ✓ |  |
| Value proposition and differentiation |  | ✓ |
| Go-to-market, pricing hypotheses and adoption levers |  | ✓ |
| Risks, KPIs and proof points |  | ✓ |

| Round | Completeness | Sellability | Main findings and actions |
| 0 · Rev 2.0 | 5.0 | 4.0 | Scored against the multi-persona goal. Built for IMF/broker only; book, renewals, research, vernacular and branding missing; AI optional; no pricing or go-to-market. Action: add personas, F71–F100, commercial model. |
| 1 · Draft 3.0a | 8.2 | 7.0 | Persona table and new catalogue added. Gaps: agents wrongly modelled as IMF members; white-label tiers vague; no pricing; AI lacked activation gates; no data-ownership rule. Action: Distributor Entity model, plan tiers, AI gates, F97. |
| 2 · Draft 3.0b | 9.0 | 8.4 | Gaps: no regulatory control matrix; commission-linked pricing risk unflagged; no adoption KPIs, risk register or launch packaging by plan; acceptance lacked agent and white-label tests. Action: sections 18 and 22, packaging table, expanded acceptance. |
| 3 · Rev 3.0 final | 9.3 | 9.1 | Remaining limits: pricing and AI thresholds are unvalidated hypotheses; insurer API access is external; agent rules may change. These are pilot questions rather than document gaps. |

