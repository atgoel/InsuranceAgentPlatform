import { Injectable } from '@nestjs/common';
import { Tenant } from '../domain/tenant';
import { DistributorEntity } from '../domain/distributor-entity';
import { TieUpSet } from '../domain/tie-up';
import { FeatureFlagSet } from '../domain/feature-flags';
import { BrandKit } from '../domain/brand-kit';
import { UsageCounter } from '../domain/usage';
import { SoloSignup } from '../domain/signup';
import { TenantDirectory, TenantHostRecord, TenantSettingsRepository, ProvisioningStateRepository, SignupRepository } from '../application/ports';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { NotFoundError, ConflictError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';

@Injectable()
export class InMemoryTenantDirectory implements TenantDirectory {
  private tenants = new Map<string, Tenant>();
  private slugIndex = new Map<string, string>();
  private hosts = new Map<string, TenantHostRecord>();
  private hostToTenantId = new Map<string, string>();

  async findById(id: string): Promise<Tenant | undefined> {
    return this.tenants.get(id);
  }

  async findBySlug(slug: string): Promise<Tenant | undefined> {
    const id = this.slugIndex.get(slug);
    return id ? this.tenants.get(id) : undefined;
  }

  async findByHost(host: string): Promise<{ tenant: Tenant; host: TenantHostRecord } | undefined> {
    const hostRecord = this.hosts.get(host);
    if (!hostRecord || !hostRecord.verifiedAt) return undefined; // Only resolve verified hosts

    const tenant = this.tenants.get(hostRecord.tenantId);
    if (!tenant) return undefined;

    return { tenant, host: hostRecord };
  }

  async list(filter: { status?: string; kind?: string; cursor?: string; limit: number }): Promise<{ items: Tenant[]; nextCursor?: string }> {
    let items = Array.from(this.tenants.values());

    if (filter.status) {
      items = items.filter((t) => t.props.status === filter.status);
    }
    if (filter.kind) {
      items = items.filter((t) => t.props.kind === filter.kind);
    }

    items.sort((a, b) => a.props.createdAt.localeCompare(b.props.createdAt));

    const start = filter.cursor ? parseInt(atob(filter.cursor)) : 0;
    const end = start + filter.limit;
    const nextItems = items.slice(start, end);
    const hasMore = end < items.length;

    return {
      items: nextItems,
      nextCursor: hasMore ? btoa((end).toString()) : undefined,
    };
  }

  async save(tenant: Tenant): Promise<void> {
    const existing = this.tenants.get(tenant.props.id);
    if (existing && existing.props.version !== tenant.props.version) {
      throw new PreconditionFailedError('version_mismatch', 'Tenant version mismatch');
    }

    // Update slug index
    if (existing) {
      this.slugIndex.delete(existing.props.slug);
    }
    this.slugIndex.set(tenant.props.slug, tenant.props.id);

    this.tenants.set(tenant.props.id, tenant);
  }

  async addHost(record: TenantHostRecord): Promise<void> {
    if (this.hosts.has(record.host)) {
      throw new ConflictError('host_taken', `Host ${record.host} is already taken`);
    }

    this.hosts.set(record.host, record);
    this.hostToTenantId.set(record.host, record.tenantId);
  }

  async listHosts(tenantId: string): Promise<TenantHostRecord[]> {
    return Array.from(this.hosts.values()).filter((h) => h.tenantId === tenantId);
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
    const tenantId = ((_tx as any).tenantId) as string;
    return this.entities.get(tenantId);
  }

  async saveEntity(_tx: Transaction, e: DistributorEntity): Promise<void> {
    const tenantId = ((_tx as any).tenantId) as string;
    this.entities.set(tenantId, e);
  }

  async getTieUps(_tx: Transaction): Promise<TieUpSet> {
    const tenantId = ((_tx as any).tenantId) as string;
    return this.tieUps.get(tenantId) || new TieUpSet([]);
  }

  async replaceTieUps(_tx: Transaction, set: TieUpSet): Promise<void> {
    const tenantId = ((_tx as any).tenantId) as string;
    this.tieUps.set(tenantId, set);
  }

  async getFlags(_tx: Transaction): Promise<FeatureFlagSet> {
    const tenantId = ((_tx as any).tenantId) as string;
    return this.flags.get(tenantId) || FeatureFlagSet.defaults();
  }

  async saveFlags(_tx: Transaction, flags: FeatureFlagSet): Promise<void> {
    const tenantId = ((_tx as any).tenantId) as string;
    this.flags.set(tenantId, flags);
  }

  async getBrandKit(_tx: Transaction): Promise<BrandKit | undefined> {
    const tenantId = ((_tx as any).tenantId) as string;
    return this.brandKits.get(tenantId);
  }

  async saveBrandKit(_tx: Transaction, kit: BrandKit): Promise<void> {
    const tenantId = ((_tx as any).tenantId) as string;
    this.brandKits.set(tenantId, kit);
  }

  async getUsage(_tx: Transaction, metric: string, period: string): Promise<UsageCounter | undefined> {
    const tenantId = ((_tx as any).tenantId) as string;
    return this.usage.get(tenantId)?.get(`${metric}:${period}`);
  }

  async saveUsage(_tx: Transaction, counter: UsageCounter): Promise<void> {
    const tenantId = ((_tx as any).tenantId) as string;
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

  async markCompleted(tenantId: string, step: string): Promise<void> {
    if (!this.steps.has(tenantId)) {
      this.steps.set(tenantId, new Set());
    }
    this.steps.get(tenantId)!.add(step);
  }

  async markFailed(tenantId: string, step: string, error: string): Promise<void> {
    // In memory, we just don't mark as completed
    // In a real DB, we'd store the error
  }
}

@Injectable()
export class InMemorySignupRepository implements SignupRepository {
  private signups = new Map<string, SoloSignup>();

  async get(id: string): Promise<SoloSignup | undefined> {
    return this.signups.get(id);
  }

  async save(s: SoloSignup): Promise<void> {
    this.signups.set(s.id, s);
  }
}
