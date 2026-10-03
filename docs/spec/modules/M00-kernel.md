# M00 · Kernel, observability and web shell — low-level design

Status: Ready for build · Depends on: — · HLD: §3, §10 (tenancy), §11, §12 (outbox/inbox), §16 · Standards: [01](../01-engineering-standards.md), [02](../02-observability.md), [04](../04-api-conventions.md)

The kernel is the shared foundation every module uses: observability, error model, tenancy guard, persistence (unit of work + RLS), outbox/inbox, audit log, idempotency, HTTP helpers. The web part delivers the app shell, design system, API client, i18n and client telemetry.

All paths below are relative to `apps/core/src/kernel/` (backend) or `apps/web/src/` (frontend). Exported names and signatures are **contracts**: tests are written against them.

---

## 1. Backend file map

```
kernel/
  domain/        clock.ts  id-generator.ts  money.ts  phone-number.ts  email-address.ts  specification.ts  domain-event.ts  result.ts
  errors/        domain-errors.ts  problem-details.ts  problem-details.filter.ts
  observability/ trace-context.ts  request-context.ts  debug-buffer.ts  redactor.ts  log-record.ts  log-sink.ts
                 error-deduplicator.ts  log-overrides.ts  logger.ts  metrics.ts  tracer.ts  traced.ts  flush-policy.ts
                 head-sampler.ts  debug-token.ts  observability.middleware.ts
                 telemetry.controller.ts  metrics.controller.ts  health.controller.ts  log-overrides.controller.ts
  tenancy/       principal.ts  jwt.ts  token-verifier.ts  tenant-resolver.ts  actor-pseudonym.ts  permissions.ts
                 decorators.ts  auth.guard.ts  permission.guard.ts  me.controller.ts  dev-token.controller.ts
  persistence/   unit-of-work.ts  in-memory-unit-of-work.ts  pg-unit-of-work.ts  pg-pool.ts
  outbox/        outbox.ts  event-bus.ts  outbox-relay.ts  inbox.ts  (+ pg-outbox.ts  pg-inbox.ts)
  audit/         audit-log.ts  (+ pg-audit-log.ts)
  idempotency/   idempotency-store.ts  idempotency.interceptor.ts  (+ pg-idempotency-store.ts)
  http/          zod-validation.pipe.ts  pagination.ts
  config.ts  tokens.ts  kernel.module.ts
db/migrate.ts                       (src/kernel/db/migrate.ts) migration runner
apps/core/migrations/000_kernel.sql
apps/core/src/app.module.ts, main.ts
```

`tokens.ts` exports DI tokens as `Symbol`s: `CLOCK, ID_GENERATOR, LOGGER, LOG_SINK, METRICS, TRACER, UNIT_OF_WORK, OUTBOX, EVENT_BUS, INBOX, AUDIT_LOG, IDEMPOTENCY_STORE, TOKEN_VERIFIER, TENANT_RESOLVER, PERMISSION_POLICY, LOG_OVERRIDES, DEBUG_TOKENS, KERNEL_OPTIONS`.

---

## 2. Domain primitives (`kernel/domain`)

### 2.1 Clock — Strategy for time
```ts
export interface Clock { now(): Date }
export class SystemClock implements Clock { now(): Date }
export class FixedClock implements Clock {
  constructor(start?: Date)            // default 2026-01-01T00:00:00.000Z
  now(): Date                          // returns a copy
  set(date: Date): void
  advance(ms: number): void
}
```

### 2.2 IdGenerator
```ts
export interface IdGenerator { next(prefix: string): string }
export class UlidIdGenerator implements IdGenerator {
  constructor(clock: Clock, random?: () => number)
  next(prefix: string): string   // `${prefix}_${ulid}`; ulid = 10 chars Crockford base32 time + 16 chars random; 26 chars total, uppercase
}
export class SequentialIdGenerator implements IdGenerator {
  next(prefix: string): string   // `${prefix}_0001`, `${prefix}_0002` … counter per prefix
}
```
`prefix` must match `/^[a-z]{2,6}$/` else `ValidationError`. ULIDs generated in a later millisecond sort after earlier ones.

### 2.3 Money — immutable value object (I7)
```ts
export type CurrencyCode = 'INR';
export class Money {
  static ofPaise(paise: number, currency?: CurrencyCode): Money   // non-safe-integer → ValidationError('money_not_integer')
  static ofRupees(rupees: number, currency?: CurrencyCode): Money // Math.round(rupees * 100)
  static zero(currency?: CurrencyCode): Money
  readonly paise: number; readonly currency: CurrencyCode;
  add(other: Money): Money; subtract(other: Money): Money          // currency mismatch → ValidationError('currency_mismatch')
  multiplyBps(basisPoints: number): Money                          // paise * bps / 10000, rounded half away from zero
  isNegative(): boolean; isZero(): boolean; equals(other: Money): boolean
  compare(other: Money): -1 | 0 | 1
  toJSON(): { amountPaise: number; currency: CurrencyCode }
  format(): string                                                 // en-IN, e.g. "₹1,23,456.78"
}
```

### 2.4 PhoneNumber / EmailAddress — value objects
```ts
export class PhoneNumber {
  static parse(raw: string): PhoneNumber  // strips spaces, '-', '()', leading '+91', '91' (12 digits), or '0'; result must be 10 digits starting 6–9 else ValidationError('invalid_phone')
  readonly e164: string                   // '+919876543210'
  masked(): string                        // '+91******3210'
  equals(o: PhoneNumber): boolean
}
export class EmailAddress {
  static parse(raw: string): EmailAddress // trims, lowercases; must match /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/ else ValidationError('invalid_email')
  readonly value: string
  masked(): string                        // 'a***@example.com' (first char + ***)
  equals(o: EmailAddress): boolean
}
```

### 2.5 Specification — composite business rules (GoF Composite/Interpreter)
```ts
export abstract class Specification<T> {
  abstract isSatisfiedBy(candidate: T): boolean
  and(other: Specification<T>): Specification<T>
  or(other: Specification<T>): Specification<T>
  not(): Specification<T>
  static of<T>(predicate: (c: T) => boolean, name?: string): Specification<T>
}
```

### 2.6 DomainEvent (CloudEvents 1.0 shape)
```ts
export interface DomainEvent<T = Record<string, unknown>> {
  id: string;           // evt_…
  specVersion: '1.0';
  type: string;         // 'crm.lead.created' — /^[a-z]+(\.[a-z_]+){2}$/
  source: string;       // module name, e.g. 'crm'
  subject: string;      // entity id
  tenantId: string;
  occurredAt: string;   // ISO
  dataVersion: number;  // schema version of data, starts at 1
  traceId?: string;     // from RequestContext when present
  data: T;
}
export class DomainEventFactory {
  constructor(clock: Clock, ids: IdGenerator)
  create<T>(input: { type: string; source: string; subject: string; tenantId: string; data: T; dataVersion?: number }): DomainEvent<T>
  // invalid type → ValidationError('invalid_event_type'); traceId copied from RequestContext.current(); returned event is Object.freeze'd (data shallow-frozen)
}
```

