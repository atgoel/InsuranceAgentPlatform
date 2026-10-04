# CR-001 · Sales/booking register fields and an extensible data model

Status: Approved 2026-10-03 · Specified in the module LLDs (M00 §16, M01 §3.9, M03 §11, M04 §11, M07 §11, M09 §11, M10 §11); kernel + M01/M03/M04 parts implemented 2026-10-03 (cb8a5af), M07 part implemented 2026-10-04 (11c0319); remaining: M09 §11 (policy-sale commercials, OPPORTUNITY_LOOKUP attribution per M04 §11.2) and M10 §11 (`expectedCommission` on net, invoice date, MIS by referrer/source), built with those modules · Raised: 2026-10-03 from a customer sample of their office sales register · Affects: M07 Book & Retention, M09 Proposal & Issuance (policy sale), M10 Commission, M03 Party, M04 lead attribution, kernel (custom-field registry) · Target: before the M07 build starts, so import, the held-policy tables and commission are built once.

## 1. Sample received
One register row per booked policy (health and motor, possibly life):

`S. No. | Month | Company Name | Type | Client Name | CONTACT NO. | BOOKING DATE | RISK START DATE | POLICY END DATE | Plan Name | Family Size/Model | Regn. No. | Regn. Year | Policy No. | SI/IDV | NCB YES/NO PY | Final Premium | OD PREMIUM | Premium w/o GST | Prem. with GST | Intermediary | Port/Fresh/Rollover | Term | Proposer DOB | Remarks | Reference | SOURCE | Commission | % | Remarks | Invoice No.`

Example: `1 | JULY | STAR HEALTH | HEALTH | NITISH VATS | 99532xxxxx | 02-07-2026 | 02-07-2026 | 01-07-2027 | ASSURE | INDIVIDUAL | | | 199734823 | 1000000 | | 29466 | | 29466 | 29466 | OFFICE M11-DIRECT | FRESH | 1 YEAR | | | | IN HOUSE | SAURABH`

## 2. Field-by-field coverage

