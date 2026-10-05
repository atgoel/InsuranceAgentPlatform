# Owner names, customer "Create opportunity" and the brand-badge plan flag

Status: Proposed

Approval: on 2026-10-05 the user required owner names on customer, lead and pipeline screens and a working "Create opportunity" on the customer screen. The API shapes below are the orchestrator's proposal and are not approved yet.

## Context

- Customer, lead and opportunity views carry only `ownerMemberId`. Sellers have no `distribution.member.read`, so the web cannot call `GET /members` to resolve names. Screens show raw ids or nothing.
- M03 §frontend says "Create opportunity" navigates to `/crm/pipeline/new?partyId=`. That route does not exist, and M04 has no route that opens an opportunity for an existing customer: today only lead conversion and the renewal job create one.
- M01 §frontend says the brand "Hide badge" toggle is disabled unless the plan allows it, but `GET /tenant/entitlements` does not return `Plan.canHidePoweredBy`.

## Decisions to approve

1. **Owner names, resolved on the server.** M02 exposes a read port `MemberNameReader.names(tx, memberIds: string[]): Promise<Map<string, string>>` (token `MEMBER_NAME_READER`; display names of members of the caller's tenant, under RLS). Read views gain one optional field, `ownerName?: string`, next to `ownerMemberId`: M03 `PartyListItem` and `PartyView`; M04 lead list item and `LeadDetailView`; M04 `OpportunityView` (board cards). One batched lookup per response. A missing member leaves `ownerName` absent. Staff display names are not customer personal data.
2. **Create opportunity for a customer.** New M04 route `POST /opportunities` ✱ (`crm.opportunity.write`) with body `{ partyId, productInterest: ProductLine, title: string(3..120), expectedPremiumPaise: integer ≥ 0 }` → 201 `OpportunityView`. It uses `Opportunity.open` with `startStage: 'DISCOVERY'`; the owner is the caller's member id. The party must exist and be in the caller's record scope (otherwise 404 `not_found`). The web opens a sheet from the customer record and the customers household panel (product line, title, expected premium in ₹, converted to paise), then goes to `/crm/pipeline`. The non-existent `/crm/pipeline/new` link is dropped from M03 §frontend.
3. **Brand badge flag.** `GET /tenant/entitlements` adds `canHidePoweredBy: boolean` to its `plan` object, so the "Hide badge" toggle is disabled when it is false.

## Consequences

- Spec sections to change on acceptance: M02 §4 (port), M03 §6 view types and §frontend customers row, M04 view types, route table and §frontend, M01 §5 `entitlements` and the route table.
- New ACs: owner name shown on each of the three views (and absent, not an error, for an unknown member); `POST /opportunities` creates DISCOVERY with the caller as owner, rejects an out-of-scope party with 404, and is idempotent; the brand toggle is disabled when `canHidePoweredBy` is false.