### 2.7 Result
```ts
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export const ok: <T>(value: T) => Result<T, never>;
export const err: <E>(error: E) => Result<never, E>;
```

---

## 3. Errors (`kernel/errors`)

### 3.1 Hierarchy
```ts
export interface FieldError { path: string; code: string; message: string }
export abstract class DomainError extends Error {
  abstract readonly httpStatus: number;
  readonly code: string;                       // snake_case machine code
  readonly details?: Record<string, unknown>;  // safe (no PII) extra data for Problem Details
  constructor(code: string, message: string, details?: Record<string, unknown>)
}
export class ValidationError extends DomainError          // 400; constructor(code: string, message: string, readonly errors: FieldError[] = [])
export class UnauthenticatedError extends DomainError     // 401; constructor(code = 'unauthenticated', message = 'Authentication required')
export class ForbiddenError extends DomainError           // 403; constructor(code = 'forbidden', message = 'Not allowed')
export class NotFoundError extends DomainError            // 404; constructor(entity: string, id?: string) → code `${snake(entity)}_not_found` (`'AuditEvent'` → `audit_event_not_found`), details.id when given, message `${Entity} not found`
export class ConflictError extends DomainError            // 409
export class PreconditionFailedError extends DomainError  // 412; code 'version_mismatch'
export class BusinessRuleError extends DomainError        // 422
export class RateLimitedError extends DomainError         // 429; details.retryAfterSeconds
export class DependencyUnavailableError extends DomainError // 503; constructor(dependency: string) code 'dependency_unavailable', details.dependency
export class UnknownOutcomeError extends DomainError      // 202; constructor(operationRef: string) code 'outcome_unknown', details.operationRef
```

