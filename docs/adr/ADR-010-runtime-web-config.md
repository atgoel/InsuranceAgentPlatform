# Runtime web configuration and local sign-out

Status: Accepted

Approval: on 2026-10-05 the user reported that switching between the phone profile and localhost mode left the browser "in phone mode", signed in as Priya Sharma, unable to sign out or switch persona. The orchestrator offered two ways to give the web app its Keycloak address at runtime: (a) derive it from the page address, or (b) a `/config.js` file that nginx serves from the stack's env. The user chose option (b) on 2026-10-05 for task T2 as described: runtime config plus a sign-out that completes locally when Keycloak cannot be reached. File, variable and global names below were chosen by the orchestrator when writing this ADR.

## Context

- The OIDC authority (`VITE_OIDC_AUTHORITY`), client id and demo-login flag are Vite build-time variables, baked into the web bundle as Docker build args (`infra/docker/web.Dockerfile`, compose `web.build.args`).
- Switching to or from the phone profile (ADR-008 decision 2, `docs/dev/phone-https.md`) therefore needs a web rebuild. The service worker (M00 §13.8, `registerType: 'prompt'`) keeps serving the previously precached bundle until the user clicks **Reload**, so a browser that visited in phone mode keeps sending sign-in and sign-out to `https://<host>:8443` after the stack is back on localhost.
- A second, isolated stack (`docs/dev/isolated-stack.md`) needs its own web image for the same reason (`IAP_WEB_IMAGE`).
- `signOut()` clears the app session and then calls `signoutRedirect()`. When Keycloak is unreachable, `oidc-client-ts` cannot load the end-session metadata, the promise rejects, `SignOutButton` shows "Sign-out failed" and the user stays on the signed-in screen.

## Decisions

1. **`/config.js` runtime config.** The web image serves `/config.js`, which sets `window.__IAP_CONFIG__ = { oidcAuthority, oidcClientId, demoLogin }`. An nginx entrypoint script (`/docker-entrypoint.d/`) writes it at container start from the env vars `IAP_OIDC_AUTHORITY`, `IAP_OIDC_CLIENT_ID` and `IAP_DEMO_LOGIN`; values are JSON-encoded. Compose sets them on the `web` service from the same expressions that feed `KC_HOSTNAME` and `AUTH_ISSUER` today, so the default, phone and second-stack renders all get the right authority without a rebuild. `index.html` loads `<script src="/config.js"></script>` before the app bundle.
2. **Precedence.** The web app reads `window.__IAP_CONFIG__` first and falls back to `import.meta.env.VITE_OIDC_AUTHORITY`, `VITE_OIDC_CLIENT_ID` and `VITE_DEMO_LOGIN` when the global or a field is absent (Vite dev server, unit tests). One accessor (`lib/config`) owns this; `oidc.ts` and `LoginPage` use it instead of `import.meta.env`. The Vite dev server keeps working unchanged.
3. **Never cached.** nginx serves `/config.js` with `Cache-Control: no-store`. The service worker does not precache it (excluded in `globIgnores`/`manifestTransforms`), so a mode switch takes effect on the next page load even when an older shell is precached.
4. **Local sign-out always completes.** `signOut()` reads the id token, then removes the stored OIDC user and clears the app session, then calls the Keycloak end-session redirect with that `id_token_hint`. If the redirect cannot start (metadata or network failure), the app navigates to `/login` instead of staying signed in. The Keycloak SSO session may then outlive the app session; the next "Sign in" with a different demo persona still goes through Keycloak with `login_hint`.

## Consequences

- Spec sections changed: M00 §13.7 (`oidc.ts`, `LoginPage`, new `lib/config`), M00 §13.8 (nginx headers, precache exclusion), new AC-M00-37 and AC-M00-38.
- Infra: `web.Dockerfile` drops the three build args (the image is environment-neutral); compose moves them from `build.args` to `environment`. `IAP_WEB_IMAGE` and the "second stack needs its own web image" note in `docs/dev/isolated-stack.md` become unnecessary; the phone doc drops `--build` for the web image.
- A browser that already holds a stale precached shell needs one **Reload** (update prompt) or "Clear site data" once; after that, mode switches need no client action.
- `/config.js` holds no secret: the authority URL, the public client id and the demo flag are already public in the bundle today.
