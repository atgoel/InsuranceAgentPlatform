import { Pool } from 'pg';
import { ConflictError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { cursorOffset, encodeCursor } from '../../../kernel/http/pagination';
import { isPgTransaction, PgTransaction, Transaction } from '../../../kernel/persistence/unit-of-work';
import { FieldCipher } from '../../../kernel/crypto/aes-gcm-field-cipher';
import { PhoneNumber } from '../../../kernel/domain';
import { Tenant, TenantKind, TenantProps, TenantStatus } from '../domain/tenant';
import { DistributorEntity, DistributorEntityProps } from '../domain/distributor-entity';
import { TieUp, TieUpSet } from '../domain/tie-up';
import { FeatureFlag, FeatureFlagSet } from '../domain/feature-flags';
import { BrandKit } from '../domain/brand-kit';
import { UsageCounter } from '../domain/usage';
import { UsageMetric } from '../domain/plan';
import { SoloSignup } from '../domain/signup';
import {
  ProvisioningStateRepository,
  SignupRepository,
  TenantDirectory,
  TenantHostRecord,
  TenantSettingsRepository,
} from '../application/ports';

const SIGNUP_KEY_SCOPE = 'platform:solo-signup';

function pg(tx: Transaction): PgTransaction {
  if (!isPgTransaction(tx)) throw new Error('Postgres repository used outside a Postgres transaction');
  return tx;
}
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);

interface TenantRow {
  id: string;
  slug: string;
  display_name: string;
  kind: TenantKind;
  status: TenantStatus;
  plan_code: TenantProps['planCode'];
  trial_ends_at: Date | null;
  cell: string;
  deployment_mode: TenantProps['deploymentMode'];
  crm_mode: TenantProps['crmMode'];
  created_at: Date;
  version: number;
}

const toTenant = (r: TenantRow) =>
  Tenant.restore({
    id: r.id,
    slug: r.slug,
    displayName: r.display_name,
    kind: r.kind,
    status: r.status,
    planCode: r.plan_code,
    ...(r.trial_ends_at ? { trialEndsAt: r.trial_ends_at.toISOString() } : {}),
    cell: r.cell,
    deploymentMode: r.deployment_mode,
    crmMode: r.crm_mode,
    createdAt: r.created_at.toISOString(),
    version: r.version,
  });

/** Platform tenant directory: reads with the app role, writes with the owner role (the app role may only SELECT). */
export class PgTenantDirectory implements TenantDirectory {
  constructor(
    private readonly reader: Pool,
    private readonly writer: Pool,
  ) {}

  async findById(id: string) {
    const { rows } = await this.reader.query<TenantRow>('select * from tenant where id = $1', [id]);
    return rows[0] && toTenant(rows[0]);
  }

  async findBySlug(slug: string) {
    const { rows } = await this.reader.query<TenantRow>('select * from tenant where slug = $1', [slug]);
    return rows[0] && toTenant(rows[0]);
  }

  async findByHost(host: string) {
    const { rows } = await this.reader.query<
      TenantRow & { host: string; host_kind: TenantHostRecord['kind']; verification_token: string | null; verified_at: Date | null }
    >(
      `select t.*, h.host, h.kind as host_kind, h.verification_token, h.verified_at from tenant_host h join tenant t on t.id = h.tenant_id where h.host = $1`,
      [host],
    );
    const r = rows[0];
    return (
      r && {
        tenant: toTenant(r),
        host: {
          tenantId: r.id,
          host: r.host,
          kind: r.host_kind,
          ...(r.verification_token ? { verificationToken: r.verification_token } : {}),
          ...(r.verified_at ? { verifiedAt: iso(r.verified_at) } : {}),
        },
      }
    );
  }

  async list(filter: { status?: TenantStatus; kind?: TenantKind; cursor?: string; limit: number }) {
    const offset = cursorOffset(filter.cursor);
    const { rows } = await this.reader.query<TenantRow>(
      `select * from tenant where ($1::text is null or status = $1) and ($2::text is null or kind = $2) order by created_at, id limit $3 offset $4`,
      [filter.status ?? null, filter.kind ?? null, filter.limit + 1, offset],
    );
    const items = rows.slice(0, filter.limit).map(toTenant);
    return { items, ...(rows.length > filter.limit ? { nextCursor: encodeCursor({ offset: offset + filter.limit }) } : {}) };
  }