### 3.2 Problem Details — Builder + Chain of Responsibility
```ts
export interface ProblemDetails {
  type: string; title: string; status: number; detail?: string; code: string; traceId: string;
  errors?: FieldError[]; [ext: string]: unknown;
}
export class ProblemDetailsBuilder {
  static create(): ProblemDetailsBuilder
  status(s: number): this; code(c: string): this; title(t: string): this; detail(d?: string): this
  traceId(id: string): this; errors(e?: FieldError[]): this; extension(k: string, v: unknown): this
  build(): ProblemDetails   // type = `https://errors.iap.example/${code}`; title defaults to the HTTP reason phrase
}
export interface ProblemMapper { canMap(error: unknown): boolean; map(error: unknown, traceId: string): ProblemDetails }
export class DomainErrorMapper implements ProblemMapper      // uses err.httpStatus, code, message→detail, details→extensions, ValidationError.errors
export class ZodErrorMapper implements ProblemMapper         // ZodError → 400 'validation_failed', errors from issues (path joined with '.')
export class HttpExceptionMapper implements ProblemMapper    // Nest HttpException → its status, code `http_${status}`; 404 route → 'route_not_found'
export class FallbackMapper implements ProblemMapper         // anything else → 500 'internal_error', detail 'An unexpected error occurred' (never the raw message)
export function toProblem(error: unknown, traceId: string, mappers?: ProblemMapper[]): ProblemDetails // first canMap wins
```

### 3.3 `ProblemDetailsFilter` (Nest `@Catch()` global filter)
- Builds the problem via `toProblem` with the current traceId.
- Status ≥ 500: `logger.error('http.unhandled_error', 'Unhandled error', error)`; marks `RequestContext.current().hasError = true` (forces buffer flush).
- Status 4xx: `logger.debug('http.client_error', …, { code })` (buffered only).
- `DependencyUnavailableError` and `RateLimitedError` set `Retry-After` from `details.retryAfterSeconds` (default 30).
- Responds with `content-type: application/problem+json`.

---

## 4. Observability (`kernel/observability`) — implements [02-observability](../02-observability.md)

### 4.1 Trace context
```ts
export interface TraceParent { traceId: string; parentSpanId: string; sampled: boolean }
export function parseTraceparent(header: string | undefined): TraceParent | undefined // '00-<32hex>-<16hex>-<2hex>'; all-zero ids invalid
export function newTraceId(): string   // 32 lowercase hex, crypto random
export function newSpanId(): string    // 16 lowercase hex
export function formatTraceparent(traceId: string, spanId: string, sampled?: boolean): string
```

### 4.2 RequestContext (AsyncLocalStorage)
```ts
export interface DependencyTiming { count: number; ms: number; errors: number }
export interface RequestContextData {
  traceId: string; spanId: string;
  tenantId?: string; actor?: string; module?: string;
  forceDebug: boolean;       // set by debug token or override
  hasError: boolean;         // set by logger.error / filter
  buffer: DebugBuffer;
  deps: Record<string, DependencyTiming>;
  startedAtMs: number;
}
export class RequestContext {
  static run<T>(data: RequestContextData, fn: () => T): T
  static current(): RequestContextData | undefined
  static patch(patch: Partial<Omit<RequestContextData, 'buffer' | 'deps'>>): void   // no-op outside a context
  static create(init: { traceId?: string; startedAtMs: number; forceDebug?: boolean }): RequestContextData // fresh spanId, empty buffer/deps
}
```

### 4.3 DebugBuffer
```ts
export interface BufferedEntry { t: number /* ms since request start */; level: 'debug' | 'info' | 'warn'; event: string; msg: string; ctx?: Record<string, unknown> }
export class DebugBuffer {
  constructor(opts?: { maxEntries?: number /* 200 */; maxBytes?: number /* 65536 */ })
  add(entry: BufferedEntry): void       // when full (entries or approx JSON bytes), evict oldest and increment dropped
  entries(): readonly BufferedEntry[]
  readonly dropped: number
  clear(): void
}
```

### 4.4 Redactor (Chain of Responsibility over scrubbers)
```ts
export interface StringScrubber { readonly name: string; scrub(value: string): string }
export const phoneScrubber: StringScrubber    // Indian mobiles (+91/91/0 optional prefix, 10 digits starting 6–9) → '+91******' + last 4
export const emailScrubber: StringScrubber    // 'ravi.k@x.com' → 'r***@x.com'
export const panScrubber: StringScrubber      // /[A-Z]{5}[0-9]{4}[A-Z]/ → '[PAN]'
export const aadhaarScrubber: StringScrubber  // 12 digits optionally grouped 4-4-4 by space/hyphen → '[AADHAAR]' (run BEFORE phone)
export class Redactor {
  constructor(opts?: { scrubbers?: StringScrubber[]; denyKeys?: RegExp; maxString?: number /*256*/; maxArray?: number /*20*/; maxDepth?: number /*4*/ })
  redact(value: unknown): unknown   // deep copy; deny-listed keys → '[REDACTED]'; strings scrubbed then truncated with '…'; arrays truncated; deeper than maxDepth → '[DEPTH]'; Error → { type, message(scrubbed) }
}
```
Default deny keys (case-insensitive): `password|otp|token|authorization|secret|pan|aadhaar|dob|dateOfBirth|health.*|medical.*|nominee.*|bankAccount|ifsc|address.*|declaration.*`.

### 4.5 Log record and sinks
```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type SampledReason = 'head' | 'tail' | 'forced' | 'always';
export interface LogRecord {
  ts: string; level: LogLevel; event: string; msg: string;
  traceId?: string; spanId?: string; tenantId?: string; actor?: string; module?: string;
  channel?: 'app' | 'security';
  route?: string; method?: string; status?: number; durationMs?: number;
  deps?: Record<string, DependencyTiming>;
  err?: { type: string; code?: string; message: string; stack?: string; fingerprint: string; suppressedSinceLast?: number };
  ctx?: Record<string, unknown>;
  buffered?: BufferedEntry[]; bufferDropped?: number; flushReason?: FlushReason;
  sampled?: SampledReason;
}
export interface LogSink { write(record: LogRecord): void }
export class PinoLogSink implements LogSink { constructor(destination?: NodeJS.WritableStream) }  // one JSON line per record; no pino timestamp duplication
export class MemoryLogSink implements LogSink {
  readonly records: LogRecord[]
  byEvent(event: string): LogRecord[]
  clear(): void
}
```

### 4.6 ErrorDeduplicator
```ts
export class ErrorDeduplicator {
  constructor(clock: Clock, opts?: { windowMs?: number /*60000*/; maxPerWindow?: number /*5*/ })
  fingerprint(error: unknown): string     // sha1(type + ':' + code + ':' + first stack frame location without line/column numbers) → 12 hex chars
  admit(fingerprint: string): { log: boolean; suppressedSinceLast: number } // first maxPerWindow per window → log:true; afterwards log:false; when a new window opens, the first admitted record reports how many were suppressed in the previous window
}
```

### 4.7 LogOverrideStore (debug on demand, TTL-bound)
```ts
export interface LogOverrideScope { tenantId?: string; module?: string; actor?: string }
export interface LogOverride { id: string; scope: LogOverrideScope; level: 'debug'; expiresAt: string; createdBy: string }
export class LogOverrideStore {
  constructor(clock: Clock, ids: IdGenerator)
  put(input: { scope: LogOverrideScope; ttlMinutes: number; createdBy: string }): LogOverride // ttl 1..60 else ValidationError('override_ttl_invalid'); empty scope → ValidationError('override_scope_required')
  list(): LogOverride[]                    // expired ones are purged first
  remove(id: string): boolean
  isDebugEnabled(scope: LogOverrideScope): boolean  // true when any unexpired override's every defined field equals the given scope's field
}
```

### 4.8 Logger (Facade)
```ts
export interface LoggerDeps { sink: LogSink; redactor: Redactor; dedup: ErrorDeduplicator; overrides: LogOverrideStore; clock: Clock; metrics?: MetricsRegistry }
export class Logger {
  constructor(deps: LoggerDeps, bindings?: { module?: string })
  child(bindings: { module: string }): Logger
  debug(event: string, msg: string, ctx?: Record<string, unknown>): void
  info(event: string, msg: string, ctx?: Record<string, unknown>): void
  warn(event: string, msg: string, ctx?: Record<string, unknown>): void
  error(event: string, msg: string, error: unknown, ctx?: Record<string, unknown>): void
  security(event: string, msg: string, ctx?: Record<string, unknown>): void   // level warn, channel 'security', never sampled or deduped
  writeCanonical(record: Omit<LogRecord, 'ts'>): void  // used by the middleware/job runner; redacts ctx, stamps ts
}
```
Rules:
1. Every record is stamped with `ts` (clock), and `traceId`, `spanId`, `tenantId`, `actor` from `RequestContext.current()`, and `module` from bindings.
2. `ctx` is passed through the redactor.
3. **debug**: if a context exists and (`forceDebug` or `overrides.isDebugEnabled({tenantId, module, actor})`) → written to the sink with `sampled: 'forced'`. Else if a context exists → added to the context's `DebugBuffer` (not written). Else (no context) → dropped.
4. **info / warn**: written with `sampled: 'always'` and also appended to the buffer (so a flushed trail is complete) — the flush excludes entries already written by marking them with level `info`/`warn` (consumers can tell).
5. **error**: fingerprint via dedup; if `admit().log` → write with `err` {type, code (DomainError), message (redacted), stack, fingerprint, suppressedSinceLast}; else increment `errors_suppressed_total`. In both cases set `hasError = true` on the context.
6. A `Logger` never throws (sink failures are swallowed after one attempt).

### 4.9 MetricsRegistry
```ts
export type Labels = Record<string, string>;
export interface Counter { inc(labels?: Labels, by?: number): void; get(labels?: Labels): number }
export interface Gauge { set(value: number, labels?: Labels): void; inc(labels?: Labels, by?: number): void; dec(labels?: Labels, by?: number): void; get(labels?: Labels): number }
export interface Histogram { observe(value: number, labels?: Labels): void; count(labels?: Labels): number; sum(labels?: Labels): number }
export class MetricsRegistry {
  constructor(opts?: { maxSeriesPerMetric?: number /*1000*/ })
  counter(name: string, help: string, labelNames?: string[]): Counter     // idempotent: same name returns same instance; different type → Error
  gauge(name: string, help: string, labelNames?: string[]): Gauge
  histogram(name: string, help: string, labelNames?: string[], buckets?: number[] /* [25,50,100,200,400,800,1600,3200] */): Histogram
  render(): string            // Prometheus text exposition 0.0.4 (# HELP, # TYPE, _bucket{le=…}, _sum, _count; labels sorted)
}
```
Unknown label names → Error (programming error). Beyond `maxSeriesPerMetric` distinct label sets, observations are dropped and `metrics_cardinality_rejected_total{metric}` increments.

### 4.10 Tracer and `traced` (Decorator via Proxy)
```ts
export class Tracer {
  constructor(clock: Clock, metrics: MetricsRegistry)
  span<T>(name: string, fn: () => Promise<T>, opts?: { dep?: string; op?: string }): Promise<T>
  // measures duration with clock; on completion adds BufferedEntry { event: 'span', msg: name, ctx: { ms, outcome: 'ok'|'error' } }
  // when dep is set: updates RequestContext deps[dep] (count, ms, errors) and metrics dependency_calls_total{dep,op,outcome} and dependency_duration_ms{dep,op}
  // rethrows errors unchanged; outcome 'timeout' when error.code === 'timeout'
}
export function traced<T extends object>(target: T, dep: string, tracer: Tracer): T
// returns a Proxy; every function property whose call returns a Promise is wrapped in tracer.span(`${dep}.${method}`, …, { dep, op: method }); sync functions and non-function props pass through.
```

### 4.11 FlushPolicy and HeadSampler
```ts
export type FlushReason = 'error' | 'slow' | 'forced';
export class FlushPolicy {
  constructor(opts?: { readBudgetMs?: number /*400*/; writeBudgetMs?: number /*800*/; routeBudgets?: Record<string, number> })
  decide(input: { method: string; route: string; status: number; durationMs: number; forced: boolean; hasError: boolean }): FlushReason | undefined
  // precedence: hasError || status >= 500 → 'error'; forced → 'forced'; durationMs > budget → 'slow' (GET/HEAD use read budget, others write budget, routeBudgets[route] overrides)
}
export class HeadSampler {
  constructor(opts?: { rates?: Record<string, number>; excluded?: string[] /* ['/health/live','/health/ready','/metrics'] */; random?: () => number })
  decide(route: string, status: number): 'log' | 'skip' | 'exclude'
  // excluded routes → 'exclude' (no canonical line, no metrics); status >= 400 → 'log'; rate = rates[route] ?? 1 → random() < rate ? 'log' : 'skip'
}
```

### 4.12 DebugTokenService
```ts
export class DebugTokenService {
  constructor(secret: string, clock: Clock)
  issue(input: { tenantId: string; ttlMinutes: number }): string   // ttl 1..15 else ValidationError; base64url(payload).base64url(hmacSha256)
  verify(token: string | undefined, tenantId: string | undefined): boolean // signature valid, not expired, tenant matches (or token tenant '*')
}
```

### 4.13 ObservabilityMiddleware (Nest middleware, Template Method over the request lifecycle)
Constructor deps: `Logger`, `MetricsRegistry`, `FlushPolicy`, `HeadSampler`, `DebugTokenService`, `Clock`.

On request:
1. `RequestContext.create` with traceId from `traceparent` (or new), `startedAtMs = clock.now().getTime()`.
2. Response headers: `x-trace-id: <traceId>`, `traceparent: formatTraceparent(traceId, spanId)`.
3. Run `next()` inside `RequestContext.run`.

On `res` `finish`:
1. `route` = Express route template (`req.baseUrl + req.route.path`) or `'unmatched'`.
2. `HeadSampler.decide` → `exclude` ends here.
3. Metrics: `http_requests_total{route,method,status_class}` (`2xx` …), `http_request_duration_ms{route,method}`.
4. Tenant debug: if the debug token header `x-debug-token` verifies for the context tenant → `forced`. (The token is verified at finish time because the tenant is only known after the auth guard.)
5. `flushReason = FlushPolicy.decide(...)`.
6. If decision is `log` or a flushReason exists → `logger.writeCanonical({ level: status>=500?'error':'info', event: 'request.completed', msg: 'Request completed', route, method, status, durationMs, deps, sampled: flushReason ? 'tail' : 'head', flushReason, buffered: flushReason ? entries : undefined, bufferDropped })`, and when flushed increment `log_buffer_flushes_total{reason}`.

### 4.14 Controllers
| Route | Auth | Behaviour |
|---|---|---|
| `GET /health/live` | public | `{ status: 'ok' }` |
| `GET /health/ready` | public | `{ status: 'ok', checks: { db: 'ok' | 'skipped' } }` |
| `GET /metrics` | public (network-restricted in infra) | `text/plain; version=0.0.4` from `render()` |
| `POST /api/v1/telemetry/client-errors` | authenticated or public with tenant host | body `{ events: ClientEvent[] }` max 20; `ClientEvent = { kind: 'error' \| 'vital'; fingerprint: string(≤64); message?: string(≤500); route?: string(≤200); name?: string; value?: number; release?: string }`; errors → `logger.warn('client.error', …)` deduped by fingerprint via ErrorDeduplicator; vitals → histogram `web_vital{name}`; returns `202 { accepted: n }` |
| `PUT /api/v1/ops/log-overrides` | operator | body `{ scope: { tenantId?, module?, actor? }, ttlMinutes }` → 201 `LogOverride`; security log `security.log_override.created` |
| `GET /api/v1/ops/log-overrides` | operator | `{ items: LogOverride[] }` |
| `DELETE /api/v1/ops/log-overrides/:id` | operator | 204 / 404 |
| `POST /api/v1/ops/debug-tokens` | operator | body `{ tenantId, ttlMinutes }` → `{ token }`; security log |
| `GET /api/v1/me` | authenticated | `{ userRef, tenantId, memberId?, orgUnitId?, roles, permissions: string[] }` (permissions sorted) |
| `POST /api/v1/dev/tokens` | public, **only** when `config.devAuth === true` (never in production) | body `{ tenantId, roles: string[], sub?, memberId?, orgUnitId? }` → `{ token }` signed with the dev HMAC secret, 8 h expiry. Returns 404 when dev auth disabled. |

---

## 5. Tenancy and access (`kernel/tenancy`)

### 5.1 Principal and tokens
```ts
export interface Principal {
  userRef: string;           // token sub
  tenantId: string;          // token org claim ('platform' for workforce operators)
  memberId?: string;         // mid claim
  orgUnitId?: string;        // ou claim
  roles: string[];
  realm: 'customers' | 'workforce';
}
export interface JwtClaims { sub: string; org: string; roles: string[]; mid?: string; ou?: string; realm?: 'customers' | 'workforce'; iat: number; exp: number; iss?: string; aud?: string }
export function signHs256(claims: JwtClaims, secret: string): string        // compact JWS, header {alg:'HS256',typ:'JWT'}
export interface TokenVerifier { verify(token: string): Promise<Principal> }
export class HmacJwtVerifier implements TokenVerifier {
  constructor(secret: string, clock: Clock, opts?: { issuer?: string; audience?: string; leewaySeconds?: number /*30*/ })
  // rejects (UnauthenticatedError 'invalid_token'): malformed, alg != HS256, bad signature (timing-safe compare), exp passed, iss/aud mismatch when configured, missing sub/org
}
```
`JwksTokenVerifier` (Keycloak RS256) is specified for M02; not built in M00.

### 5.2 Tenant resolution (HLD "tenant from trust")
```ts
export interface ResolvedTenant { tenantId: string; status: 'active' | 'suspended' | 'provisioning' | 'offboarded' }
export interface TenantResolver { resolveByHost(host: string): Promise<ResolvedTenant | undefined> }
export class StaticTenantResolver implements TenantResolver { constructor(map: Record<string, ResolvedTenant>) }  // host lowercase, port stripped
```

### 5.3 Actor pseudonym
```ts
export function pseudonymiseActor(userRef: string, pepper: string): string // 'usr_' + first 12 hex of HMAC-SHA256(pepper, userRef)
```

### 5.4 Permissions
```ts
export interface PermissionPolicy { permissionsFor(roles: readonly string[]): ReadonlySet<string> }
export class RolePermissionMatrix implements PermissionPolicy {
  constructor(initial?: Record<string, string[]>)
  grant(role: string, permissions: string[]): void      // modules register their role → permission rows at module init
  permissionsFor(roles: readonly string[]): ReadonlySet<string>  // union; role 'platform.operator' gets 'ops.*'
}
// permission matching: exact, or wildcard suffix 'crm.*' grants 'crm.lead.read'
export function hasPermission(granted: ReadonlySet<string>, required: string): boolean
```
M00 matrix rows: `platform.operator → ['ops.*']`; every authenticated role → `['me.read', 'telemetry.write']`.

### 5.5 Decorators and guards
```ts
export const Public: () => MethodDecorator & ClassDecorator;          // skip AuthGuard
export const OperatorOnly: () => MethodDecorator & ClassDecorator;    // requires workforce realm + 'platform.operator'; skips host check
export const RequirePermission: (...permissions: string[]) => MethodDecorator & ClassDecorator;
export const CurrentPrincipal: () => ParameterDecorator;              // injects Principal
```
**AuthGuard** (global, order 1):
1. `@Public` → allow (if a tenant host resolves, still set `tenantId` in the context for telemetry).
2. Missing/invalid bearer → `UnauthenticatedError`.
3. `@OperatorOnly` → require `realm === 'workforce'` and role `platform.operator`, else `ForbiddenError('operator_only')`.
4. Otherwise resolve tenant from `Host` (ignore `X-Forwarded-Host` unless `config.trustProxy`); unknown host → `NotFoundError('tenant')`; status not `active` → `ForbiddenError('tenant_inactive')`; `principal.tenantId !== resolved.tenantId` → `ForbiddenError('tenant_mismatch')` + `logger.security('security.tenant_mismatch', …, { tokenTenant, hostTenant })`.
5. Attach `req.principal`; `RequestContext.patch({ tenantId, actor: pseudonymiseActor(sub) })`.

**PermissionGuard** (global, order 2): if `@RequirePermission` present, all required permissions must be granted by `PermissionPolicy`, else `ForbiddenError('permission_denied')` with `details.required`.

---

## 6. Persistence (`kernel/persistence`)

```ts
export interface Transaction { readonly tenantId: string; readonly kind: 'memory' | 'pg' }
export interface PgTransaction extends Transaction { readonly kind: 'pg'; query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> }
export interface UnitOfWork { run<T>(tenantId: string, work: (tx: Transaction) => Promise<T>): Promise<T> }
export class InMemoryUnitOfWork implements UnitOfWork   // passes { tenantId, kind: 'memory' }; no rollback semantics (documented)
export class PgUnitOfWork implements UnitOfWork {
  constructor(pool: Pool, tracer: Tracer)
  // BEGIN; SELECT set_config('app.tenant_id', $1, true); work(tx); COMMIT — ROLLBACK and rethrow on error; client always released; traced as dep 'pg'
}
export function isPgTransaction(tx: Transaction): tx is PgTransaction
export function createPool(databaseUrl: string): Pool
```
Migration runner `src/kernel/db/migrate.ts`: `runMigrations(pool, dir): Promise<string[]>` applies `NNN_*.sql` files in order inside a transaction each, recorded in `schema_migrations(name text primary key, applied_at timestamptz)`; idempotent.

### 6.1 DDL — `apps/core/migrations/000_kernel.sql`
```sql
create table if not exists outbox_event (
  id text primary key, tenant_id text not null, type text not null, source text not null, subject text not null,
  data jsonb not null, data_version int not null default 1, trace_id text,
  occurred_at timestamptz not null, published_at timestamptz, attempts int not null default 0, last_error text
);
create index if not exists outbox_unpublished_idx on outbox_event (occurred_at) where published_at is null;

