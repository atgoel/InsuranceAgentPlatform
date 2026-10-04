# WP-C1 findings: BUG-10, BUG-11, BUG-12

Method: live core on localhost:3000, tenant ten_acme, branch Mumbai West. Tokens are HS256 dev tokens with the same claims
(`org`, `roles`, `mid`, `ou`) the Keycloak mappers emit (`infra/dev/keycloak/iap-realm.json`), minted as in `scripts/demo-seed.mjs`.
`iap-web` has direct grants disabled, so real Keycloak tokens were not minted. Personas: priya.sales (SALESPERSON), rahul.manager (BRANCH_MANAGER).
Result: all three are web bugs. No change in apps/core.

## BUG-10 Leads tab badges show 0
- Route: `GET /api/v1/leads/stats`, `GET /api/v1/leads?...`. Persona: priya.sales and rahul.manager (identical).
- Actual: stats `{"open":5,"unassigned":0,"slaMetPct7d":75,"leadToIssuedPct90d":null}`.
  `/leads?owner=me` returns 8 items; `/leads?sla=breached` returns 2 (Rohan Deshmukh, Asha Patil); `/leads?owner=unassigned` returns 0.
- LLD: M04 section 4 route table: `LeadStats = { open, unassigned, slaMetPct7d, leadToIssuedPct90d }`. No count for SLA breached or Mine. Section 409: saved-view chips are All open / Unassigned / SLA breached / Mine.
- Cause: `apps/web/src/features/crm/screens/LeadsWorkspaceScreen.tsx:145-148` hardcodes `count: 0` for all four chips. `MobileLeadsScreen.tsx:36` builds views with no count at all.
- Verdict: web-bug. API matches LLD.
- Owner: B3 LeadsWorkspaceScreen and B1 MobileLeadsScreen.
- What to render: All open = `stats.open` (5). Unassigned = `stats.unassigned` (0).
  SLA breached and Mine have no stats field. LLD adds none, so derive them from the lists (`sla=breached` returns 2; `owner=me` returns 8, which includes closed stages, so filter to open stages to be consistent with "open"), or hide those two badges. Do not add a stats field without an LLD change (orchestrator decision).
- Note: `stage=NEW,CONTACTED,QUALIFIED,PROPOSAL` returns 400, so PROPOSAL is not a lead stage; take the open stage list from the web `LeadStage` type, not from guesses.

## BUG-11 Customers list shows 0 for the seller
- Route: `GET /api/v1/parties?limit=25` (the web calls this; `/customers` does not exist, 404). Persona: priya.sales.
- Actual: 200, 6 items (Arjun Reddy, Farhan Khan, Lakshmi Pillai, Mahesh Gupta, Pooja Nambiar, Rekha Saxena), no nextCursor; rahul.manager gets the same.
  `q=arj` and `q=Arjun` match; `q=a` returns 0 (name prefix needs 2 chars); `q=9820` returns `{"items":[],"kind":"name"}`.
  `tag=with_dues` returns 0 items.
- LLD: M03 section 259 `GET /parties?q=&tag=&householdId=&limit=&cursor=`; section 244 search: min 2 chars for name prefix, mobile only for a full 10-digit or +91 number. Record scope applies; the 6 seeded parties are priya's.
- Cause: `apps/web/src/features/party/screens/CustomersScreen.tsx:25-29` `SEGMENT_OPTIONS` hardcodes `count: 0` for All / With dues / No policy.
  The segment ids `with_dues` and `no_policy` are sent as `tag=`, and the API treats `tag` as a party tag, so they return nothing. The list itself is unfiltered on first load and the API returns 6, so the grid should show 6 rows.
  I did not drive a browser, so the "0" in the finding may be only the chip counts. B4 must confirm in a real browser.
- Verdict: web-bug (chip counts hardcoded; segment ids misused as tags). API matches LLD.
- Owner: B4. What to render: All = `items.length` (6). Remove With dues and No policy, or source them from a defined LLD field (none exists in `PartyListItem`; this is an orchestrator spec decision).

## BUG-12 Servicing tracker "No open follow-ups"
- Route: `GET /api/v1/servicing-requests?followUpBefore=YYYY-MM-DD`. Persona: priya.sales and rahul.manager.
- Actual: no param returns 1 item `{"id":"srv_...","kind":"CLAIM","status":"OPEN","followUpOn":"2026-10-06","version":2,"notes":[]}`.
  `followUpBefore=2026-10-04` (today IST, the web default) returns `{"items":[]}`; `followUpBefore=2026-10-06` and `2026-10-07` return the item.
- LLD: M07 section 160: `followUpBefore` filters, items sorted by follow-up date. Section 179: the tracker shows open requests by follow-up date. Repo: `status not in (RESOLVED, REJECTED) and follow_up_on <= date`, so the filter is correct.
- Cause: `apps/web/src/features/book/screens/ServicingTrackerScreen.tsx:13` defaults `before` to `istToday()`. A follow-up dated 2026-10-06 is excluded, so the screen shows the empty state although an open request exists.
- Verdict: web-bug (default filter too narrow). API matches LLD.
- Owner: B2. What to render: on first load request without `followUpBefore` (all open, sorted by follow-up) or default to a wider horizon; keep the date control as an optional narrowing filter.
