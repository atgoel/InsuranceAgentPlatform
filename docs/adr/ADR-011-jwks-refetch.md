# JWKS refetch under concurrency and failure

Status: Accepted

Approval: the user approved this decision on 2026-10-06 (task T1 `jwks-race`).

## Context

After a core restart the first sign-in returned 401. `JwksTokenVerifier.refetchIfAllowed` set `lastFetchAt` before it awaited the JWKS fetch. Requests that arrived while the first fetch was pending saw the 60 s throttle as used, did not wait, and failed with `Unknown kid`. A failed fetch (Keycloak still starting) also blocked every retry for 60 s.

## Decision

1. Concurrent callers share one in-flight JWKS fetch and wait for its result.
2. The 60 s refetch throttle starts only after a successful fetch. A failed fetch does not start it, so the next unknown-`kid` call fetches again.

## Consequences

- M00 LLD §`JwksTokenVerifier` comment and AC-M00-33 state both rules.
- During a Keycloak outage each unknown-`kid` request can start a fetch, but never more than one at a time.