create table if not exists inbox_message (
  consumer text not null, event_id text not null, processed_at timestamptz not null default now(),
  primary key (consumer, event_id)
);

create table if not exists audit_event (
  id text primary key, tenant_id text not null, actor text not null, action text not null,
  entity_type text not null, entity_id text not null, occurred_at timestamptz not null, trace_id text,
  before_hash text, after_hash text, metadata jsonb not null default '{}'
);
create index if not exists audit_event_entity_idx on audit_event (tenant_id, entity_type, entity_id, occurred_at desc);

create table if not exists idempotency_record (
  tenant_id text not null, key text not null, request_hash text not null,
  status text not null check (status in ('in_progress','completed')),
  response_status int, response_body jsonb, created_at timestamptz not null default now(), expires_at timestamptz not null,
  primary key (tenant_id, key)
);

-- RLS: tenant from SET LOCAL app.tenant_id (HLD §10). Outbox relay and migrations run as iap_owner.
alter table audit_event enable row level security;  alter table audit_event force row level security;
alter table idempotency_record enable row level security; alter table idempotency_record force row level security;
alter table outbox_event enable row level security; alter table outbox_event force row level security;
create policy tenant_isolation on audit_event using (tenant_id = current_setting('app.tenant_id', true)) with check (tenant_id = current_setting('app.tenant_id', true));
create policy tenant_isolation on idempotency_record using (tenant_id = current_setting('app.tenant_id', true)) with check (tenant_id = current_setting('app.tenant_id', true));
create policy tenant_isolation on outbox_event using (tenant_id = current_setting('app.tenant_id', true)) with check (tenant_id = current_setting('app.tenant_id', true));
grant select, insert on audit_event to iap_app;                      -- append-only: no update/delete
grant select, insert, update, delete on idempotency_record, outbox_event, inbox_message to iap_app;
```
(Policies are created with `do $$ … if not exists … $$` guards so the migration is re-runnable.)

---

## 7. Outbox, event bus, inbox (`kernel/outbox`) — Observer + Command

```ts
export interface Outbox { add(tx: Transaction, event: DomainEvent): Promise<void> }
export interface OutboxSource {
  fetchUnpublished(limit: number): Promise<DomainEvent[]>
  markPublished(ids: string[]): Promise<void>
  markFailed(id: string, error: string): Promise<number>   // returns attempts after increment
}
export class InMemoryOutbox implements Outbox, OutboxSource { readonly events: DomainEvent[]; published(): DomainEvent[]; pending(): DomainEvent[] }
export class PgOutbox implements Outbox, OutboxSource { constructor(pool: Pool) }   // add() uses tx.query (same transaction as the state change)

