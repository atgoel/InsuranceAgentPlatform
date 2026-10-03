# M13 · Documents & AI Gateway — low-level design

Status: Ready for build · Depends on: M00, M01 (entitlements/credits), M03 (consent, protected accessor), M05 (catalogue content), M07 (held policy drafts), M14 (approved content for grounding) · Requirements: Rev 3.0 F38 (secure uploads), F49, F50 lite → F88, F51 → F90, F54 (skill controls), F87, F88, F89, F90, F99 (AI credits, limits, cost report); evaluation gates (95% policy fields, 85% draft acceptance, 90% voice capture, zero uncited answers) · HLD §14 (AI gateway and skills), §11 (classification, minimisation), Q11 (provider decision pending → stub provider) · Screens: W06 `AIControls`, M07 `AIDraft`, policy reader flow in M05 `BookImport`, voice note in lead/customer screens

## 1. Responsibilities
- **Document store pointers**: upload sessions to object storage (pre-signed PUT, size/type allow-list), **AV scan** status gate (no download or AI use until CLEAN), tenant-scoped keys, document records `doc_<ULID>` used by every module (`documentRef`), retention class, download via short-lived signed URL with audit.
- **AI Gateway**: the only path to models. Skill contract (typed I/O with zod, allowed tools, model + prompt version, timeout, cost ceiling, tenant enablement), **data minimisation** (consent check, P3 redaction unless the skill needs it, party ids tokenised), provider abstraction with region/no-training/retention terms, **human in the loop** (outputs are drafts), **audit** (AI interaction records), **cost control** (credits via M01 entitlements, hard limits, response cache for grounded Q&A).
- **Launch skills**: F87 policy reader (extract held-policy fields with source highlights → draft held policy for confirmation, protection-gap summary via M06 calculator), F88 vernacular drafting (follow-ups, due reminders, explainers using only approved claims → draft message for M12), F89 voice-to-CRM (transcript → activity + next action + task drafts for M04), F90 grounded product assistant (answers only from approved, versioned content within comparison scope, with citations; abstains on premium/eligibility/claim outcome).
- **Evaluation gates** in CI: curated sets per skill and language; a prompt/model version that fails cannot be enabled.

## 2. Module layout
```
apps/core/src/modules/ai/
  domain/
    document.ts           Document (UPLOADING → SCANNING → CLEAN | INFECTED | REJECTED), RetentionClass, AllowList
    skill-contract.ts     SkillContract<I, O> (id, version, inputSchema, outputSchema, promptVersion, modelPolicy, timeoutMs, maxCostCredits, tools, needsP3)
    minimiser.ts          Minimiser (Chain: ConsentRule → P3Redactor → PartyTokeniser → ContactMasker); reversible token map stays in Core
    grounding.ts          Passage, Citation, AbstentionPolicy (no passage ≥ threshold → abstain; topic classifier for premium/eligibility/claims → abstain)
    interaction.ts        AiInteraction record (skill, versions, inputRef hash, output, reviewer decision, cost, latency)
    evaluation.ts         EvalCase, EvalRun, Gate thresholds per skill
    skills/               policy-reader.skill.ts, vernacular-draft.skill.ts, voice-to-crm.skill.ts, product-assistant.skill.ts
  application/
    ports.ts              ModelProvider (complete/extract/transcribe/embed), ObjectStore, AvScanner, VectorIndex, CreditMeter (M01 EntitlementChecker 'ai_credits')
    document.service.ts, ai-gateway.ts (Facade + Template Method run pipeline), skill services per skill, review.service.ts, eval.runner.ts
  infrastructure/
    stub-model.provider.ts   deterministic provider for tests/dev (fixture-driven outputs, configurable latency/failure)
    memory-object-store.ts, fake-av-scanner.ts, pgvector-index.ts / in-memory-vector-index.ts
  api/ documents.controller.ts, ai.controller.ts, ai-admin.controller.ts
  ai.module.ts
apps/core/migrations/130_documents_ai.sql
apps/web/src/features/ai/
eval/ datasets per skill and language (synthetic, no real customer data)
```

## 3. Gateway pipeline (Template Method)
`AiGateway.run(skill, input, ctx)`:
1. **Authorise**: tenant enablement flag for the skill (W06) and principal permission `ai.<skill>`; SOLO plan limits.
2. **Validate** input with the skill's zod schema.
3. **Meter pre-check**: estimated credits ≤ remaining (`RateLimitedError('ai_credits_exhausted')` otherwise); per-request ceiling `maxCostCredits`.
4. **Minimise**: consent (M03 `AI_PROCESSING` purpose for the party when a party is involved — missing → `ForbiddenError('ai_consent_missing')`), redact P3 unless `needsP3` (policy reader on an agent-uploaded policy), tokenise party ids/names, mask contacts.
5. **Ground** (F90 only): retrieve passages from the tenant's approved content + in-scope catalogue (M05 scope filter **before** ranking); none → abstain.
6. **Call provider** with timeout; provider chosen by skill policy (smallest model passing its gate); region recorded.
7. **Validate output** with the output schema; invalid → one repair attempt, then fail closed.
8. **Detokenise** inside Core; **post-guards**: drafts never auto-send/save; F90 answers must carry ≥ 1 citation else replaced by abstention; F88 drafts checked against approved-claims list.
9. **Record** `AiInteraction` (no raw P3, input stored as hash + document refs), consume credits, metrics.

