# 04 · API conventions and endpoint catalogue

## 1. Conventions

| Concern | Rule |
|---|---|
| Base path | `/api/v1`. Breaking change → `/api/v2` route alongside; deprecation header `Sunset`. |
| Style | Resource-oriented REST, JSON, `camelCase` fields, plural nouns. Actions that are state transitions use sub-resources: `POST /leads/{id}/stage-transitions`, `POST /proposals/{id}/submissions`. |
| Tenant | **Never** in the path or body. Resolved from the `Host` header via the tenant directory, cross-checked with the token's `org` claim (HLD K3). Mismatch → 403 `tenant_mismatch`. Operator APIs under `/api/v1/ops/*` use the workforce realm and `platform.operator` role. |
| Auth | `Authorization: Bearer <JWT>`. Claims used: `sub` (user ref), `org` (tenant id, exactly one), `roles` (string[]), `mid` (member id), `ou` (org-unit id). Dev/test verifier: HS256; production: Keycloak JWKS RS256. |
| Authorisation | Role → permission matrix per module (declared in the LLD) checked by `@RequirePermission('crm.lead.write')`; record scope (own / org-unit subtree / tenant) applied in queries. |
| Validation | zod schemas at the controller; 400 Problem Details with `errors: [{ path, code, message }]`. Unknown fields rejected (`strict`). |
| Errors | RFC 9457 `application/problem+json`: `{ type, title, status, detail, code, traceId, errors? }`. `type` = `https://errors.iap.example/<code>`. `detail` never contains personal data. |
| Pagination | Cursor based: `?limit=25&cursor=<opaque>`; response `{ items, nextCursor }`. `limit` max 100. |
| Filtering/sort | `?stage=NEW&ownerId=me&sort=-createdAt`; only fields whitelisted in the LLD. |
| Idempotency | `Idempotency-Key` header **required** on every `POST` that creates or triggers an external effect. Same key + same body → stored response replayed (status + body); same key + different body → 409 `idempotency_key_reuse`. Keys retained 24 h (external submissions: 30 days). |
| Concurrency | `ETag: "v<version>"` on GET; `If-Match` required on `PATCH`; mismatch → 412. |
| Tracing | Accepts and returns `traceparent`; response header `x-trace-id`. |
| Time | ISO-8601 UTC in APIs; local (IST) only in UI formatting. Dates without time as `YYYY-MM-DD`. |
| Money | `{ "amountPaise": 1234500, "currency": "INR" }`. |
| Performance budget | Reads p95 < 400 ms, writes p95 < 800 ms (excluding insurer calls). Used as the observability "slow" threshold. |
| OpenAPI | Generated from zod schemas at `GET /api/v1/openapi.json`; each LLD contains the authoritative contract. |

## 2. Standard responses

| Status | When |
|---|---|
| 200 | Read, update |
| 201 | Created (with `Location`) |
| 202 | Accepted, outcome pending or unknown (`UnknownOutcomeError`); body has a status resource link |
| 204 | No content |
| 400 / 401 / 403 / 404 / 409 / 412 / 422 | See 01-engineering-standards §4 |
| 429 | Rate limit (per tenant per plan), `Retry-After` |
| 503 | Dependency down and no degraded path; `Retry-After` |

## 3. Endpoint catalogue

Detailed schemas live in each module LLD. ✱ = requires `Idempotency-Key`.

### Kernel / platform (M00)
| Method | Path | Purpose |
|---|---|---|
| GET | `/health/live`, `/health/ready` | Liveness/readiness (not logged, not sampled) |
| GET | `/metrics` | Prometheus text |
| POST | `/api/v1/telemetry/client-errors` | Web client errors and vitals (sampled, deduped) |
| PUT/GET/DELETE | `/api/v1/ops/log-overrides` | TTL-bound debug overrides (operator) |
| GET | `/api/v1/me` | Current user, tenant, roles, permissions, feature flags |

### M01 Tenant & Entitlements
| Method | Path | Purpose |
|---|---|---|
| POST ✱ | `/api/v1/ops/tenants` | Provision tenant (saga start) |
| GET | `/api/v1/ops/tenants` | Operator list with plan, status, cell |
| PATCH | `/api/v1/ops/tenants/{id}` | Suspend/resume, plan change |
| GET | `/api/v1/tenant` | Current tenant profile, entity type, limits |
| GET | `/api/v1/tenant/entitlements` | Plan limits + usage + feature flags |
| GET/PUT | `/api/v1/tenant/tie-ups` | Tie-ups per line (validated against entity-type limits) |
| GET/PUT | `/api/v1/tenant/brand-kit` | Brand tokens with contrast check |
| GET | `/api/v1/public/tenant-config` | Unauthenticated: brand + locale for the host (login screen) |

