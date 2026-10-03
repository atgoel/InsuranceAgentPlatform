# 02 · Observability and debuggability

Goal: any failed or slow request can be fully reconstructed from its trace ID, scoped to one tenant and one dependency, **without** paying to store verbose logs for the 99 % of requests that succeed. HLD §16 (OpenTelemetry, tenant tag on every signal, no personal data), §11 (CERT-In 180-day security logs in India).

## 1. Principles

1. **One canonical line per request.** Every HTTP request and every background job emits exactly one INFO `request.completed` / `job.completed` *wide event* with all the dimensions needed to slice it (route, status, duration, tenant, user pseudonym, dependency timings, error code). Investigations start here.
2. **Debug detail is buffered, not written** (tail-based sampling). DEBUG and fine-grained span entries go into a request-scoped ring buffer. The buffer is **flushed only when the request is interesting**: it failed (5xx, unhandled error, `UnknownOutcomeError`), it was slow (above the route's latency budget), or debugging was explicitly enabled for that tenant/user/request. Otherwise it is dropped in memory at zero cost.
3. **Business events, not chatter.** INFO logs are reserved for state changes that matter to operations (`crm.lead.routed`, `proposal.submission.unknown`). Loops, step entry/exit and "about to call X" never log at INFO.
4. **Errors are deduplicated.** The first occurrences of an error fingerprint within a window log with full stack; repeats only increment a counter and are summarised once per window.
5. **Metrics for volume, logs for detail.** Anything you want to count or graph is a metric (cheap, aggregated in-process), not a log line.
6. **Privacy by schema.** Log fields are allow-listed by the log schema; values pass through redaction. P3 data never appears; P2 appears only masked or tokenised.
7. **Every error is findable from the UI.** Problem Details responses carry `traceId`; the web app shows it as "Reference" on every error state and in client-error telemetry.

## 2. Signals and their cost profile

| Signal | Volume control | Retention (sink) |
|---|---|---|
| Canonical request/job line (INFO) | 1 per request; per-route head sampling for very hot, read-only, successful routes (`sampleRate` 0.0–1.0, default 1.0; health and metrics routes 0) | 14 days hot, 30 days archive |
| Business event logs (INFO) | Only listed events (each LLD has an "Observability" table) | 14 days hot |
| WARN | Recoverable anomalies (retry scheduled, circuit half-open, degraded mode entered); deduplicated by fingerprint | 30 days |
| ERROR | Unhandled/5xx; full stack for first N=5 per fingerprint per 60 s window, then counted | 30 days |
| DEBUG + span entries | Buffered per request (max 200 entries, max 64 KB); flushed on error/slow/forced only | 7 days |
| Security & audit logs | Never sampled; separate logger channel `security` | 180 days in India (CERT-In) |
| Metrics | In-process registry, Prometheus text at `/metrics`; label cardinality guarded (no user IDs, no raw paths) | 13 months downsampled |
| Traces | W3C `traceparent` propagated edge → BFF → Core → adapters; span timings recorded into the debug buffer and summarised on the canonical line; OTel exporter pluggable behind `TraceExporter` port | sampled with the same tail rule |

Estimated effect: with a 0.5 % error/slow rate, stored log volume is ~1–2 lines per successful request instead of ~20–50, an order-of-magnitude reduction, while failing requests keep full detail.

## 3. Log schema (allow-list)

Every log record is a JSON object with these fields only (unknown fields are dropped by the serializer, except inside `ctx`, which is redacted):

| Field | Type | Notes |
|---|---|---|
| `ts` | ISO-8601 | |
| `level` | `debug` `info` `warn` `error` | |
| `event` | string | dot-case `<module>.<entity>.<action>` or `request.completed`; required |
| `msg` | string | short, static text (no interpolated personal data) |
| `traceId`, `spanId` | hex | from context |
| `tenantId` | string | from verified context; `platform` for operator calls |
| `actor` | string | pseudonymous user id (`usr_…`); never name, phone or email |
| `module` | string | e.g. `crm` |
| `route`, `method`, `status`, `durationMs` | | canonical line |
| `deps` | object | `{ "pg": {"count":3,"ms":12}, "twenty": {...} }` |
| `err` | object | `{ type, code, message, stack, fingerprint }`; `message` is the safe message |
| `ctx` | object | event-specific small payload, redacted; ≤ 2 KB serialized |
| `buffered` | array | only on a flush: the buffered debug entries |
| `sampled` | `head` `tail` `forced` | why the record exists |

### Redaction

Applied to `ctx`, `err.message` and buffered entries:
- **Key deny-list** (value replaced with `[REDACTED]`): `password`, `otp`, `token`, `authorization`, `secret`, `pan`, `aadhaar`, `dob`, `dateOfBirth`, `health*`, `medical*`, `nominee*`, `bankAccount`, `ifsc`, `address*`, `declaration*`.
- **Pattern scrubbers** on string values: Indian mobile numbers → `+91******1234`, e-mail → `a***@domain`, PAN (`[A-Z]{5}[0-9]{4}[A-Z]`) → `[PAN]`, 12-digit Aadhaar → `[AADHAAR]`, policy numbers → last 4 digits.
- Strings truncated at 256 chars, arrays at 20 items, depth at 4.

## 4. Runtime controls (debug on demand, with expiry)

| Control | How | Guard |
|---|---|---|
| Force-flush one request | Header `x-debug-token: <signed, 15-min token>` issued by the operator console | Token is HMAC-signed and bound to a tenant; ignored otherwise |
| Debug a tenant or a module | `PUT /api/v1/ops/log-overrides` `{ scope: { tenantId?, module?, actor? }, level: "debug", ttlMinutes ≤ 60 }` | `platform.operator` role; audited; auto-expires so cost cannot leak |
| Slow threshold | Per-route latency budget from 04-api (`reads 400 ms`, `writes 800 ms`, overridable per route) | config |
| Head sampling | `LOG_SAMPLE_<ROUTE>` config map | config |

## 5. Metrics catalogue (kernel)

| Metric | Type | Labels |
|---|---|---|
| `http_requests_total` | counter | `route`, `method`, `status_class` |
| `http_request_duration_ms` | histogram (buckets 25,50,100,200,400,800,1600,3200) | `route`, `method` |
| `dependency_calls_total` | counter | `dep`, `op`, `outcome` (`ok`,`error`,`timeout`) |
| `dependency_duration_ms` | histogram | `dep`, `op` |
| `domain_events_total` | counter | `type` |
| `outbox_pending` | gauge | — |
| `errors_suppressed_total` | counter | `fingerprint_class` |
| `log_buffer_flushes_total` | counter | `reason` (`error`,`slow`,`forced`) |
| `log_buffer_dropped_total` | counter | — |

Cardinality guard: the registry rejects a label value set beyond 1,000 series per metric and increments `metrics_cardinality_rejected_total`. `route` is the route template (`/api/v1/leads/:id`), never the raw URL. Tenant is **not** a metric label at launch (cardinality); per-tenant views come from canonical log lines.

## 6. Kernel components (implemented in M00)

| Component | Responsibility | Pattern |
|---|---|---|
| `RequestContext` (AsyncLocalStorage) | Holds traceId, spanId, tenantId, actor, module, debug flag, the `DebugBuffer`, dependency timings | — |
| `Logger` | Facade over pino; enforces schema, redaction, level routing to buffer vs sink; `child({ module })` | Facade |
| `DebugBuffer` | Bounded ring buffer of entries; `flush(reason)` | — |
| `LogSink` port | `write(record)`; `PinoLogSink` (stdout JSON), `MemoryLogSink` (tests) | Adapter |
| `Redactor` | Key deny-list + pattern scrubbers | Chain of Responsibility (scrubbers) |
| `ErrorDeduplicator` | Fingerprint (error type + code + top stack frame) with windowed counts | — |
| `MetricsRegistry` | Counters, gauges, histograms, Prometheus text rendering, cardinality guard | — |
| `Tracer` | `startSpan(name, fn)`: records duration into context deps and buffer; propagates `traceparent` | Decorator-friendly |
| `ObservabilityMiddleware` | Creates context from `traceparent`/`x-debug-token`, emits canonical line on finish, flushes buffer by rule, records RED metrics | Template Method (lifecycle) |
| `traced(port, name)` | Wraps any adapter object so each method call becomes a span + dependency metric | Decorator (Proxy) |
| `LogOverrideStore` | TTL-bound overrides for level/scope | — |

## 7. Frontend telemetry

- `ApiClient` sends `traceparent` on every call (new trace per user action) and surfaces `traceId` from Problem Details.
- `ErrorState` component shows "Something went wrong · Reference ABC123…" with copy button.
- `ClientTelemetry` batches client errors (`window.onerror`, unhandled rejections, error boundaries) to `POST /api/v1/telemetry/client-errors`, deduplicated by fingerprint, max 10 per session per minute, no form values or URLs with query strings.
- Web vitals (LCP, INP) sampled at 10 % into the same endpoint.

## 8. Operational runbook hooks

- Every Problem Details has `traceId` → search canonical line → if flushed, the `buffered` array shows the step-by-step debug trail.
- Business monitors (HLD §16) are metrics with alert rules: sync drift count, dead-letter depth, unknown submissions older than 2 h, paid-not-issued older than 24 h, reminder backlog at 08:00.