export type EventHandler = (event: DomainEvent) => Promise<void>;
export interface EventBus { publish(event: DomainEvent): Promise<void>; subscribe(type: string /* exact or '*' */, handler: EventHandler, name: string): void }
export class InProcessEventBus implements EventBus   // calls every matching handler sequentially; collects failures and throws AggregateError after all ran

export class OutboxRelay {
  constructor(deps: { source: OutboxSource; bus: EventBus; logger: Logger; metrics: MetricsRegistry; maxAttempts?: number /*3*/ })
  relayOnce(limit?: number /*100*/): Promise<{ published: number; failed: number; deadLettered: number }>
  // per event: publish → markPublished; failure → markFailed; attempts >= maxAttempts → logger.error('outbox.event.dead_lettered') and counted as deadLettered (DLQ operations screen in M08)
  // metrics: domain_events_total{type} on publish, outbox_pending gauge after each run
}
export interface Inbox { processOnce(consumer: string, eventId: string, fn: () => Promise<void>): Promise<boolean> } // false = duplicate, fn not run
export class InMemoryInbox implements Inbox
export class PgInbox implements Inbox { constructor(pool: Pool) }  // insert … on conflict do nothing, then fn, in one transaction
```

---

## 8. Audit log (`kernel/audit`)

```ts
export interface AuditEntry { action: string; entityType: string; entityId: string; before?: unknown; after?: unknown; metadata?: Record<string, unknown> }
export interface StoredAuditEvent { id: string; tenantId: string; actor: string; action: string; entityType: string; entityId: string; occurredAt: string; traceId?: string; beforeHash?: string; afterHash?: string; metadata: Record<string, unknown> }
export interface AuditLog { append(tx: Transaction, entry: AuditEntry): Promise<StoredAuditEvent> }
export function canonicalHash(value: unknown): string   // sha256 hex of JSON with sorted keys; undefined → undefined
export class InMemoryAuditLog implements AuditLog { constructor(clock: Clock, ids: IdGenerator, redactor: Redactor); readonly events: StoredAuditEvent[] }
export class PgAuditLog implements AuditLog { constructor(clock: Clock, ids: IdGenerator, redactor: Redactor) }
```
Rules: actor = `RequestContext.current()?.actor ?? 'system'`; tenantId from `tx.tenantId`; before/after stored **only as hashes** (privacy — the full record is in the owning table); metadata redacted.

---

## 9. Idempotency (`kernel/idempotency`)

```ts
export type IdempotencyBegin =
  | { state: 'new' }
  | { state: 'replay'; status: number; body: unknown }
  | { state: 'conflict' }       // same key, different request hash
  | { state: 'in_progress' };
