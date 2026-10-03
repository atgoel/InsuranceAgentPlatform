import { z } from 'zod';
import {
  CLOCK,
  ID_GENERATOR,
  LOGGER,
  LOG_SINK,
  METRICS,
  TRACER,
  UNIT_OF_WORK,
  OUTBOX,
  EVENT_BUS,
  INBOX,
  AUDIT_LOG,
  IDEMPOTENCY_STORE,
  TOKEN_VERIFIER,
  TENANT_RESOLVER,
  PERMISSION_POLICY,
  LOG_OVERRIDES,
  DEBUG_TOKENS,
  KERNEL_OPTIONS,
} from './tokens';

export {
  CLOCK,
  ID_GENERATOR,
  LOGGER,
  LOG_SINK,
  METRICS,
  TRACER,
  UNIT_OF_WORK,
  OUTBOX,
  EVENT_BUS,
  INBOX,
  AUDIT_LOG,
  IDEMPOTENCY_STORE,
  TOKEN_VERIFIER,
  TENANT_RESOLVER,
  PERMISSION_POLICY,
  LOG_OVERRIDES,
  DEBUG_TOKENS,
  KERNEL_OPTIONS,
};

export interface ResolvedTenant {
  tenantId: string;
  status: 'active' | 'suspended' | 'provisioning' | 'offboarded';
}

export interface KernelConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  persistence: 'memory' | 'pg';
  databaseUrl?: string;
  /** Owner-role DSN for cross-tenant platform work (outbox relay, tenant directory); defaults to databaseUrl. */
  platformDatabaseUrl?: string;
  tokenSecret: string;
  actorPepper: string;
  debugTokenSecret: string;
  devAuth: boolean;
  trustProxy: boolean;
  staticTenants: Record<string, ResolvedTenant>;
  logSampleRates: Record<string, number>;
}

const configSchema = z.object({
  env: z.enum(['development', 'test', 'production']),
  port: z.number().int().positive(),
  persistence: z.enum(['memory', 'pg']),
  databaseUrl: z.string().optional(),
  tokenSecret: z.string(),
  actorPepper: z.string(),
  debugTokenSecret: z.string(),
  devAuth: z.boolean(),
  trustProxy: z.boolean(),
  staticTenants: z.record(z.string(), z.object({
    tenantId: z.string(),
    status: z.enum(['active', 'suspended', 'provisioning', 'offboarded']),
  })),
  logSampleRates: z.record(z.string(), z.number()),
});

 
export function loadConfig(env: NodeJS.ProcessEnv): KernelConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const config: KernelConfig = {
    env: nodeEnv as KernelConfig['env'],
    port: env.PORT ? parseInt(env.PORT, 10) : 3000,
    persistence: (env.PERSISTENCE || 'memory') as KernelConfig['persistence'],
    databaseUrl: env.DATABASE_URL,
    platformDatabaseUrl: env.PLATFORM_DATABASE_URL ?? env.DATABASE_URL,
    tokenSecret: env.AUTH_HS256_SECRET || '',
    actorPepper: env.ACTOR_PEPPER || '',
    debugTokenSecret: env.DEBUG_TOKEN_SECRET || '',
    devAuth: env.DEV_AUTH === '1' && nodeEnv !== 'production',
    trustProxy: env.TRUST_PROXY === '1',
    staticTenants: parseJson<Record<string, ResolvedTenant>>(env.DEV_TENANTS, 'DEV_TENANTS'),
    logSampleRates: parseJson<Record<string, number>>(env.LOG_SAMPLE_RATES, 'LOG_SAMPLE_RATES'),
  };
  const errors = validationErrors(nodeEnv, config);
  if (errors.length > 0) throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  configSchema.parse(config);
  return config;
}

function parseJson<T>(raw: string | undefined, name: string): T {
  if (!raw) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid ${name} JSON`);
  }
}

function validationErrors(nodeEnv: string, c: KernelConfig): string[] {
  const errors: string[] = [];
  if (!['development', 'test', 'production'].includes(nodeEnv)) errors.push(`Invalid NODE_ENV: ${nodeEnv}`);
  if (!c.tokenSecret) errors.push('AUTH_HS256_SECRET is required');
  if (!c.actorPepper) errors.push('ACTOR_PEPPER is required');
  if (!c.debugTokenSecret) errors.push('DEBUG_TOKEN_SECRET is required');
  if (nodeEnv === 'production' && c.tokenSecret.length < 32) errors.push('AUTH_HS256_SECRET must be at least 32 characters in production');
  if (c.persistence === 'pg' && !c.databaseUrl) errors.push('DATABASE_URL is required when PERSISTENCE is pg');
  return errors;
}
