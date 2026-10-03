# M14 · Content & White-label — low-level design

Status: Ready for build · Depends on: M01 (brand kit, hosts, plans), M05 (product governance data), M11 (publish gate + disclosures), M13 (assets/documents) · Requirements: Rev 3.0 F41, F61–F68, F81 (agent microsite / visiting card), F82 (greetings and social creatives), F95 (white-label packaging), F66 (EN/HI + two pilot languages, SEO basics) · HLD D2/§6 (Strapi behind a Content Port; Strapi calls Compliance before any publish), §8 (marketing text cannot overwrite insurer pricing or wording) · Screens: W08 `WhiteLabel`, W13 `ContentLibrary`, `CampaignPublish`, `FormTemplates`, public microsite and share cards

## 1. Responsibilities
- **Content Port** in front of Strapi: the BFF/Core never talks to Strapi directly. Content types: pages (home, product, contact, FAQ, article), campaign pages with lead forms, collateral assets (brochures, approved wording), greeting/social templates, form templates. Strapi holds drafts and versions; **Core holds the publish decision** (M11 gate) and the published snapshot index used by the PWA/microsites and by AI grounding (M13).
- **Workflow** (F63 lite): author → publisher roles, states DRAFT → IN_REVIEW → APPROVED → PUBLISHED → UNPUBLISHED, version history and rollback to a previous published version.
- **Product content governance** (F67): content linked to product versions shows UIN and wording version; becomes **stale** when the product version is withdrawn or the wording changes (M05 events) and is auto-unpublished from product contexts with a warning.
- **Brand rendering** (F41/F95): tenant brand kit (M01) → design tokens (colours with WCAG AA check reuse from M01 contrast util, typography incl. Indic fonts, logo) for PWA, microsites, share cards and emails; custom domains (M01 verified hosts), powered-by toggle by plan.
- **Agent microsite & visiting card** (F81): per member page under the tenant brand with registration details (M11 disclosures), languages, lead form (M04 public capture with campaign id) — only approved content.
- **Greetings & social creatives** (F82): festival/birthday/product templates rendered server-side to PNG with branding and language; product creatives only from approved collateral; every render passes the publish gate.

## 2. Module layout
```
apps/core/src/modules/content/
  domain/ content-item.ts (State + versions), governance.ts (staleness rules), brand-tokens.ts (BrandKit → tokens, contrast), microsite.ts, creative-template.ts (slots, languages), form-template.ts (field definitions, consent version, anti-spam flags), events.ts
  application/ ports.ts (ContentPort: Strapi adapter contract; Renderer for share images), content.service.ts, publish.service.ts (gate + snapshot), governance.subscriber.ts (M05 events), brand.service.ts, microsite.service.ts, creative.service.ts
  infrastructure/ strapi.content-port.ts (HTTP, via M08 reliability primitives), fake-content-port.ts, svg-renderer.ts (SVG → PNG via resvg-js), in-memory + pg repositories
  api/ content.controller.ts, publish.controller.ts, microsite.controller.ts (public), creatives.controller.ts, brand.controller.ts
  content.module.ts
apps/core/migrations/140_content.sql
apps/web/src/features/content/
```

## 3. Key rules
- **Publish** = `PublishService.publish(itemId, version)`: load from Content Port → classify (GENERIC_BRAND / PRODUCT / CAMPAIGN) → M11 `PUBLISH_GATE.check` with the content hash → allowed: store immutable published snapshot (body + disclosures appended + hash) and mark PUBLISHED; blocked: state stays APPROVED with the gate reason. Strapi webhooks never publish on their own (verified webhook only updates draft metadata).
- **Marketing never overrides insurer data**: product pages render premium/eligibility/wording facts from M05 at render time; content cannot contain fields named premium/sumAssured (schema validation) and a numeric-claims linter flags ₹ amounts and percentages for publisher review.
- **Staleness**: `catalogue.product_version.withdrawn` / wording change → linked published items flagged STALE, removed from product listings, publisher notified; articles without product links are unaffected.
- **Localisation**: every item has per-language variants (en required; hi + pilot languages optional); missing variant falls back to en with a "translation pending" flag; SEO metadata (title ≤ 60, description ≤ 160, canonical URL per tenant domain), sitemap per tenant domain.
- **Share cards**: rendered at 1080×1080 (social) and 1200×628 (link preview); text slots length-limited per template; disclosures footer mandatory; cached by (template version, variables hash, brand version).

