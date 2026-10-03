import { Clock } from '../domain/clock';
import { IdGenerator } from '../domain/id-generator';
import { ValidationError } from '../errors/domain-errors';

export interface LogOverrideScope {
  tenantId?: string;
  module?: string;
  actor?: string;
}

export interface LogOverride {
  id: string;
  scope: LogOverrideScope;
  level: 'debug';
  expiresAt: string;
  createdBy: string;
}

export class LogOverrideStore {
  private overrides: LogOverride[] = [];
  private clock: Clock;
  private ids: IdGenerator;

  constructor(clock: Clock, ids: IdGenerator) {
    this.clock = clock;
    this.ids = ids;
  }

  put(input: { scope: LogOverrideScope; ttlMinutes: number; createdBy: string }): LogOverride {
    if (input.ttlMinutes < 1 || input.ttlMinutes > 60) {
      throw new ValidationError('override_ttl_invalid', 'TTL must be between 1 and 60 minutes');
    }

    if (
      !input.scope.tenantId &&
      !input.scope.module &&
      !input.scope.actor
    ) {
      throw new ValidationError('override_scope_required', 'At least one scope field is required');
    }

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60 * 1000);

    const override: LogOverride = {
      id: this.ids.next('log'),
      scope: input.scope,
      level: 'debug',
      expiresAt: expiresAt.toISOString(),
      createdBy: input.createdBy,
    };

    this.overrides.push(override);
    return override;
  }

  list(): LogOverride[] {
    // Purge expired overrides first
    const now = this.clock.now();
    this.overrides = this.overrides.filter((o) => new Date(o.expiresAt) > now);
    return this.overrides;
  }

  remove(id: string): boolean {
    const index = this.overrides.findIndex((o) => o.id === id);
    if (index >= 0) {
      this.overrides.splice(index, 1);
      return true;
    }
    return false;
  }

  isDebugEnabled(scope: LogOverrideScope): boolean {
    const now = this.clock.now();
    return this.overrides.some((o) => {
      if (new Date(o.expiresAt) <= now) return false;

      // Check if override matches the scope
      if (scope.tenantId && o.scope.tenantId && o.scope.tenantId !== scope.tenantId) {
        return false;
      }
      if (scope.module && o.scope.module && o.scope.module !== scope.module) {
        return false;
      }
      if (scope.actor && o.scope.actor && o.scope.actor !== scope.actor) {
        return false;
      }

      return true;
    });
  }
}
