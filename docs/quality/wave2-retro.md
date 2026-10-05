# Wave 2 retrospective (2026-10-04/05)

Planned as "small web packages". Actual: one session over 3+ hours, one context compaction. The session delivered 6 web packages, 2 ADRs and their backend and web builds, 3 fix batches and 5 clean-up tasks. About 17 agent runs; a single run used 60k–155k tokens and took 10–45 min.

## What happened (facts)
- Scope grew in the middle of the session. The UI sweep and the agent builds exposed spec gaps: no segment filter, no owner names, no create-opportunity route, no `canHidePoweredBy`. Each gap needed a user decision, then an ADR, then backend and web builds, all in the same session.
- Decisions came in 4 rounds (lead chips, ADR-M03, choices 1–8, ADR-009). Each round waited on the user and grew the context.
- Verification ran many times: a full core, web or int gate after almost every merge. Each run took 2–5 min. External Codex processes loaded the machine, so tests hit their 5 s timeout and needed reruns and diagnosis.
- Agent hand-backs were long (40–60 lines). The orchestrator read diffs and screenshots (images are costly).
- Rework:
  - The Haiku gate fix claimed "passes", but the test never ran. New worktrees have an empty `node_modules`, and the brief did not require `npm ci`.
  - The i18n agent's worktree predated the gate fix.
  - Two flaky tests surfaced only in the full run.
- Serial waits: the i18n work had to wait for the web merge because both edit the same `messages.*.ts` files.

## 5 Whys — why did the session cost so many tokens and so much time?
1. Why so many tokens? The context held a whole wave: 6 packages, 2 ADRs, fixes, clean-up, hand-backs, gate output and screenshots. It reached compaction, then kept growing.
2. Why a whole wave in one session? The plan's unit was a *wave*, not a session-sized batch. The session protocol says "one module or bounded task", but the wave split into a session only by agent parallelism, not by context size.
3. Why did scope grow mid-wave? Spec gaps (missing routes, fields and decisions) were found during the build and sweep, not before it. Each gap needed an ADR round and new backend work.
4. Why were the gaps not found earlier? There was no pre-build "contract check" of each screen against its LLD routes and view types. The plan assumed the web packages were web-only.
5. Why was there no pre-build check? The planning template has no "readiness gate": for each screen, every field and route it needs exists in the LLD, and every open decision is approved. Building started from the wireframe, not from the contract.

Secondary chain (time): the full gates were repeated per merge, under machine load, so they hit timeouts, reruns and flaky-test hunts. The root causes: there was no merge-train rule (gate once after all merges), and no rule to stop external load before gates.

## What to do differently
1. **Readiness gate before a wave.** One cheap investigator run (read-only) lists, per screen, the fields, routes and decisions it needs, and any that are missing from the LLD. All missing items go to the user in **one** decision round, as Proposed ADRs. Building starts only when that list is empty.
2. **Session = one batch of at most 3 agent tasks with disjoint files.** The plan names the session boundaries. Stop at the batch end: write the handover, commit, start a new session. Never continue past compaction risk.
3. **Merge train.** Agents run *targeted* gates (`gate.mjs web|core <paths>`). The orchestrator merges every branch of the batch, then runs each full gate **once**: core, then web, then int only if Postgres code changed, then smoke. Rerun only failing files.
4. **Quiet machine.** Stop external heavy processes (e.g. Codex) before the full gates. If a test fails only under load, file it as flaky and move on. Do not chase it in the same session.
5. **Worktree bootstrap.** Every brief starts with: "run `npm ci`; confirm `node_modules/vitest` (web) or `node_modules/jest` (core) exists". Plan WP-E2 should script this.
6. **Short hand-backs.** Cap them at about 15 lines: files changed, gate lines, deviations with file:line, revert-proof result. No narrative.
7. **Cheap review first.** Review the `git diff --stat` and only the risky hunks: money, state, security, crypto. Look at screenshots only at batch end, at most 3 images.
8. **Model choice.** Use Sonnet for builders. Use Haiku only for exact text edits with no verification claim. Rerun any claim that matters.
9. **Shared-file serialisation.** Plan i18n keys, `nav.ts` and the other shared files as the *last* task of the batch, or give them to one owner, so other tasks do not wait.
