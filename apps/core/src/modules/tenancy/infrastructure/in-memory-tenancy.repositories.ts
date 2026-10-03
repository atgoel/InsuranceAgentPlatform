import { Injectable } from '@nestjs/common';
import { Tenant, TenantKind, TenantProps, TenantStatus } from '../domain/tenant';
import { decodeCursor, encodeCursor } from '../../../kernel/http/pagination';
import { DistributorEntity } from '../domain/distributor-entity';
import { TieUpSet } from '../domain/tie-up';
import { FeatureFlagSet } from '../domain/feature-flags';
import { BrandKit } from '../domain/brand-kit';
import { UsageCounter } from '../domain/usage';
import { SIGNUP_OTP_TTL_MS, SoloSignup } from '../domain/signup';
import { TenantDirectory, TenantHostRecord, TenantSettingsRepository, ProvisioningStateRepository, SignupRepository } from '../application/ports';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { ConflictError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';

@Injectable()
export class InMemoryTenantDirectory implements TenantDirectory {
  /** Immutable snapshots: callers always get a fresh aggregate, so stale copies are detectable. */
  private readonly tenants = new Map<string, TenantProps>();
  private readonly hosts = new Map<string, TenantHostRecord>();

  async findById(id: string): Promise<Tenant | undefined> {
    const props = this.tenants.get(id);
    return props && Tenant.restore({ ...props });
  }

  async findBySlug(slug: string): Promise<Tenant | undefined> {
    const props = [...this.tenants.values()].find((t) => t.slug === slug);
    return props && Tenant.restore({ ...props });
  }

  async findByHost(host: string): Promise<{ tenant: Tenant; host: TenantHostRecord } | undefined> {
    const record = this.hosts.get(host);
    const props = record && this.tenants.get(record.tenantId);
    return record && props ? { tenant: Tenant.restore({ ...props }), host: { ...record } } : undefined;
  }

  async list(filter: { status?: TenantStatus; kind?: TenantKind; cursor?: string; limit: number }): Promise<{ items: Tenant[]; nextCursor?: string }> {
    const all = [...this.tenants.values()]
      .filter((t) => (!filter.status || t.status === filter.status) && (!filter.kind || t.kind === filter.kind))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const start = filter.cursor ? Number(decodeCursor(filter.cursor).offset ?? 0) : 0;
    const page = all.slice(start, start + filter.limit);
    const next = start + filter.limit < all.length ? encodeCursor({ offset: start + filter.limit }) : undefined;
    return { items: page.map((p) => Tenant.restore({ ...p })), nextCursor: next };
  }

  async save(tenant: Tenant): Promise<void> {
    const stored = this.tenants.get(tenant.props.id);
    if (stored && stored.version !== tenant.props.version) {
      throw new PreconditionFailedError('version_mismatch', 'The tenant was changed by someone else; reload and retry');
    }
    this.tenants.set(tenant.props.id, { ...tenant.props, version: tenant.props.version + 1 });
    tenant.markSaved();
  }

  async addHost(record: TenantHostRecord): Promise<void> {
    if (this.hosts.has(record.host)) throw new ConflictError('host_taken', 'This host is already registered');
    this.hosts.set(record.host, { ...record });
  }

  async listHosts(tenantId: string): Promise<TenantHostRecord[]> {
    return [...this.hosts.values()].filter((h) => h.tenantId === tenantId).map((h) => ({ ...h }));
  }
}

@Injectable()
export class InMemoryTenantSettingsRepository implements TenantSettingsRepository {
  private entities = new Map<string, DistributorEntity>();
  private tieUps = new Map<string, TieUpSet>();
  private flags = new Map<string, FeatureFlagSet>();
  private brandKits = new Map<string, BrandKit>();
  private usage = new Map<string, Map<string, UsageCounter>>();

  async getEntity(_tx: Transaction): Promise<DistributorEntity | undefined> {
    // Extract tenant ID from transaction context
    const tenantId = _tx.tenantId;
    return this.entities.get(tenantId);
  }

  async saveEntity(_tx: Transaction, e: DistributorEntity): Promise<void> {
    const tenantId = _tx.tenantId;
    this.entities.set(tenantId, e);
  }

  async getTieUps(_tx: Transaction): Promise<TieUpSet> {
    const tenantId = _tx.tenantId;
    return this.tieUps.get(tenantId) || new TieUpSet([]);
  }

  async replaceTieUps(_tx: Transaction, set: TieUpSet): Promise<void> {
    const tenantId = _tx.tenantId;
    this.tieUps.set(tenantId, set);
  }

  async getFlags(_tx: Transaction): Promise<FeatureFlagSet> {
    const tenantId = _tx.tenantId;
    return this.flags.get(tenantId) || FeatureFlagSet.defaults();
  }

  async saveFlags(_tx: Transaction, flags: FeatureFlagSet): Promise<void> {
    const tenantId = _tx.tenantId;
    this.flags.set(tenantId, flags);
  }

  async getBrandKit(_tx: Transaction): Promise<BrandKit | undefined> {
    const tenantId = _tx.tenantId;
    return this.brandKits.get(tenantId);
  }

  async saveBrandKit(_tx: Transaction, kit: BrandKit): Promise<void> {
    const tenantId = _tx.tenantId;
    this.brandKits.set(tenantId, kit);
  }

  async getUsage(_tx: Transaction, metric: string, period: string): Promise<UsageCounter | undefined> {
    const tenantId = _tx.tenantId;
    return this.usage.get(tenantId)?.get(`${metric}:${period}`);
  }

  async saveUsage(_tx: Transaction, counter: UsageCounter): Promise<void> {
    const tenantId = _tx.tenantId;
    if (!this.usage.has(tenantId)) {
      this.usage.set(tenantId, new Map());
    }
    this.usage.get(tenantId)!.set(`${counter.metric}:${counter.period}`, counter);
  }
}

@Injectable()
export class InMemoryProvisioningStateRepository implements ProvisioningStateRepository {
  private steps = new Map<string, Set<string>>();

  async completedSteps(tenantId: string): Promise<string[]> {
    return Array.from(this.steps.get(tenantId) || []);
  }

  private readonly failures = new Map<string, { step: string; error: string }>();

  async markCompleted(tenantId: string, step: string): Promise<void> {
    const done = this.steps.get(tenantId) ?? new Set<string>();
    done.add(step);
    this.steps.set(tenantId, done);
    if (this.failures.get(tenantId)?.step === step) this.failures.delete(tenantId);
  }

  async markFailed(tenantId: string, step: string, error: string): Promise<void> {
    this.failures.set(tenantId, { step, error });
  }

  lastFailure(tenantId: string): { step: string; error: string } | undefined {
    return this.failures.get(tenantId);
  }
}

@Injectable()
export class InMemorySignupRepository implements SignupRepository {
  private readonly signups = new Map<string, SoloSignup>();

  async get(id: string): Promise<SoloSignup | undefined> {
    return this.signups.get(id);
  }

  async save(s: SoloSignup): Promise<void> {
    this.signups.set(s.id, s);
  }

  async countStartedSince(phoneE164: string, since: Date): Promise<number> {
    return [...this.signups.values()].filter((s) => s.phone.e164 === phoneE164 && startedAt(s) >= since.getTime()).length;
  }
}

function startedAt(s: SoloSignup): number {
  return s.expiresAt.getTime() - SIGNUP_OTP_TTL_MS;
}