## 4. API (`/api/v1`)
Content: `GET /content/items?type=&state=&lang=`, `POST ✱ /content/items/{id}/review-requests`, `POST ✱ /content/items/{id}/approvals`, `POST ✱ /content/items/{id}/publications` (→ gate decision), `POST ✱ /content/items/{id}/unpublication`, `POST ✱ /content/items/{id}/rollback` `{ toVersion }`; brand: `GET/PUT /brand/tokens` (read-through M01 brand kit); creatives: `GET /creative-templates`, `POST ✱ /creatives/renders` `{ templateId, language, variables, productVersionId? }` → image URL; microsites: `GET/PUT /microsites/me` (member), public `GET /public/microsites/{slug}` (host tenant) and `GET /public/content/{slug}` (published snapshots only); forms: `GET/PUT /form-templates`.
Permissions: `CMS_AUTHOR → content.read, content.write, content.review_request`; `CMS_PUBLISHER → + content.approve, content.publish`; `TENANT_ADMIN → content.*, brand.write`; sellers → `content.read, creatives.render, microsite.self`; `SOLO_OWNER → all of the above for own tenant`.

## 5. DDL — `140_content.sql`
`content_item` (strapi_id, type, state, current_version, product_version_ids, languages), `content_publication` (append-only snapshots: version, language, body_hash, body, disclosures, published_at, unpublished_at), `creative_render_cache`, `microsite` (member, slug unique per tenant, languages, sections), `form_template`; RLS on all.

## 6. Observability
Events `content.item.published/unpublished/stale`, `content.creative.rendered`; metrics `content_publish_decisions_total{allowed}`, `content_stale_items` (gauge), `content_render_ms` histogram; Strapi calls through M08 breaker (`integration_calls_total{adapter="strapi"}`).

## 7. Frontend
W13 `ContentLibraryScreen` (items by type/state/language, review/approve/publish with gate reasons, stale warnings, version history + rollback), W08 `WhiteLabelScreen` (brand tokens preview on PWA/microsite/share card mocks, domain status from M01, powered-by toggle by plan), `CampaignPublishScreen` (campaign page + form template + campaign id → publish), member microsite editor (sections, languages, preview with disclosures), share-card composer (template, language, variables, live preview, share).

## 8. Acceptance criteria
- **AC-M14-01** Workflow states and roles; only publishers publish; rollback republishes a previous version through the gate.
- **AC-M14-02** Publish always calls the M11 gate with the content hash; blocked items stay unpublished with the reason; Strapi webhooks cannot publish.
- **AC-M14-03** Published snapshots are immutable and carry mandatory disclosures; public endpoints serve only published snapshots of the host's tenant.
- **AC-M14-04** Product content shows UIN/wording version from M05 and goes STALE (and leaves product listings) on withdrawal or wording change.
- **AC-M14-05** Content schema rejects premium/sum-assured fields; numeric claims are flagged for review.
- **AC-M14-06** Brand tokens derive from the brand kit with AA contrast checks; powered-by toggle respects the plan.
- **AC-M14-07** Localisation fallback to English with a pending flag; SEO metadata limits; per-tenant sitemap.
- **AC-M14-08** Microsite shows registration disclosures and a lead form that captures with the microsite member as direct owner (M04 DIRECT_OWNER routing).
- **AC-M14-09** Share cards render at the two sizes with brand, language and disclosures; product creatives only from approved collateral; cache by template/variables/brand version.
- **AC-M14-10** Tenant isolation across items, publications, microsites and renders.
- **AC-M14-11** Postgres: append-only publications, slug uniqueness per tenant, RLS. *(integration)*
- **AC-M14-12** Content library, white-label, campaign publish, microsite editor and share-card composer screens as in §7.