  /** Optimistic concurrency exactly like the in-memory directory: the stored version must equal the aggregate's. */
  async save(tenant: Tenant): Promise<void> {
    const p = tenant.props;
    const values = [
      p.id,
      p.slug,
      p.displayName,
      p.kind,
      p.status,
      p.planCode,
      p.trialEndsAt ?? null,
      p.cell,
      p.deploymentMode,
      p.crmMode,
      p.createdAt,
      p.version + 1,
    ];
    const { rowCount } = await this.writer.query(
      `insert into tenant (id, slug, display_name, kind, status, plan_code, trial_ends_at, cell, deployment_mode, crm_mode, created_at, version)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       on conflict (id) do update set slug = excluded.slug, display_name = excluded.display_name, status = excluded.status, plan_code = excluded.plan_code,
         trial_ends_at = excluded.trial_ends_at, cell = excluded.cell, deployment_mode = excluded.deployment_mode, crm_mode = excluded.crm_mode,
         version = excluded.version, updated_at = now()
       where tenant.version = $12 - 1`,
      values,
    );
    if (rowCount === 0) throw new PreconditionFailedError('version_mismatch', 'The tenant was changed by someone else; reload and retry');
    tenant.markSaved();
  }

  async addHost(record: TenantHostRecord): Promise<void> {
    const { rowCount } = await this.writer.query(
      `insert into tenant_host (host, tenant_id, kind, verification_token, verified_at) values ($1, $2, $3, $4, $5) on conflict (host) do nothing`,
      [record.host, record.tenantId, record.kind, record.verificationToken ?? null, record.verifiedAt ?? null],
    );
    if (rowCount === 0) throw new ConflictError('host_taken', 'This host is already registered');
  }

  async listHosts(tenantId: string): Promise<TenantHostRecord[]> {
    const { rows } = await this.reader.query<{
      host: string;
      kind: TenantHostRecord['kind'];
      verification_token: string | null;
      verified_at: Date | null;
    }>('select host, kind, verification_token, verified_at from tenant_host where tenant_id = $1 order by host', [tenantId]);
    return rows.map((r) => ({
      tenantId,
      host: r.host,
      kind: r.kind,
      ...(r.verification_token ? { verificationToken: r.verification_token } : {}),
      ...(r.verified_at ? { verifiedAt: iso(r.verified_at) } : {}),
    }));
  }
}

/** Tenant settings in the caller's RLS-scoped transaction (app.tenant_id is set by PgUnitOfWork). */
export class PgTenantSettingsRepository implements TenantSettingsRepository {
  async getEntity(tx: Transaction) {
    const { rows } = await pg(tx).query<{
      entity_type: DistributorEntityProps['entityType'];
      legal_name: string;
      registration_no: string;
      registration_valid_to: string;
      principal_officer_name: string | null;
    }>(
      `select entity_type, legal_name, registration_no, to_char(registration_valid_to, 'YYYY-MM-DD') as registration_valid_to, principal_officer_name from distributor_entity`,
    );
    const r = rows[0];
    return (
      r &&
      DistributorEntity.restore({
        entityType: r.entity_type,
        legalName: r.legal_name,
        registrationNo: r.registration_no,
        registrationValidTo: r.registration_valid_to,
        ...(r.principal_officer_name ? { principalOfficerName: r.principal_officer_name } : {}),
      })
    );
  }

  async saveEntity(tx: Transaction, e: DistributorEntity) {
    await pg(tx).query(
      `insert into distributor_entity (tenant_id, entity_type, legal_name, registration_no, registration_valid_to, principal_officer_name) values ($1, $2, $3, $4, $5, $6)
       on conflict (tenant_id) do update set entity_type = excluded.entity_type, legal_name = excluded.legal_name, registration_no = excluded.registration_no,
         registration_valid_to = excluded.registration_valid_to, principal_officer_name = excluded.principal_officer_name, updated_at = now()`,
      [tx.tenantId, e.entityType, e.legalName, e.registrationNo, e.registrationValidTo, e.principalOfficerName ?? null],
    );
  }

