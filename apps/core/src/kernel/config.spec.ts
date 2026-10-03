import { loadConfig } from './config';

describe('config', () => {
  describe('loadConfig', () => {
    it('loads configuration from environment variables with defaults', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'development',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
      };

      const config = loadConfig(env);

      expect(config.env).toBe('development');
      expect(config.port).toBe(3000);
      expect(config.persistence).toBe('memory');
      expect(config.devAuth).toBe(false);
      expect(config.trustProxy).toBe(false);
    });

    it('parses PORT as a number', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'test',
        PORT: '5000',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
      };

      const config = loadConfig(env);

      expect(config.port).toBe(5000);
    });

    it('sets devAuth to false in production', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
        SHARE_TOKEN_SECRET: 'test-share-secret-32-chars-min!!1',
        DEV_AUTH: '1',
      };

      const config = loadConfig(env);

      expect(config.devAuth).toBe(false);
    });

    it('enables devAuth when DEV_AUTH=1 and not in production', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'development',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
        DEV_AUTH: '1',
      };

      const config = loadConfig(env);

      expect(config.devAuth).toBe(true);
    });

    it('parses static tenants from JSON', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'test',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
        DEV_TENANTS: JSON.stringify({
          'acme.test': { tenantId: 'ten_acme', status: 'active' },
        }),
      };

      const config = loadConfig(env);

      expect(config.staticTenants['acme.test']).toEqual({
        tenantId: 'ten_acme',
        status: 'active',
      });
    });

    it('throws on invalid environment', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'invalid-env',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
      };

      expect(() => loadConfig(env)).toThrow();
    });

    it('throws when required secrets are missing', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        // Missing AUTH_HS256_SECRET, ACTOR_PEPPER, DEBUG_TOKEN_SECRET
      };

      expect(() => loadConfig(env)).toThrow();
    });

    it('throws when secret is too short', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        AUTH_HS256_SECRET: 'short',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
      };

      expect(() => loadConfig(env)).toThrow();
    });

    it('AC-M06-08 production requires SHARE_TOKEN_SECRET of at least 32 characters', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
      };

      expect(() => loadConfig(env)).toThrow('SHARE_TOKEN_SECRET must be at least 32 characters in production');
      expect(() => loadConfig({ ...env, SHARE_TOKEN_SECRET: 'too-short' })).toThrow('SHARE_TOKEN_SECRET must be at least 32 characters in production');
      expect(loadConfig({ ...env, SHARE_TOKEN_SECRET: 'test-share-secret-32-chars-min!!1' }).shareTokenSecret).toBe('test-share-secret-32-chars-min!!1');
    });

    it('AC-M06-08 outside production the share secret falls back to one derived from the token secret unless set', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'development',
        AUTH_HS256_SECRET: 'dev-secret',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
      };

      expect(loadConfig(env).shareTokenSecret).toBe('dev-secret:share');
      expect(loadConfig({ ...env, SHARE_TOKEN_SECRET: 'explicit' }).shareTokenSecret).toBe('explicit');
    });

    it('allows short secrets in development', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'development',
        AUTH_HS256_SECRET: 'short',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
      };

      const config = loadConfig(env);

      expect(config.tokenSecret).toBe('short');
    });

    it('parses persistence mode', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'test',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
        PERSISTENCE: 'pg',
        DATABASE_URL: 'postgres://user:pass@localhost/db',
      };

      const config = loadConfig(env);

      expect(config.persistence).toBe('pg');
      expect(config.databaseUrl).toBe('postgres://user:pass@localhost/db');
    });

    it('requires DATABASE_URL when persistence is pg', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
        SHARE_TOKEN_SECRET: 'test-share-secret-32-chars-min!!1',
        PERSISTENCE: 'pg',
      };

      expect(() => loadConfig(env)).toThrow('DATABASE_URL is required when PERSISTENCE is pg');
    });

    it('parses LOG_SAMPLE_RATES as JSON', () => {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'test',
        AUTH_HS256_SECRET: 'test-secret-32-chars-minimum!!!1',
        ACTOR_PEPPER: 'test-pepper',
        DEBUG_TOKEN_SECRET: 'test-debug-secret-32-chars!!!1',
        LOG_SAMPLE_RATES: JSON.stringify({
          'GET /api/v1/leads': 0.5,
        }),
      };

      const config = loadConfig(env);

      expect(config.logSampleRates['GET /api/v1/leads']).toBe(0.5);
    });
  });
});