export interface IdempotencyStore {
  begin(tenantId: string, key: string, requestHash: string): Promise<IdempotencyBegin>
  complete(tenantId: string, key: string, status: number, body: unknown): Promise<void>
  release(tenantId: string, key: string): Promise<void>     // on handler failure so the client can retry
}
export class InMemoryIdempotencyStore implements IdempotencyStore { constructor(clock: Clock, ttlMs?: number /* 24h */) }  // expired records behave as absent
export class PgIdempotencyStore implements IdempotencyStore { constructor(pool: Pool, clock: Clock, ttlMs?: number) }
export const Idempotent: () => MethodDecorator;   // marks a POST handler; applies IdempotencyInterceptor
export function requestHash(method: string, route: string, body: unknown): string  // sha256 of method + route + canonical JSON body
```
**IdempotencyInterceptor**: header `Idempotency-Key` must match `/^[A-Za-z0-9_-]{8,128}$/`, else `ValidationError('idempotency_key_required')`. Tenant = principal tenant (or `'public'`). `replay` → respond with stored status/body and header `idempotent-replay: true`; `conflict` → `ConflictError('idempotency_key_reuse')`; `in_progress` → `ConflictError('idempotency_in_progress')`; `new` → run handler; on success `complete(status, body)`; on error `release` and rethrow.

---

## 10. HTTP helpers (`kernel/http`)

```ts
export class ZodValidationPipe<T> implements PipeTransform { constructor(schema: ZodType<T>) }   // ZodError → ValidationError('validation_failed', 'Request is invalid', errors[])
export const PageQuerySchema: ZodObject<{ limit: number (int 1..100, default 25); cursor?: string }>
export interface Page<T> { items: T[]; nextCursor?: string }
export function encodeCursor(value: Record<string, unknown>): string   // base64url(JSON)
export function decodeCursor(cursor: string): Record<string, unknown>  // invalid → ValidationError('invalid_cursor')
```

---

## 11. Configuration and composition (`kernel/config.ts`, `kernel.module.ts`)

```ts
export interface KernelConfig {
  env: 'development' | 'test' | 'production';
  port: number;                              // PORT, default 3000
  persistence: 'memory' | 'pg';              // PERSISTENCE, default 'memory'
  databaseUrl?: string;                      // DATABASE_URL (required when pg)
  tokenSecret: string;                       // AUTH_HS256_SECRET (≥ 32 chars outside dev/test)
  actorPepper: string;                       // ACTOR_PEPPER
  debugTokenSecret: string;                  // DEBUG_TOKEN_SECRET
  devAuth: boolean;                          // DEV_AUTH === '1' and env !== 'production'
  trustProxy: boolean;                       // TRUST_PROXY === '1'
  staticTenants: Record<string, ResolvedTenant>; // DEV_TENANTS JSON (dev/test only; M01 replaces with the directory)
  logSampleRates: Record<string, number>;    // LOG_SAMPLE_RATES JSON
}
export function loadConfig(env: NodeJS.ProcessEnv): KernelConfig   // zod-validated; invalid → throws with all issues listed
```
`KernelModule.forRoot(config: KernelConfig)` is `@Global()`, provides every token from `tokens.ts` (memory or pg adapters by `config.persistence`), registers `ObservabilityMiddleware` for all routes, `ProblemDetailsFilter` (APP_FILTER), `AuthGuard` then `PermissionGuard` (APP_GUARD), and the kernel controllers. `TENANT_RESOLVER` may be overridden by M01.

`AppModule` imports `KernelModule.forRoot(loadConfig(process.env))` and feature modules. `main.ts` boots Nest with `bufferLogs`, disables the default Nest logger in favour of the kernel Logger (`logger.info('app.started', …, { port })`), and enables shutdown hooks.

---

## 12. Test support (written by the test agent, used by all modules)

```ts
// apps/core/test/support/test-app.ts
export interface TestApp { app: INestApplication; http: ReturnType<typeof request>; logs: MemoryLogSink; metrics: MetricsRegistry; clock: FixedClock; config: KernelConfig; close(): Promise<void> }
export function testConfig(overrides?: Partial<KernelConfig>): KernelConfig  // memory persistence, test secrets, devAuth true, staticTenants { 'acme.iap.test': { tenantId: 'ten_acme', status: 'active' }, 'zen.iap.test': { tenantId: 'ten_zen', status: 'active' }, 'sleepy.iap.test': { tenantId: 'ten_sleepy', status: 'suspended' } }
export function createTestApp(opts?: { imports?: unknown[]; controllers?: unknown[]; providers?: unknown[]; config?: Partial<KernelConfig> }): Promise<TestApp>
// overrides LOG_SINK with a MemoryLogSink and CLOCK with a FixedClock
// apps/core/test/support/tokens.ts
export function tokenFor(input: { tenantId: string; roles?: string[]; sub?: string; memberId?: string; orgUnitId?: string; realm?: 'customers' | 'workforce'; expiresInSeconds?: number }, secret?: string): string
export const operatorToken: () => string   // workforce realm, tenant 'platform', role 'platform.operator'
```

---

## 13. Frontend (apps/web/src)

### 13.1 File map
```
design-system/  tokens.ts  theme.css  Button.tsx  StatusChip.tsx  Card.tsx  Tabs.tsx  FilterChips.tsx  DataGrid.tsx
                BottomSheet.tsx  Toast.tsx  Stepper.tsx  Timeline.tsx  ConsentCheckbox.tsx  DisclosureFooter.tsx
                states/ LoadingSkeleton.tsx  EmptyState.tsx  ErrorState.tsx  PermissionDenied.tsx  OfflineBanner.tsx
                index.ts