### M02 Distribution Network
| Method | Path | Purpose |
|---|---|---|
| GET/POST ✱ | `/api/v1/org-units` | Hierarchy tree / create unit |
| GET/POST ✱ | `/api/v1/members` | List (filter by role, status, unit) / invite |
| GET/PATCH | `/api/v1/members/{id}` | Profile, capacity, skills, unit move |
| POST ✱ | `/api/v1/members/{id}/status-transitions` | Activate, suspend, exit (evidence checklist enforced) |
| POST ✱ | `/api/v1/members/{id}/licences` | Record licence, expiry |
| GET | `/api/v1/licences/expiring?withinDays=30` | Expiry alerts |
| GET/PUT | `/api/v1/roles/{role}/permissions` | Role permission editor (locked permissions immutable) |

### M03 Party & Consent
| Method | Path | Purpose |
|---|---|---|
| POST ✱ | `/api/v1/parties` | Create party (runs dedup; returns candidates) |
| GET | `/api/v1/parties?q=` | Search by name / phone / policy no. (hash lookup) |
| GET/PATCH | `/api/v1/parties/{id}` | Profile (P2 masked unless permission) |
| GET/POST ✱ | `/api/v1/parties/{id}/consents` | Ledger / record consent or withdrawal |
| GET | `/api/v1/parties/{id}/contactability?channel=&purpose=` | Consent + suppression decision |
| GET/POST | `/api/v1/households/{id}/members` | Household roles |
| GET | `/api/v1/duplicates` | Open duplicate pairs |
| POST ✱ | `/api/v1/duplicates/{id}/merge` | Merge with field-level survivor choice |

### M04 CRM Engagement
| Method | Path | Purpose |
|---|---|---|
| POST ✱ | `/api/v1/leads` | Capture lead (consent, dedup, routing) |
| GET | `/api/v1/leads` | Workspace list with saved-view filters, SLA state |
| GET | `/api/v1/leads/{id}` | Lead record with timeline |
| POST ✱ | `/api/v1/leads/{id}/stage-transitions` | Move stage (entry rules) |
| POST ✱ | `/api/v1/leads/{id}/assignments` | Reassign (eligibility) |
| POST ✱ | `/api/v1/leads/bulk-assignments` | Bulk assign |
| POST ✱ | `/api/v1/leads/{id}/activities` | Log call/note/message |
| POST ✱ | `/api/v1/leads/{id}/conversion` | Convert to opportunity with attribution |
| GET/POST ✱ | `/api/v1/tasks`, PATCH `/api/v1/tasks/{id}` | My/team tasks, complete with outcome |
| GET | `/api/v1/opportunities?view=board` | Pipeline with premium totals per stage |
| POST ✱ | `/api/v1/opportunities/{id}/stage-transitions` | Move (ISSUED only via insurer event) |
| GET/PUT | `/api/v1/routing-rules` | Ordered rules |
| POST | `/api/v1/routing-rules/simulations` | "Test a lead" |
| GET | `/api/v1/my-work` | Today: tasks, dues, follow-ups (CRM Port `listMyWork`) |

### M05–M14 (summary; detailed in each LLD when built)
| Module | Key endpoints |
|---|---|
| M05 Catalogue | `GET /products`, `GET /products/{id}/versions`, `POST /comparison-scopes/evaluate` |
| M06 Advice & Quote | `POST /needs-analyses`, `POST /quotes` ✱, `POST /quotes/{id}/benefit-illustrations/{bi}/acknowledgements` ✱, `POST /advice-records` ✱ |
| M07 Book & Retention | `GET /policies`, `GET /dues?month=`, `POST /dues/{id}/outcomes` ✱, `POST /book-imports` ✱, `POST /book-imports/{id}/rows/{row}/review` |
| M08 Integration Hub | `GET /integrations`, `GET /dead-letters`, `POST /dead-letters/{id}/replay` ✱, `POST /webhooks/insurers/{insurer}` (signed) |
| M09 Proposal | `POST /proposals` ✱, `PATCH /proposals/{id}/sections/{s}`, `POST /proposals/{id}/submissions` ✱, `POST /proposals/{id}/reconciliations` ✱, `GET /proposals?status=` |
| M10 Commission | `GET/POST /commission-rules` ✱ (maker-checker), `GET /commissions`, `POST /commission-statements` ✱ |
| M11 Compliance | `GET/POST /ad-approvals`, `POST /content-approvals/{id}/decisions` ✱, `GET /audit-events`, `GET/POST /dsr-cases` ✱ |
| M12 Engagement | `GET/POST /campaigns` ✱, `POST /segments/preview`, `POST /messages` ✱ (consent recheck) |
| M13 Docs & AI | `POST /documents` ✱, `GET/PUT /ai/skills`, `POST /ai/skills/{skill}/invocations` ✱ |
| M14 Content | `GET /content/pages/{slug}`, `POST /content/drafts` ✱, `POST /content/{id}/publish` ✱ (approval gate) |
