# Architecture decision records

| ADR | Decision | Status |
|---|---|---|
| ADR-001 | BFF and Domain Core ship as one NestJS modular monolith; module boundaries enforced by lint (spec 00 §I1) | Accepted |
| ADR-002 | Four layers per module (domain/application/infrastructure/api), dependencies inward only (I2) | Accepted |
| ADR-003 | Every repository port has an in-memory and a Postgres adapter sharing one contract suite (I3) | Accepted |
| ADR-004 | Twenty, Strapi, Keycloak reached only through ports; launch adapters Solo-CRM-lite, HS256 dev verifier, Strapi REST client (I4) | Accepted |
| ADR-005 | Tail-based log sampling: debug detail buffered per request, flushed only on error/slow/forced (spec 02) | Accepted |
| ADR-006 | HLD Rev 1.0 (Twenty + Strapi) supersedes Rev 2.0's custom CRM + Payload proposal; Rev 2.0 funnel, roles and data-model refinements adopted (spec 05) | Accepted |
| [ADR-007](ADR-007-keycloak-sign-in-and-demo-stack.md) | Keycloak OIDC sign-in (PKCE, persona login), RS256 JWKS verifier, dev-realm claims and local Docker demo stack with seed | Accepted |
| [ADR-008](ADR-008-pwa-incremental.md) | Agent PWA built incrementally: shell foundation + HTTPS phone profile once, offline rules per module | Accepted |
| [ADR-M08-contract-clarifications](ADR-M08-contract-clarifications.md) | Integration hub decisions 1–7 | Accepted |
| [ADR-M08-integration-hub](ADR-M08-integration-hub.md) | Integration hub decisions 8–13, recorded amendments and five simple implementation contract completions | Accepted |
| [ADR-M08-future-evolution](ADR-M08-future-evolution.md) | Larger-scale alternatives, comparison estimates and revisit triggers; implementation not authorized | Proposed |