lib/api/        api-error.ts  api-client.ts  fetch-api-client.ts  ApiProvider.tsx  useApiQuery.ts  trace.ts
lib/i18n/       messages.en.ts  messages.hi.ts  i18n.tsx (I18nProvider, useT)
lib/telemetry/  client-telemetry.ts  ErrorBoundary.tsx
lib/auth/       session.ts  AuthProvider.tsx  DevLogin.tsx
lib/format.ts
app/            App.tsx  routes.tsx  shells/MobileShell.tsx  shells/ConsoleShell.tsx  shells/CrmShell.tsx  Home.tsx
main.tsx
```

### 13.2 Design tokens (screen inventory)
`ink #1B1F27 · secondary #4A5262 · caption #5F6776 · line #D5D9E0 · ground #F4F5F7 · accent #1F5FBF (tenant token, CSS var --accent) · ok #1D5F3A on #E8F4EC · warn #7A3E06 on #FFF4E5 · bad #8A1F1F on #FDECEC · info #163F7F on #E8F0FB`; radius 8–12 px; touch targets ≥ 44 px; IBM Plex Sans / Devanagari / Mono. `theme.css` defines CSS custom properties; components use classes + variables, no inline colour literals except via tokens.

### 13.3 Components (props contracts)
```ts
Button: { variant?: 'primary'|'secondary'|'ghost'|'danger'; size?: 'md'|'lg'; loading?: boolean; ...ButtonHTMLAttributes }   // min-height 44px; loading → disabled + aria-busy
StatusChip: { tone: 'ok'|'warn'|'bad'|'neutral'|'info'; children }                                                          // role="status" not used; plain span with data-tone
Card: { title?: string; actions?: ReactNode; children }
Tabs: { tabs: { id: string; label: string; badge?: number }[]; value: string; onChange(id): void; variant?: 'segmented'|'underline' }  // role=tablist/tab, aria-selected, arrow-key navigation
FilterChips: { options: { id: string; label: string; count?: number }[]; selected: string[]; onChange(ids: string[]): void; multi?: boolean } // aria-pressed
DataGrid<T>: { columns: { key: string; header: string; render?(row: T): ReactNode; align?: 'left'|'right' }[]; rows: T[]; rowKey(row: T): string; onRowClick?(row: T): void; empty?: ReactNode; caption?: string } // <table>, horizontal scroll wrapper
BottomSheet: { open: boolean; title: string; onClose(): void; children }  // role=dialog aria-modal, Escape closes, focus moves into sheet
Toast: ToastProvider + useToast(): { show(message: string, tone?: Tone): void }  // aria-live=polite, auto-dismiss 4s
Stepper: { steps: { id: string; label: string; state: 'done'|'current'|'todo' }[] }
Timeline: { items: { id: string; at: string; title: string; detail?: string; tone?: Tone }[] }
ConsentCheckbox: { purpose: string; noticeVersion: string; checked: boolean; onChange(checked: boolean): void; label: string } // shows "Notice v<version>"
DisclosureFooter: { text: string }
LoadingSkeleton: { lines?: number } (aria-busy, role=progressbar label "Loading")
EmptyState: { title: string; body?: string; action?: { label: string; onClick(): void } }
ErrorState: { error: ApiError | Error; onRetry?(): void }   // shows friendly title, "Reference <traceId first 8 chars>" with copy button when traceId exists
PermissionDenied: { reason?: 'role'|'tenant' }
OfflineBanner: listens to online/offline events; shows "You are offline. Changes will sync when you reconnect."
```

### 13.4 API client (Adapter over fetch)
```ts
export class ApiError extends Error { status: number; code: string; title: string; detail?: string; traceId?: string; errors?: { path: string; code: string; message: string }[] ; static fromProblem(status, body): ApiError; static network(cause): ApiError /* status 0, code 'network_error' */ }
export interface RequestOptions { idempotencyKey?: string; ifMatch?: string; signal?: AbortSignal; query?: Record<string, string | number | boolean | undefined> }
export interface ApiClient {
  get<T>(path: string, opts?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>
  del<T = void>(path: string, opts?: RequestOptions): Promise<T>
}
export class FetchApiClient implements ApiClient {
  constructor(opts: { baseUrl: string; getToken(): string | undefined; fetchImpl?: typeof fetch; newId?(): string; onError?(e: ApiError): void })
  // adds Authorization when a token exists; traceparent per call; Idempotency-Key on POST (opts.idempotencyKey ?? newId()); If-Match when given
  // 2xx JSON → parsed body (204 → undefined); non-2xx → ApiError.fromProblem; fetch rejection → ApiError.network
}
export function ApiProvider(props: { client: ApiClient; children }): JSX.Element; export function useApi(): ApiClient
export function useApiQuery<T>(path: string | null, opts?: { query?: RequestOptions['query'] }): { data?: T; error?: ApiError; loading: boolean; reload(): void } // null path = idle; aborts on unmount/path change
```

### 13.5 i18n
```ts
export type Lang = 'en' | 'hi';
export function I18nProvider(props: { initialLang?: Lang; children }): JSX.Element  // persists to localStorage 'ui-lang' inside try/catch
export function useT(): { t(key: string, params?: Record<string, string | number>): string; lang: Lang; setLang(l: Lang): void }
// messages are flat key → string maps; '{name}' interpolation; plural form '{count, plural, one {# lead} other {# leads}}'; missing key in hi → falls back to en; missing in en → returns key
```

### 13.6 Client telemetry
```ts
export class ClientTelemetry {
  constructor(opts: { send(events: ClientEvent[]): Promise<void>; now?(): number; maxPerMinute?: number /*10*/; release?: string })
  reportError(error: unknown, route?: string): void    // fingerprint = hash(name + message without digits); duplicates within the session dropped; rate limited
  reportVital(name: string, value: number): void        // 10% sampling via injectable random
  flush(): Promise<void>                                 // batches ≤ 20
}
export function ErrorBoundary(props: { telemetry?: ClientTelemetry; children }): JSX.Element  // renders ErrorState on crash and reports
```

### 13.7 Auth (dev) and shells
- `session.ts`: `getToken()`, `setSession({ token, tenantId, roles })`, `clearSession()` in `sessionStorage` (try/catch).
- `DevLogin`: role picker (Agent, ISP, Manager, Ops, Compliance, Tenant admin, Operator) → `POST /api/v1/dev/tokens` → stores session → navigates to the role's home. Shown only when no session.
- `Home` (P00 Prototype home): role entry cards and links to the three surfaces.
- `MobileShell`: phone frame (390 × 844) on wide screens, full-screen on narrow; bottom nav **Today, Leads, Customers, Book, Me** (`/m/today`, `/m/leads`, `/m/customers`, `/m/book`, `/m/me`); EN/हि switch in the app bar.
- `ConsoleShell` / `CrmShell`: left sidebar with collapsible sections (CRM: Leads, Pipeline, Customers, Tasks, Campaigns, Routing, Import · Console: Dashboard, Onboarding, Users & roles, Tenant, Brand, Configuration, Integrations, Content, Reports, Compliance, Commission, AI controls), search box, tenant name; `<Outlet/>` for screens; unknown routes render a "Coming in a later module" `EmptyState`.

