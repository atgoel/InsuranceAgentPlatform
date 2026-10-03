# Screen inventory

Every screen is a clickable artboard in `wireframes/canvas/`. Feature IDs refer to design Revision 3.0. Behaviour shown in the wireframes (gates, disabled states, status logic) is part of the specification; names, insurers and amounts are sample data.

| ID | Screen | Artboard file | Primary users | Features | Interactions to implement |
|---|---|---|---|---|---|
| P00 | Prototype home | `Start.dc.html` | Everyone | — | Role entry points; five guided journeys; demo progress from shared state; language; reset demo |
| M01 | Today | `Main.dc.html` | Agent, ISP, POSP | F79, F72, F83, F84 | EN/हि switch; outcome logging; follow-up ticks; offline sync; search and quick actions |
| M02 | Leads | `LeadsPipeline.dc.html` | Agent, ISP | F03, F05, F06, F08 | List and pipeline board; filters; duplicate merge; new-lead sheet with consent |
| M03 | Customer 360 | `Customer360.dc.html` | Agent, ISP | F07, F09, F74, F87 | Tabs: policies, dues, deals, activity; AI gap review; servicing status |
| M04 | Book · due calendar | `DueCalendar.dc.html` | Agent, ISP | F72, F73 | Month grid; urgency colours; lapsed revival; month-wide filters |
| M05 | Book import | `BookImport.dc.html` | Agent, solo | F71, F87, F08 | Source highlight per field; low-confidence acknowledgement; batch summary |
| M06 | Needs calculators | `Calculators.dc.html` | Agent, ISP | F76 | Protection, retirement, child, health; live results; assumptions; links to quote |
| M07 | Research & assistant | `ResearchAssistant.dc.html` | Agent, ISP, POSP | F77, F90, F67 | Library with source/date and stale flags; cited answers; abstentions |
| M08 | Compare plans | `NeedsCompare.dc.html` | Agent, ISP, POSP | F14, F78 | Persona switch drives scope and disclosure; suitability note gate |
| M09 | Quote & BI | `QuoteBI.dc.html` | Agent, ISP | F15, F75, F18 | API or manual quote; riders; GST; BI send and customer acknowledgement gate |
| M10 | Consolidated proposal | `ProposalForm.dc.html` | Agent, ISP | F16, F17, F37, F49 | Readiness meter; sections prefilled with source chips; confirm per section; next-to-finish jump; insurer switch reuses answers and shows only new questions; customer-only health section; API or portal route |
| M11 | Proposals tracker | `IssuanceTracker.dc.html` | Agent, ISP | F17, F19, F20 | Separate submitted/paid/issued; paid-not-issued; unknown → reconcile → resubmit |
| M12 | Message & voice | `AIDraft.dc.html` | Agent, ISP | F10, F80, F88, F89 | Purpose and language switch; regenerate; edit; voice note to three CRM entries |
| M13 | Card & greetings | `MicrositeGreetings.dc.html` | Agent | F81, F82 | Live card edit; language chips; template grid; locked product creatives |
| M14 | Me · income | `Income.dc.html` | Agent, ISP | F85, F86, F35 | Month/FY; pending commission; persistency cohorts; training hours; tools |
| M15 | Solo signup | `SoloSignup.dc.html` | Solo agent | F94, F01, F37 | OTP; licence capture; certificate; consent; verification; next-step routing |
| C01 | Customer journey | `CustomerJourney.dc.html` | Customer | F24, F37, F75 | OTP resume; details check; upload; declaration confirm; insurer handoff; confirmation |
| CRM01 | Leads workspace | `CRMLeads.dc.html` | Manager, ops, ISP | F03, F05, F06, F08, F37 | Saved views; SLA timers; filters; bulk assign with eligibility; create and route |
| CRM02 | Lead record | `CRMLeadDetail.dc.html` | ISP, manager | F06, F07, F10, F37 | Stage bar with entry rules; reassign; activity composer and timeline; qualification; tasks; duplicate link; convert with attribution |
| CRM03 | Opportunities pipeline | `CRMPipeline.dc.html` | Manager, ISP | F06, F20, F35 | Kanban with premium totals; move with rules; won only by insurer callback; lost with reason |
| CRM04 | Customers & households | `CRMCustomers.dc.html` | ISP, manager | F07, F09 | Segments; search by policy no.; household roles panel; cross-sell gaps; create opportunity |
| CRM05 | Tasks & activities | `CRMTasks.dc.html` | ISP, manager | F06, F72, F89 | My/team; type filters; overdue/today/upcoming; outcomes; cadence rules |
| CRM06 | Campaigns & segments | `CRMCampaigns.dc.html` | Marketer, manager | F11, F37, F80 | Segment rules with consent; exclusions; schedule via approved template; attribution to issuance |
| CRM07 | Routing rules | `CRMAssignment.dc.html` | Manager, admin | F05, F92 | Priority rules; method; SLA and escalation; test a lead; capacity and leave |
| CRM08 | Import & duplicates | `CRMImportDedup.dc.html` | Ops, admin | F08, F71 | Four-step import with mapping and rejects; duplicate pairs with field-level survivor choice |
| M16 | Lead record (mobile) | `LeadDetail.dc.html` | Agent, ISP | F06, F07 | Stage progress; qualify; duplicate link; next task; convert |
| M17 | My tasks (mobile) | `MyTasks.dc.html` | Agent, ISP | F06, F72 | Grouped by urgency; type filter; tick to log |
| CRM09 | Customer record (web) | `CRMCustomerRecord.dc.html` | ISP, manager, ops | F07, F09, F38 | Breadcrumb; tabs for policies, activity, documents with access, consent; rule-based next best actions |
| M18 | Help & setup | `HelpCentre.dc.html` | Agent, ISP | F98 | Setup checklist; demo data; bilingual help; WhatsApp support; Hindi callback; NPS |
| M19 | Plan & billing | `SoloPlan.dc.html` | Solo agent | F94 | Usage meters with 75% warning; Pro trial; payment method; GST invoices |
| W01 | Dashboard | `ManagerConsole.dc.html` | Manager, Principal Officer | F35, F47, F91 | Branch filter; queue resolution; team search |
| W16 | Proposal desk | `PortalFillSheet.dc.html` | Operations, ISP | F16, F18, F20 | Queue; insurer portal pages in field order with codes; copy per field or page; frozen health answers; record proposal number and screenshot evidence |
| W17 | Proposal forms | `FormTemplates.dc.html` | Product ops, admin | F13, F16, F42 | Canonical question bank by layer; who answers; prefill sources; per-insurer field codes and value mapping; form version diff and publish |
| W10 | Users & roles | `UsersRoles.dc.html` | Admin, Principal Officer | F02, F38 | Role filters; deactivate/reactivate; role permission editor with locks; what-this-role-sees; MFA policy |
| W11 | Configuration | `Configuration.dc.html` | Tenant admin | F42 | Stage order with entry rules; bounded custom fields; template status; language coverage; feature switches with gates |
| W12 | Integrations | `Integrations.dc.html` | Admin, operations | F46 | Connector status and capability flags; vault references; plain-language error queue; retry or go manual |
| W13 | Content library | `ContentLibrary.dc.html` | CMS author, publisher | F61, F63, F65, F66 | Collateral with approval and expiry; greeting templates; site pages with SEO and version restore |
| W14 | Reports | `ReportsLibrary.dc.html` | Manager, finance, PO | F35, F47 | Eight fixed reports; insight line; period filter; CSV export; scheduled email |
| W15 | Product drives & contests | `ProductDrives.dc.html` | Manager, compliance | F34 | Drive progress and pace; leaderboard toggle; rules approval gate; no customer incentives |
| W02 | Onboarding & hierarchy | `OnboardingHierarchy.dc.html` | Manager, operations | F32, F33, F91, F92 | Tree filter; stage pipeline; evidence checklist; insurer code; activate |
| W03 | Campaign editor | `CampaignPublish.dc.html` | Marketer, compliance | F11, F61–F68, F93 | Approved blocks; approval gate; publish; test lead with routing |
| W04 | Compliance centre | `ComplianceCentre.dc.html` | Compliance, Principal Officer | F37–F39, F45, F93, F97 | Ad register; audit filters; consent withdrawal; rights requests; export |
| W05 | Commission | `CommissionSetup.dc.html` | Finance | F25, F26, F30 | Rate cards with source; maker-checker add; records filter; export |
| W06 | AI controls | `AIControls.dc.html` | Tenant admin, CISO | F54, F99, F87–F90 | Per-skill switch; gate results by insurer/language; usage and spend |
| W07 | Tenant & catalogue | `TenantSetup.dc.html` | Tenant admin | F01, F13, F42 | Entity type drives limits and scope; tie-ups per line; catalogue filters |
| W08 | Brand & white-label | `WhiteLabel.dc.html` | Tenant admin, operator | F41, F95, F99 | Presets; colour and contrast check; typeface; live preview; sender status |
| W09 | Tenants & plans | `OperatorTenants.dc.html` | Platform operator | F44, F94, F48 | Provision tenant; plan cards; revenue vs run cost |

