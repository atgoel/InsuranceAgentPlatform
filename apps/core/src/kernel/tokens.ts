/**
 * Dependency injection tokens for the kernel.
 * These are shared across all modules and instantiated in KernelModule.
 */

export const CLOCK = Symbol('Clock');
export const ID_GENERATOR = Symbol('IdGenerator');
export const LOGGER = Symbol('Logger');
export const LOG_SINK = Symbol('LogSink');
export const METRICS = Symbol('MetricsRegistry');
export const TRACER = Symbol('Tracer');
export const UNIT_OF_WORK = Symbol('UnitOfWork');
export const OUTBOX = Symbol('Outbox');
export const EVENT_BUS = Symbol('EventBus');
export const INBOX = Symbol('Inbox');
export const AUDIT_LOG = Symbol('AuditLog');
export const IDEMPOTENCY_STORE = Symbol('IdempotencyStore');
export const TOKEN_VERIFIER = Symbol('TokenVerifier');
export const TENANT_RESOLVER = Symbol('TenantResolver');
export const PERMISSION_POLICY = Symbol('PermissionPolicy');
export const LOG_OVERRIDES = Symbol('LogOverrideStore');
export const DEBUG_TOKENS = Symbol('DebugTokenService');
export const KERNEL_OPTIONS = Symbol('KernelOptions');