## 4. Skill contracts (selected)
- **policy-reader** `{ documentRef }` → `{ fields: { insurerName, productName, policyNumber, sumAssuredPaise, premiumPaise, mode, commencementDate, maturityDate?, nextDueDate?, holderName }; highlights: Array<{ field, page, bbox: [x,y,w,h], text }>; confidence: Record<field, number> }` → creates an M07 import review item (source AI_EXTRACTED, confidence) — never a held policy without confirmation.
- **vernacular-draft** `{ purpose: 'FOLLOW_UP' | 'DUE_REMINDER' | 'EXPLAINER'; language: 'en' | 'hi' | <pilot>; partyRef?: token; productVersionId?; facts: Record<string,string> }` → `{ text, claimsUsed: string[] }`; output may use only approved claims for the product (M14/M05).
- **voice-to-crm** `{ documentRef (audio ≤ 2 min) , subjectRef }` → `{ transcript, activity: { kind, outcome?, summary }, nextAction?: { kind, dueAt }, task?: { title, dueAt } }` → drafts in M04 awaiting confirmation; SensitiveContentGuard applied to summary.
- **product-assistant** `{ question, language, line? }` → `{ answer, citations: Array<{ contentId, version, excerpt }> } | { abstained: true, reason: 'no_source' | 'out_of_scope_topic' }`.

## 5. Application services and API
| Endpoint | Permission | Behaviour |
|---|---|---|
| `POST ✱ /api/v1/documents/upload-sessions` | `document.upload` | `{ fileName, mimeType, sizeBytes, purpose }` → pre-signed URL + `documentRef` (allow-list: pdf, jpg, png, heic, m4a/ogg for voice; ≤ 15 MB, voice ≤ 5 MB) |
| `POST /api/v1/documents/{ref}/complete` | `document.upload` | triggers AV scan; status SCANNING |
| `GET /api/v1/documents/{ref}` · `/download-url` | owner scope / `document.read` | metadata; 60-second signed URL only when CLEAN; audited |
| `POST ✱ /api/v1/ai/skills/{skill}/runs` | `ai.<skill>` | gateway run → draft output + interaction id |
| `POST ✱ /api/v1/ai/interactions/{id}/review` | `ai.<skill>` | `{ decision: 'ACCEPTED' | 'EDITED' | 'REJECTED', editedOutput? }` → applies the draft through the owning module (M07/M12/M04) |
| `GET/PUT /api/v1/ai/settings` | `ai.admin` (TENANT_ADMIN) | skill enablement, monthly credit cap, languages |
| `GET /api/v1/ai/usage?month=` | `ai.admin` | credits by skill, cost report (F99) |
| `GET /api/v1/ops/ai/evaluations` | operator | latest gate results per skill × language × version |

## 6. DDL — `130_documents_ai.sql`
`document` (storage_key, mime, size, sha256, av_status, retention_class, owner refs), `ai_interaction` (skill, skill_version, prompt_version, model, provider_region, input_hash, output jsonb (minimised), reviewer_decision, credits, latency_ms), `ai_settings`, `content_embedding` (vector(1536) via pgvector when available; text index fallback), `eval_run` (platform scope); RLS on tenant tables.

## 7. Observability
Metrics `ai_runs_total{skill,outcome}`, `ai_abstentions_total{skill,reason}`, `ai_latency_ms{skill}`, `ai_credits_consumed_total{skill}`, `document_scans_total{result}`; logs carry interaction id, skill, versions, credits — never prompts, outputs or document contents; security log on INFECTED documents.

## 8. Frontend
W06 `AIControlsScreen` (skill toggles, credit cap, usage by skill, gate status), M07 `AIDraftSheet` (draft with editable text, claims used, accept/edit/reject), policy reader review (document viewer with highlight boxes next to extracted fields, confidence chips, confirm → book import review), voice note recorder (upload, transcript, activity/task drafts), product assistant chat with citations and abstention message.

## 9. Acceptance criteria
- **AC-M13-01** Upload sessions enforce type/size allow-lists; documents are unusable until CLEAN; INFECTED blocks and security-logs; download URLs expire in 60 s and are audited.
- **AC-M13-02** Gateway authorisation: disabled skill or missing permission refused; credits exhausted → 429 `ai_credits_exhausted`; per-request ceiling enforced.
- **AC-M13-03** Minimisation: AI_PROCESSING consent required when a party is involved; P3 redacted unless the skill declares it; party names/ids tokenised and detokenised only in Core (prompt canary test).
- **AC-M13-04** Output validation with one repair attempt then fail closed; nothing is saved, sent or submitted without review.
- **AC-M13-05** Policy reader produces fields with highlights and confidence and lands as an M07 review item (source AI_EXTRACTED).
- **AC-M13-06** Vernacular drafts use only approved claims; drafts in EN and HI.
- **AC-M13-07** Voice-to-CRM yields activity/next action/task drafts; sensitive numbers rejected.
- **AC-M13-08** Product assistant answers only with citations from approved, in-scope content and abstains for premium/eligibility/claim questions or missing sources.
- **AC-M13-09** Interaction records store versions, input hash, decision and credits; usage report per month.
- **AC-M13-10** Evaluation runner computes per-skill gates and blocks enabling a failing version.
- **AC-M13-11** Postgres: migration, RLS, embeddings filtered by tenant. *(integration)*
- **AC-M13-12** AI controls, draft sheet, policy reader review and assistant screens as in §8.