## Shared components
App bar with back · bottom navigation (Today, Leads, Customers, Book, Me) · console sidebar with collapsible sections and search · card · status chip (ok, warn, bad, neutral, info) · segmented and underline tabs · filter chips · stepper chips with completion state · bottom sheet · toast · data grid with horizontal scroll · evidence checklist · timeline · consent checkbox with notice version · disclosure footer.

## Design tokens
Ink #1B1F27 · secondary #4A5262 · caption #5F6776 · line #D5D9E0 · ground #F4F5F7 · accent #1F5FBF (tenant token) · ok #1D5F3A on #E8F4EC · warn #7A3E06 on #FFF4E5 · bad #8A1F1F on #FDECEC. IBM Plex Sans with IBM Plex Sans Devanagari; IBM Plex Mono for references. Radius 8–12 px. Touch targets at least 44 px. Text contrast at least 4.5:1.

## States every screen needs in build
Loading skeleton · empty state with next action · error with retry · offline (queued writes, no sensitive files cached) · permission denied by role or tenant · Hindi and pilot-language strings with ICU plurals · low-end Android performance budget.

## Rules that must not be lost in build
Issued only on insurer confirmation · reconcile unknown submissions before retry with the same idempotency key · AI never fills declarations or quotes premiums · comparison scope from entity type and tie-ups · publish blocked without a valid approval reference · suppression rechecked at send time · tenant resolved from the verified domain, never from a caller-supplied ID.