  async getTieUps(tx: Transaction) {
    const { rows } = await pg(tx).query<{ insurer_id: string; line: TieUp['line']; effective_from: string; effective_to: string | null }>(
      `select insurer_id, line, to_char(effective_from, 'YYYY-MM-DD') as effective_from, to_char(effective_to, 'YYYY-MM-DD') as effective_to from tie_up order by line, insurer_id, effective_from`,
    );
    return new TieUpSet(
      rows.map((r) => ({
        insurerId: r.insurer_id,
        line: r.line,
        effectiveFrom: r.effective_from,
        ...(r.effective_to ? { effectiveTo: r.effective_to } : {}),
      })),
    );
  }

  /** Replace semantics (PUT /tenant/tie-ups): delete then insert, inside the caller's transaction. */
  async replaceTieUps(tx: Transaction, set: TieUpSet) {
    const q = pg(tx);
    await q.query('delete from tie_up');
    for (const t of set.all()) {
      await q.query('insert into tie_up (tenant_id, insurer_id, line, effective_from, effective_to) values ($1, $2, $3, $4, $5)', [
        tx.tenantId,
        t.insurerId,
        t.line,
        t.effectiveFrom,
        t.effectiveTo ?? null,
      ]);
    }
  }

  async getFlags(tx: Transaction) {
    const { rows } = await pg(tx).query<{ key: FeatureFlag['key']; enabled: boolean; gate: FeatureFlag['gate'] | null }>(
      'select key, enabled, gate from tenant_feature_flag',
    );
    return FeatureFlagSet.restore(rows.map((r) => ({ key: r.key, enabled: r.enabled, ...(r.gate ? { gate: r.gate } : {}) })));
  }

  async saveFlags(tx: Transaction, flags: FeatureFlagSet) {
    const q = pg(tx);
    for (const f of flags.list()) {
      await q.query(
        `insert into tenant_feature_flag (tenant_id, key, enabled, gate) values ($1, $2, $3, $4)
         on conflict (tenant_id, key) do update set enabled = excluded.enabled, gate = excluded.gate`,
        [tx.tenantId, f.key, f.enabled, f.gate ? JSON.stringify(f.gate) : null],
      );
    }
  }

  async getBrandKit(tx: Transaction) {
    const { rows } = await pg(tx).query<{
      brand_name: string;
      primary_colour: string;
      secondary_colour: string;
      typeface: string;
      logo_ref: string | null;
      powered_by_visible: boolean;
    }>('select brand_name, primary_colour, secondary_colour, typeface, logo_ref, powered_by_visible from brand_kit');
    const r = rows[0];
    return (
      r &&
      BrandKit.restore({
        brandName: r.brand_name,
        primary: r.primary_colour,
        secondary: r.secondary_colour,
        typeface: r.typeface as BrandKit['props']['typeface'],
        ...(r.logo_ref ? { logoRef: r.logo_ref } : {}),
        poweredByVisible: r.powered_by_visible,
      })
    );
  }

  async saveBrandKit(tx: Transaction, kit: BrandKit) {
    const k = kit.props;
    await pg(tx).query(
      `insert into brand_kit (tenant_id, brand_name, primary_colour, secondary_colour, typeface, logo_ref, powered_by_visible) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (tenant_id) do update set brand_name = excluded.brand_name, primary_colour = excluded.primary_colour, secondary_colour = excluded.secondary_colour,
         typeface = excluded.typeface, logo_ref = excluded.logo_ref, powered_by_visible = excluded.powered_by_visible`,
      [tx.tenantId, k.brandName, k.primary, k.secondary, k.typeface, k.logoRef ?? null, k.poweredByVisible],
    );
  }

  async getUsage(tx: Transaction, metric: UsageMetric, period: string): Promise<UsageCounter | undefined> {
    const { rows } = await pg(tx).query<{ used: number; limit_value: number | null; alerted_at: Date | null }>(
      'select used, limit_value, alerted_at from usage_counter where metric = $1 and period = $2',
      [metric, period],
    );
    const r = rows[0];
    return r && { metric, period, used: r.used, limit: r.limit_value, ...(r.alerted_at ? { alertedAt: r.alerted_at.toISOString() } : {}) };
  }