| # | Register field | Where it lives today | Status |
|---|---|---|---|
| 1 | S. No. | Import row number (`book_import_row.rowNo`) | ✅ import-only |
| 2 | Month | Derived from booking date for reports | ✅ derived, not stored |
| 3 | Company Name | `held_policy.insurer_name` + `insurer_id` (M05 match) | ✅ |
| 4 | Type (HEALTH/MOTOR/LIFE…) | `held_policy.line` (LIFE/HEALTH/GENERAL) | ⚠️ **Partial**: MOTOR, TRAVEL, HOME, etc. collapse into GENERAL. Add `product_category` (reuse M05 category enum; add TRAVEL, HOME, PERSONAL_ACCIDENT, COMMERCIAL) |
| 5 | Client Name | Proposer party `display_name` (M03) | ✅ |
| 6 | Contact No. | Party contact point MOBILE (encrypted + hash + masked) | ✅ |
| 7 | Booking Date | `policy_sale.issued_on` (platform sales, M09); **missing on imported held policies** | ⚠️ **Gap**: add `held_policy.booked_on` |
| 8 | Risk Start Date | `held_policy.commencement_date` | ✅ |
| 9 | Policy End Date | `maturity_date` (life) / `renewal_date` (annual) | ⚠️ **Partial**: add an explicit `expiry_date`; derive `renewal_date = expiry + 1 day` for annual contracts |
| 10 | Plan Name | `product_name` + `product_version_id` when matched | ✅ |
| 11 | Family Size / Model | — | ❌ **Gap**: line-specific risk details (health: INDIVIDUAL/FLOATER + member mix such as 2A+1C; motor: make/model/variant) |
| 12 | Regn. No. | — | ❌ **Gap** (motor risk). Personal data class P2 (it identifies a person's vehicle) |
| 13 | Regn. Year | — | ❌ **Gap** (motor risk) |
| 14 | Policy No. | `policy_number_enc/hash/last4` | ✅ |
| 15 | SI / IDV | `sum_assured_paise` | ✅ (shown as "IDV" for motor and "Sum insured" for health) |
| 16 | NCB (prev. year) | — | ❌ **Gap** (motor: NCB % and whether a claim was made in the previous year) |
| 17 | Final Premium | `premium_paise` | ✅ |
| 18 | OD Premium | — | ❌ **Gap**: premium breakdown (motor OD / TP, add-ons) |
| 19 | Premium w/o GST | — on held policy (quotes have it, M06) | ❌ **Gap**, and it matters: **commission is calculated on premium without GST** (see §4) |
| 20 | Prem. with GST | `premium_paise` (gross) | ✅ (rename the semantics to "gross") |
| 21 | Intermediary (e.g. OFFICE M11-DIRECT) | Partly: seller (`seller_member_id`), insurer agent code (M02 `insurer_code`) | ⚠️ **Gap**: the booking channel/code under which the policy was booked (`booking_channel_code` text + link to M02 insurer code when it matches) |
| 22 | Port / Fresh / Rollover | — | ❌ **Gap**: `business_type` = FRESH, RENEWAL, PORTABILITY (health), ROLLOVER (motor, from another insurer), with `previous_insurer_name`. Needed for commission basis and MIS |
| 23 | Term | `policy_term_years` | ⚠️ **Partial**: short-term motor/travel needs `policy_term_months` |
| 24 | Proposer DOB | Party `dob_enc` (P3, encrypted) + `dob_year` | ✅ |
| 25 | Remarks | — on held policy (activities exist) | ⚠️ **Gap**: a `remarks` note on the policy (SensitiveContentGuard applies) |
| 26 | Reference (the person who referred the client, e.g. "SAURABH") | Platform leads: `attribution.referrerPartyId`; imported: — | ⚠️ **Gap**: `referred_by_name` (free text as written) + `referred_by_party_id` / `referred_by_member_id` when it resolves to a known party or team member. It is **not** the seller: the seller stays `seller_member_id` |
| 27 | SOURCE (IN HOUSE) | Lead `attribution.source` (platform); imported: — | ⚠️ **Gap**: `business_source` on held policy / sale (IN_HOUSE, REFERRAL, POSP, WALK_IN, …), mapped to M04 LeadSource where possible |
| 28 | Commission | M10 `commission_entry` (EXPECTED/RECEIVED) | ✅ |
| 29 | % | M10 `rate_pct` on the entry | ✅ |
| 30 | Remarks (commission) | M10 entry `reason` | ✅ |
| 31 | Invoice No. | — | ❌ **Gap**: the intermediary's GST invoice to the insurer for commission (`invoice_no`, `invoice_date`) on received commission |
| — | (sample value "SAURABH") | **Confirmed by the customer (2026-10-03): the referrer** → `referred_by_name` | ✅ once mapped in the import profile (see §5 decision D1) |

**Summary:** 14 fields are fully covered and 2 are import-only or derived. 15 are partial or missing: 9 belong in the core model (dates, category, business type, premium breakdown, channel, source/reference, invoice) and 6 are line-specific risk details or tenant-specific columns.

## 3. Design: keep the model extensible without EAV
Following the existing convention (`03-data-model.md`: "JSONB only for schema-registered payloads … with schema_id + schema_version. No EAV"):

### 3.1 First-class columns (they drive logic, reports or commission)
On `held_policy` and `policy_sale` (shared value object `PolicyCommercials`):
`booked_on date`, `expiry_date date`, `product_category text`, `business_type text check (FRESH, RENEWAL, PORTABILITY, ROLLOVER)`, `previous_insurer_name text`, `policy_term_months int`, `premium_net_paise bigint`, `premium_tax_paise bigint`, `premium_gross_paise bigint` (check net + tax = gross), `booking_channel_code text`, `business_source text`, `referred_by_party_id text`, `referred_by_name text`, `remarks text`.
On `commission_entry` (RECEIVED): `invoice_no text`, `invoice_date date`.

### 3.2 Typed, versioned risk details per line (`risk_details jsonb` + `risk_schema_id` + `risk_schema_version`)
Each schema is registered as code (zod) and versioned:
- `motor.v1`: `{ registrationNo (P2), registrationYear, make, model, variant?, fuel?, ncbPercent (0/20/25/35/45/50), claimInPreviousYear: boolean, odPremiumPaise, tpPremiumPaise, addOns: string[] }`
- `health.v1`: `{ coverType: INDIVIDUAL | FLOATER, members: Array<{ relation, ageBand }>, portabilityFrom?: { insurerName, continuousCoverSince } }`
- `life.v1`: `{ ppt, payoutOption?, riders: string[] }`
- `travel.v1` and `home.v1` are added later the same way.

Reports and screens read typed fields through the schema. New lines need a new schema version, not a table change. Registration number is encrypted with a lookup hash (same pattern as the policy number).

### 3.3 Tenant custom fields: governed field registry (HLD §8 "governed field registry with PII class")
- `custom_field_definition` (tenant, entity: held_policy | policy_sale | party | lead | opportunity | commission_entry, key, label EN/HI, type: text | number | money | date | enum | boolean, enum options, required, **PII class P0–P3**, reportable flag, version, active).
- Values in `<entity>.custom_fields jsonb` + `custom_schema_version`; validated against the tenant's active definitions on write. P3 custom fields are refused at launch; P2 fields are masked in lists and excluded from Twenty projections and AI prompts.
- Plan limits on the number of custom fields (already in `plan.limits.custom_fields`).
- Import mapping can target core columns, risk-detail fields or custom fields.
- Custom fields are never used in commission or routing logic (they stay descriptive). A field that starts to drive logic gets promoted to a first-class column by a later CR.

### 3.4 Import profile for this register
A saved M07 mapping profile **"Office sales register"** using these headers as synonyms, with:
- date formats `dd-mm-yyyy`;
- `Type` → line + category;
- `Port/Fresh/Rollover` → business type;
- `Family Size/Model` → health cover type or motor model, depending on `Type`;
- `SI/IDV` → sum assured;
- `Final Premium` / `Premium w/o GST` / `Prem. with GST` → net/gross with a tax check;
- `Commission` / `%` / `Invoice No.` → a RECEIVED commission entry (M10) linked to the imported policy.

## 4. Correctness issue found while mapping (fix now, independent of this CR)
Insurer commission is paid on premium **excluding GST**. The M10 LLD said `expectedCommission(premiumPaise, ratePct)` without specifying the base. It is corrected to use `premium_net_paise` (premium without GST); see the M10 spec update. Health/motor quotes in M06 already separate base and tax.

## 5. Decisions

- **D1 (2026-10-03, customer):** "SAURABH" in the sample is the person who referred the client. The register's *Reference* column maps to `referred_by_name`; the import tries to resolve it to an existing party or team member (exact normalised-name match within the tenant, shown for confirmation, never auto-merged) and otherwise keeps the free text. Referrer attribution feeds MIS ("business by referrer") and, if the tenant later pays referral fees, M10 — no payout logic is in scope.
- **D2 (import safety, from the same sample):** in the sample row the name appears one column right of *Reference* (under *Commission*), with *IN HOUSE* under *SOURCE*. The "Office sales register" import profile therefore maps columns by header with a preview-and-confirm step, and a non-numeric value in a money column (Commission, premiums, SI/IDV) is a row-level error shown in the preview — never read as zero or silently shifted.
- **AC-CR001-06:** importing a register row whose *Reference* is "SAURABH" stores `referred_by_name = 'SAURABH'`, leaves `seller_member_id` unchanged, and links `referred_by_member_id` only after the importer confirms a suggested match; a row with text in *Commission* is rejected with `invalid_amount` naming the column.

## 6. Impact and plan
| Step | Change | Module |
|---|---|---|
| 1 | Kernel: `CustomFieldRegistry` (definitions, validation, PII class rules), `SchemaRegistry` for typed jsonb payloads | M00 (extension) |
| 2 | Add §3.1 columns and §3.2 risk details to the M07 LLD and DDL before the M07 build; `PolicyCommercials` value object shared with M09 `PolicySale` | M07, M09 |
| 3 | Import profile "Office sales register" + header synonyms; commission columns create M10 entries | M07, M10 |
| 4 | M10 commission base = net premium; invoice number/date on RECEIVED entries | M10 |
| 5 | Lead/sale attribution: `business_source` and `referred_by` aligned with M04 `LeadSource` / `referrerPartyId` | M04, M07, M09 |
| 6 | Screens: held-policy detail sections per line (motor/health), custom fields section, admin screen for field definitions (W11 Configuration) | web |

Acceptance criteria (to be added to the module specs when approved):
- **AC-CR001-01** Importing the sample row creates the party (masked contact), a HEALTH held policy (category HEALTH_INDIVIDUAL, business type FRESH, booked 2026-07-02, risk start 2026-07-02, expiry 2027-07-01, SI ₹10,00,000, gross ₹29,466) and links the seller.
- **AC-CR001-02** Motor rows validate the registration number format, NCB values and OD + TP ≤ net premium.
- **AC-CR001-03** Net + tax = gross is enforced; commission is computed on net.
- **AC-CR001-04** A tenant can add a reportable custom field (e.g. "Branch code"), map an import column to it and filter reports by it; P3 custom fields are refused.
- **AC-CR001-05** P2 risk/custom fields never appear in Twenty projections, logs or AI prompts.