---

## 14. Observability points (this module)

| Event / metric | Level | When |
|---|---|---|
| `request.completed` | info / error | every request (head-sampled, tail-flushed) |
| `http.unhandled_error` | error | 5xx |
| `security.tenant_mismatch` | security | token tenant ≠ host tenant |
| `security.log_override.created`, `security.debug_token.issued` | security | operator actions |
| `outbox.event.dead_lettered` | error | relay gives up |
| `client.error` | warn | web client error (deduped) |
| `app.started` | info | boot |
| metrics in [02 §5](../02-observability.md#5-metrics-catalogue-kernel) | — | — |

---

## 15. Acceptance criteria

Backend
- **AC-M00-01** `Money` keeps integer paise, rejects non-integer paise, rounds `ofRupees` and `multiplyBps` half away from zero, rejects currency mismatch, formats en-IN (`₹1,23,456.78`).
- **AC-M00-02** `PhoneNumber.parse` normalises `+91 98765-43210`, `09876543210`, `919876543210` to `+919876543210`; rejects numbers not starting 6–9 or with wrong length; `masked()` shows only the last 4 digits. `EmailAddress` lowercases, validates and masks.
- **AC-M00-03** `UlidIdGenerator` produces `prefix_` + 26-char Crockford ULIDs that sort by creation time; invalid prefix is rejected; `SequentialIdGenerator` is deterministic.
- **AC-M00-04** `Specification` `and`/`or`/`not` compose correctly.
- **AC-M00-05** `DomainEventFactory` produces CloudEvents-shaped events with traceId from the active request context and rejects invalid types.
- **AC-M00-06** `toProblem` maps DomainErrors, ZodErrors, Nest HttpExceptions and unknown errors to RFC 9457 bodies with `traceId`; unknown errors never leak their message.
- **AC-M00-07** `parseTraceparent` accepts valid W3C headers and rejects malformed/all-zero ones; every HTTP response carries `x-trace-id` and continues an incoming trace.
- **AC-M00-08** `Redactor` removes deny-listed keys, scrubs phone, e-mail, PAN and Aadhaar inside strings, truncates long strings/arrays and limits depth.
- **AC-M00-09** DEBUG logs inside a request are buffered, not written, and are emitted inside the canonical line only when the request fails (5xx), is slow, or is forced.
- **AC-M00-10** A successful fast request writes exactly one canonical `request.completed` line with route template, method, status, durationMs, tenantId and actor (pseudonymised), and no buffered entries.
- **AC-M00-11** Repeated identical errors log a full record only for the first N per window; later ones increment `errors_suppressed_total`; the next window's first record reports `suppressedSinceLast`.
- **AC-M00-12** Debug override for a tenant/module writes DEBUG directly with `sampled: 'forced'`; overrides expire after their TTL; TTL > 60 minutes is rejected; only operators can create them and creation is security-logged.
- **AC-M00-13** A valid `x-debug-token` for the request's tenant forces a flush; an invalid, expired or other-tenant token does not.
- **AC-M00-14** `MetricsRegistry` renders valid Prometheus text for counters, gauges and histograms; rejects unknown labels; enforces the series cardinality cap; HTTP RED metrics use route templates.
- **AC-M00-15** `Tracer.span` / `traced()` record dependency timings in the context and dependency metrics, with outcome `error` when the call throws (error rethrown).
- **AC-M00-16** Head sampler excludes health/metrics routes, always logs errors and applies per-route rates.
- **AC-M00-17** `HmacJwtVerifier` accepts valid HS256 tokens and rejects tampered, expired, wrong-algorithm and claim-missing tokens.
- **AC-M00-18** Tenant is resolved from the Host header only: unknown host → 404, suspended tenant → 403 `tenant_inactive`, token org ≠ host tenant → 403 `tenant_mismatch` with a security log; a matching token succeeds and `/api/v1/me` returns the principal and permissions.
- **AC-M00-19** `@RequirePermission` denies with 403 `permission_denied` when a role lacks the permission and allows wildcard grants; `@OperatorOnly` requires the workforce realm and operator role.
- **AC-M00-20** `@Idempotent` POST: missing/invalid key → 400; same key + same body replays the stored response with `idempotent-replay: true` and the handler runs once; same key + different body → 409 `idempotency_key_reuse`; a failing handler releases the key.
- **AC-M00-21** `OutboxRelay` publishes pending events to subscribers once, marks them published, retries failures and dead-letters after 3 attempts with an error log; the inbox runs a consumer at most once per event id.
- **AC-M00-22** `AuditLog.append` stores actor (pseudonym), tenant, trace id, hashes of before/after (never raw values) and redacted metadata.
- **AC-M00-23** Postgres: migrations are idempotent; `PgUnitOfWork` sets `app.tenant_id` per transaction and rolls back on error; RLS hides tenant A's audit/outbox/idempotency rows from tenant B when connected as `iap_app`. *(integration test)*
- **AC-M00-24** `POST /api/v1/telemetry/client-errors` accepts ≤ 20 events, dedupes client errors by fingerprint into `client.error` warnings, records vitals, and rejects oversize batches with 400.
- **AC-M00-25** `POST /api/v1/dev/tokens` issues a usable token only when dev auth is enabled; otherwise 404.
- **AC-M00-26** `ZodValidationPipe` returns 400 Problem Details with field errors; cursors round-trip and invalid cursors give 400 `invalid_cursor`.

Frontend
- **AC-M00-27** `FetchApiClient` sends Authorization, `traceparent`, auto `Idempotency-Key` on POST and `If-Match` when given; maps problem+json to `ApiError` with `traceId`; network failures become `network_error`.
- **AC-M00-28** `ErrorState` shows a friendly message and the trace reference with a copy action; `EmptyState`, `LoadingSkeleton`, `PermissionDenied` and `OfflineBanner` render accessibly.
- **AC-M00-29** i18n: EN/हि switch re-renders strings, persists the choice, interpolates params, handles plurals and falls back to English.
- **AC-M00-30** `ClientTelemetry` deduplicates errors by fingerprint, rate-limits per minute and batches sends; `ErrorBoundary` renders `ErrorState` and reports.
- **AC-M00-31** Design-system components meet the props contracts: `Tabs` keyboard navigation and `aria-selected`; `BottomSheet` closes on Escape and is a modal dialog; `Button` loading state is disabled and `aria-busy`; `DataGrid` renders columns/rows and the empty state; `FilterChips` toggles `aria-pressed`.
- **AC-M00-32** Shells: `MobileShell` shows the five bottom-nav destinations and the language switch; `ConsoleShell` sidebar sections collapse and filter by search; `DevLogin` obtains a token and routes by role; unknown routes show the "later module" empty state.
