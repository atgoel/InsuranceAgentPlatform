# ADR-007 Keycloak sign-in and local demo stack

Status: Accepted (2026-10-04). The user approved A, B and C, then chose the options recorded in D4–D7 in the same session.

## Context
Spec I4 (`docs/spec/00-overview.md`) names a Keycloak JWKS verifier as a launch adapter, and M00 §5.1 deferred it to M02, which never specified it. The web app only had a development role picker that sent role labels (`agent`, `manager`) the backend does not know, sent no member id, and could not satisfy the MFA rule for privileged roles (M02 AC-M02-12). Nothing could be shown to a client end to end.

## Decisions
This ADR covers exactly these decisions.

1. **(A) Role codes.** The web sign-in uses the backend role codes from M02 §3 (`SALESPERSON`, `BRANCH_MANAGER`, `TENANT_ADMIN`, `PRINCIPAL_OFFICER`, `OPS`). Lowercase role labels are removed.
2. **(B) MFA for demo users.** The development Keycloak realm asserts `amr: ["pwd","mfa"]` for privileged demo users through a user attribute and mapper. This is development data only; a production realm must obtain `mfa` from a real second factor. `POST /api/v1/dev/tokens` is unchanged.
3. **(C) Demo seed.** `scripts/demo-seed.mjs` creates demo data only through existing public API routes (signed with a development HS256 token, as the test fixtures do) and the Keycloak admin REST API. It is idempotent: it does nothing when the demo branch already exists.
4. **Sign-in flow.** The web app signs in with OIDC authorization code + PKCE against Keycloak, using the `oidc-client-ts` library (no hand-written OIDC or crypto). The login screen shows a persona dropdown (name and role); "Sign in" redirects to the Keycloak hosted login with `login_hint` set to the persona's username. The persona list and the demo password are shown only when `VITE_DEMO_LOGIN=1`; otherwise the screen shows a single "Sign in" button.
5. **Claims.** One realm `iap` (the HLD "customers" realm). Each user carries attributes `org`, `mid`, `ou`, `amr`; protocol mappers on the web client put them in the access token, map realm roles to a `roles` claim, add a hard-coded `realm: "customers"` claim and add audience `iap-core`. Keycloak Organizations (HLD K1) are deferred.
6. **Backend verification.** `JwksTokenVerifier` verifies RS256 tokens against the Keycloak JWKS with `node:crypto` (no new dependency), caching keys by `kid` and refetching at most once per minute on an unknown `kid`. It applies the same claim rules as `HmacJwtVerifier` (sub, org, exp with 30 s leeway, issuer, audience; `aud` may be a string or an array). `CompositeTokenVerifier` picks the verifier by the JWS header `alg`: `RS256` → JWKS (only when configured), `HS256` → HMAC; anything else → `invalid_token`. New configuration: `AUTH_JWKS_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE` (`KernelConfig.jwksUrl`, `tokenIssuer`, `tokenAudience`, all optional).
7. **Docker.** `infra/dev/docker-compose.yml` profile `app` adds Keycloak 26 (`start-dev --import-realm`, http://localhost:8180, realm file `infra/dev/keycloak/iap-realm.json`). `KC_HOSTNAME=http://localhost:8180` keeps the issuer identical for the browser and for the core container, which fetches keys from `http://keycloak:8080`. Demo personas: salesperson, branch manager, tenant admin, principal officer, ops — all in tenant `ten_acme`.

## Consequences
- Keycloak `sub` is not yet the member's `userRef` (members are created through `StubIdentityAdmin`); the seed links them through the `mid` attribute. A real Keycloak `IdentityAdmin` adapter remains future work.
- HS256 tokens stay accepted wherever `AUTH_HS256_SECRET` is set, so tests and the seed keep working.
