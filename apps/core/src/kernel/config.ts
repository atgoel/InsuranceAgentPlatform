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
  staticTenants: z.record(
    z.object({
      tenantId: z.string(),
      status: z.enum(['active', 'suspended', 'provisioning', 'offboarded']),
    }),
  ),
  logSampleRates: z.record(z.number()),
});

export function loadConfig(env: NodeJS.ProcessEnv): KernelConfig {
  const nodeEnv = env.NODE_ENV || 'development';
  const persistence = (env.PERSISTENCE || 'memory') as 'memory' | 'pg';
  const port = env.PORT ? parseInt(env.PORT, 10) : 3000;
  const tokenSecret = env.AUTH_HS256_SECRET || '';
  const actorPepper = env.ACTOR_PEPPER || '';
  const debugTokenSecret = env.DEBUG_TOKEN_SECRET || '';
  const devAuthEnabled = env.DEV_AUTH === '1' && nodeEnv !== 'production';
  const trustProxy = env.TRUST_PROXY === '1';

  // Parse optional JSON fields
  let staticTenants: Record<string, ResolvedTenant> = {};
  if (env.DEV_TENANTS) {
    try {
      staticTenants = JSON.parse(env.DEV_TENANTS);
    } catch {
      throw new Error('Invalid DEV_TENANTS JSON');
    }
  }

  let logSampleRates: Record<string, number> = {};
  if (env.LOG_SAMPLE_RATES) {
    try {
      logSampleRates = JSON.parse(env.LOG_SAMPLE_RATES);
    } catch {
      throw new Error('Invalid LOG_SAMPLE_RATES JSON');
    }
  }

  const config: KernelConfig = {
    env: nodeEnv as 'development' | 'test' | 'production',
    port,
    persistence,
    databaseUrl: env.DATABASE_URL,
    tokenSecret,
    actorPepper,
    debugTokenSecret,
    devAuth: devAuthEnabled,
    trustProxy,
    staticTenants,
    logSampleRates,
  };

  // Validate using zod
  const validationErrors: string[] = [];

  // Validate environment
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    validationErrors.push(`Invalid NODE_ENV: ${nodeEnv}`);
  }

  // Validate required secrets
  if (!tokenSecret) {
    validationErrors.push('AUTH_HS256_SECRET is required');
  }
  if (!actorPepper) {
    validationErrors.push('ACTOR_PEPPER is required');
  }
  if (!debugTokenSecret) {
    validationErrors.push('DEBUG_TOKEN_SECRET is required');
  }

  // Validate secret length in production
  if (nodeEnv === 'production') {
    if (tokenSecret.length < 32) {
      validationErrors.push(
        'AUTH_HS256_SECRET must be at least 32 characters in production',
      );
    }
  }

  // Validate persistence settings
  if (persistence === 'pg' && !config.databaseUrl) {
    validationErrors.push('DATABASE_URL is required when PERSISTENCE is pg');
  }

  if (validationErrors.length > 0) {
    throw new Error(`Configuration validation failed:\n${validationErrors.join('\n')}`);
  }

  // Validate with zod
  configSchema.parse(config);

  return config;
}