  async saveUsage(tx: Transaction, c: UsageCounter) {
    await pg(tx).query(
      `insert into usage_counter (tenant_id, metric, period, used, limit_value, alerted_at) values ($1, $2, $3, $4, $5, $6)
       on conflict (tenant_id, metric, period) do update set used = excluded.used, limit_value = excluded.limit_value, alerted_at = excluded.alerted_at`,
      [tx.tenantId, c.metric, c.period, c.used, c.limit, c.alertedAt ?? null],
    );
  }
}

/** Provisioning saga progress (platform data, owner role). */
export class PgProvisioningStateRepository implements ProvisioningStateRepository {
  constructor(private readonly owner: Pool) {}

  async completedSteps(tenantId: string): Promise<string[]> {
    const { rows } = await this.owner.query<{ step: string }>(
      `select step from provisioning_step where tenant_id = $1 and status = 'completed' order by updated_at`,
      [tenantId],
    );
    return rows.map((r) => r.step);
  }

  async markCompleted(tenantId: string, step: string): Promise<void> {
    await this.owner.query(
      `insert into provisioning_step (tenant_id, step, status, error) values ($1, $2, 'completed', null)
       on conflict (tenant_id, step) do update set status = 'completed', error = null, updated_at = now()`,
      [tenantId, step],
    );
  }

  async markFailed(tenantId: string, step: string, error: string): Promise<void> {
    await this.owner.query(
      `insert into provisioning_step (tenant_id, step, status, error) values ($1, $2, 'failed', $3)
       on conflict (tenant_id, step) do update set status = 'failed', error = excluded.error, updated_at = now()`,
      [tenantId, step, error.slice(0, 500)],
    );
  }
}

/** Solo signups (pre-tenant, owner role). The phone is stored encrypted plus a keyed hash for rate limiting. */
export class PgSignupRepository implements SignupRepository {
  constructor(
    private readonly owner: Pool,
    private readonly cipher: FieldCipher,
  ) {}

  async get(id: string): Promise<SoloSignup | undefined> {
    const { rows } = await this.owner.query<{
      id: string;
      phone_enc: string | null;
      display_name: string;
      licence: SoloSignup['licence'];
      consent_notice_version: string;
      otp_hash: string;
      state: SoloSignup['state'];
      attempts: number;
      expires_at: Date;
      tenant_id: string | null;
    }>(
      'select id, phone_enc, display_name, licence, consent_notice_version, otp_hash, state, attempts, expires_at, tenant_id from solo_signup where id = $1',
      [id],
    );
    const r = rows[0];
    if (!r?.phone_enc) return undefined;
    return SoloSignup.restore({
      id: r.id,
      phone: PhoneNumber.parse(await this.cipher.decrypt(SIGNUP_KEY_SCOPE, r.phone_enc)),
      displayName: r.display_name,
      licence: r.licence,
      consentNoticeVersion: r.consent_notice_version,
      otpHash: r.otp_hash,
      state: r.state,
      attempts: r.attempts,
      expiresAt: r.expires_at,
      ...(r.tenant_id ? { tenantId: r.tenant_id } : {}),
    });
  }

  async save(s: SoloSignup): Promise<void> {
    await this.owner.query(
      `insert into solo_signup (id, phone_hash, phone_enc, display_name, licence, consent_notice_version, otp_hash, state, attempts, expires_at, tenant_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (id) do update set state = excluded.state, attempts = excluded.attempts, expires_at = excluded.expires_at, tenant_id = excluded.tenant_id`,
      [
        s.id,
        this.cipher.hash(SIGNUP_KEY_SCOPE, s.phone.e164),
        await this.cipher.encrypt(SIGNUP_KEY_SCOPE, s.phone.e164),
        s.displayName,
        JSON.stringify(s.licence),
        s.consentNoticeVersion,
        s.otpHash,
        s.state,
        s.attempts,
        s.expiresAt,
        s.tenantId ?? null,
      ],
    );
  }

  async countStartedSince(phoneE164: string, since: Date): Promise<number> {
    const { rows } = await this.owner.query<{ n: string }>(
      'select count(*) as n from solo_signup where phone_hash = $1 and created_at >= $2',
      [this.cipher.hash(SIGNUP_KEY_SCOPE, phoneE164), since],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
