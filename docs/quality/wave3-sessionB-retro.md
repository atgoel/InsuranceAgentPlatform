# Wave 3 Session B retrospective (2026-10-05)

Scope: WP-D2 (phone access over HTTPS) and WP-E2 (worktree bootstrap, clean-checkout image build), run in parallel with Session A (WP-B7, WP-D1) in another Claude session. One orchestrator session with 3 Sonnet builder runs: E2 (60k tokens, 7 min), D2 (69k, 4 min) and a seeder fix (77k, 7 min). No context compaction. Merges: 5beed22 (E2), f837d76 (D2), 68b3239 (Caddy fix), fa90e58 (seeder fix); handover 8569933.

## What went well
- **Readiness gate held.** A read-only check of ADR-008, the plan and the compose file found no spec gap before building. The one open choice (Caddy or a tunnel) was inside the accepted ADR, so no decision round was needed.
- **Peer coordination worked.** Messages to the Session A session settled two things in minutes: who owns D2, and the runtime conflict (phone mode changes the Keycloak issuer for every client on the shared stack). Both sessions listed their files, so the merges had no conflicts.
- **Batch size and hand-backs followed the Wave 2 rules.** There were 2 disjoint tasks plus 1 fix. Every brief started with `npm ci`. Hand-backs were 12 to 15 lines, and the agents told the truth about what they did not verify.
- **Claims were re-proved.** The E2 agent changed the `npm ci` call after its last real run. The orchestrator reran a real `worktree.mjs new` before accepting it.
- **We used our own tool.** The seeder fix worktree was created with the new `scripts/worktree.mjs` (PASS, npm ci 78 s).
- **The live check paid off.** The agents' static checks passed, but the live phone-mode boot found 2 real defects: the Caddy TLS handshake with no SNI, and the seeder skipping a second host. Both were fixed the same session, with tests and a revert proof.
- **Gate discipline held.** One full core gate after the merges, the flaky AC-M07-08 rerun alone (passed) and logged, and no int run because no Postgres code changed.
- **The shared stack was left as we found it.** Localhost mode was restored and verified (sign-in, service worker `activated`), and Session A was told.

## What can be improved
| # | What happened | Cost | Root cause |
|---|---|---|---|
| 1 | The Session A/B split was not written anywhere. `ui/d2` was already created by Session A, and our first `worktree add` failed with "branch already exists". | 2 message rounds; risk of two sessions building D2 | The plan names waves, not session batches or owners |
| 2 | The D2 agent reported "caddy validate: Valid" and "cert issued", but the first real HTTPS request failed (`SEC_E_INTERNAL_ERROR`, no SNI for an IP). | 1 diagnosis loop | The infra brief checked the config, not the protocol path; nobody made a real TLS request |
| 3 | The dev seeder skipped every DEV_TENANTS entry whose tenant already existed. The second host was a silent no-op, and requests on it got `tenant_not_found`. | 1 extra agent run | The seed rule "skip if exists" was tested for one host per tenant only (demo-readiness lesson 6, again) |
| 4 | Live checks waited on the other session. Phone mode changes a global setting (the issuer) on the one shared stack. | Idle wait | Fixed `container_name`s and ports allow only one stack per machine |
| 5 | The first sign-in after a core restart got 401s. The check ran when the container had "Started", not when it was healthy. Whether the 401 is real is still open. | 3 extra browser runs | No wait-for-healthy step in the ad hoc check |
| 6 | The orchestrator wrote inline Playwright scripts 5 times (login, token capture, header log, localhost check). | Tokens and time | `ui-sweep.mjs` has no `--ignore-https-errors` or single-route login mode |
| 7 | The full core gate ran twice, because the first run's output was cut to its last lines and hid the step summary. | About 4 min | The output filter came after the run, not with it |
| 8 | `npm ci` failed in the pre-created `../IMF-d2` (Windows ENOTEMPTY). The D2 agent carried on because its slice had no tests. | Broken worktree left until cleanup | The brief did not say to stop when bootstrap fails |

## Learnings (applied)
1. **The plan names session batches and owners.** Before a wave, write `Session A = …, Session B = …` with owned files into the plan. At session start, run `git worktree list` and `git log -3` before creating worktrees.
2. **Infra checks exercise the real protocol path.** "Config valid" is not done. Every network or TLS change needs one real request through it (`curl -k` to the real host and port, then a browser login), and the agent brief must say so.
3. **Seed and idempotent setup code reconciles; it does not skip.** "Already exists" must still apply the missing parts (hosts, URIs, roles). Test the second run and the many-to-one case.
4. **Global settings on the shared stack need a slot.** Anything that changes the issuer, hostnames or images of the shared stack is run by the orchestrator only, after the other sessions agree. Announce it before and after.
5. **Live checks wait for healthy.** Wait for `/health/live` (or `docker compose up --wait`) before browser checks. A failure in the first request after a restart is noted, not chased.
6. **Make repeated ad hoc checks into tools.** If the same scratch script is written twice, add it as an option to `scripts/ui-sweep.mjs` (proposed: `--ignore-https-errors`, `--login-only`).
7. **Filter gate output when you run it.** Use `node scripts/gate.mjs core 2>&1 | grep -E "^(PASS|FAIL)|●"` on the first run.
8. **Bootstrap failure stops the agent.** If `npm ci` or `worktree.mjs check` fails, the agent stops and reports. It does not build on a broken worktree.

## Follow-ups
- Real-phone check (`docs/dev/phone-https.md`): CA install, "Install app", service worker over HTTPS.
- Investigate the post-restart 401 on `/me` and `/my-work`.
- Proposed: `ui-sweep.mjs --ignore-https-errors --login-only` (learning 6), and an option for a second compose project with its own ports (learning 4). Both approved by the user on 2026-10-05; planned as the next batch in `docs/HANDOVER.md`.
