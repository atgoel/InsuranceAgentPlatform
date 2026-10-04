# ADR-008 Agent PWA: build incrementally

Status: **Accepted** (2026-10-04, approved by the user in the orchestrator session as decision D2).

## Context
The HLD calls the agent app a PWA. No LLD specifies installability, a service worker, offline caching rules or phone access over HTTPS. Only Today has offline behaviour (AC-M04-29: cached my-work, queued activity logs). Findings PWA-01…PWA-06 in `docs/quality/demo-readiness-findings.md`.

## Decision
This ADR covers exactly these decisions.
1. **Foundation once, now.** Right after the shells (WP-A2): web app manifest, icons, Apple touch meta, a service worker that precaches only the app shell (never API responses), an update-available prompt and an install entry in the app bar menu. Library: `vite-plugin-pwa` (Workbox) as a web dev dependency.
2. **Phone access over HTTPS** as an optional Docker profile (TLS reverse proxy with a local CA or a tunnel), with Keycloak hostname, client redirect URIs and the tenant host map driven by one variable.
3. **Offline per module.** Each module's LLD frontend section states what its screens cache (fields, storage, lifetime, cleared on sign-out) and which writes may be queued; the module builds it with its screens. No module caches personal data that its LLD does not list.
4. **No separate PWA module** and no parallel all-screens offline track.

## Consequences
- About one day for the foundation and the HTTPS profile; a few hours per module afterwards.
- Session storage stays as it is; whether an installed app should keep the user signed in across launches (refresh token in `localStorage` versus Keycloak SSO cookie) is a separate security decision, not covered here.
