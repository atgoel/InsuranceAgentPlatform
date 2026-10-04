import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '../../../kernel/observability/request-context';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { TENANT_DIRECTORY, TenantDirectory } from '../../tenancy/application/ports';
import { PolicyStatusResult } from '../domain/canonical';
import { CallOutcome } from '../domain/outcome';
import { RetryPolicy } from '../domain/retry-policy';
import { integrationPolicy } from '../domain/integration-policy';
import { statusOutput, validateOutcome, validateUrl } from './canonical-validation';
import { DeadLetterWriter } from './dead-letter-writer';
import { IntegrationContext } from './integration-context';
import { IntegrationExecutor } from './integration-executor';
import { IntegrationResources, IntegrationWork } from './integration-resources';
import { IntegrationRouting } from './integration-routing';
import { GatewaySubmissionResult, SubmissionRecord } from './ports';

@Injectable()
export class ReconciliationJob {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly tenants: TenantDirectory,
    private readonly context: IntegrationContext,
    private readonly resources: IntegrationResources,
    private readonly work: IntegrationWork,
    private readonly executor: IntegrationExecutor,
    private readonly routing: IntegrationRouting,
    private readonly letters: DeadLetterWriter,
  ) {}

  async runOnce(): Promise<void> {
    let cursor: string | undefined;
    let unavailable: BusinessRuleError | undefined;
    do {
      const page = await this.tenants.list({ cursor, limit: 100 });
      for (const tenant of page.items) {
        const failure = await this.runTenant(tenant.props.id);
        unavailable ??= failure;
      }
      cursor = page.nextCursor;
    } while (cursor);
    if (unavailable) throw unavailable;
  }

  private async runTenant(tenantId: string): Promise<BusinessRuleError | undefined> {
    const ctx = RequestContext.create({ startedAtMs: this.context.runtime.clock.now().getTime() });
    ctx.tenantId = tenantId;
    ctx.actor = 'system';
    ctx.module = 'integration';
    return RequestContext.run(ctx, async () => {
      const now = this.context.runtime.clock.now();
      const leaseUntil = new Date(now.getTime() + integrationPolicy.submissionLeaseMs).toISOString();
      const records = await this.context.uow.run(tenantId, (tx) =>
        this.work.submissions.claimDue(tx, now.toISOString(), leaseUntil, integrationPolicy.reconciliationBatchSize));
      let unavailable: BusinessRuleError | undefined;
      for (const record of records) {
        const renewed = await this.renewClaim(tenantId, record);
        if (!renewed) continue;
        const failure = await this.reconcileAvailable(tenantId, renewed);
        unavailable ??= failure;
      }
      this.context.runtime.logger.info('job.completed', 'Integration reconciliation completed', {
        claimed: records.length, historicalVersionUnavailable: !!unavailable,
      });
      return unavailable;
    });
  }

  private async reconcileAvailable(tenantId: string, record: SubmissionRecord): Promise<BusinessRuleError | undefined> {
    try {
      await this.reconcile(tenantId, record);
      return undefined;
    } catch (error) {
      if (error instanceof BusinessRuleError && error.code === 'adapter_version_unavailable') return error;
      throw error;
    }
  }

  private async renewClaim(tenantId: string, record: SubmissionRecord): Promise<SubmissionRecord | undefined> {
    const now = this.context.runtime.clock.now();
    const renewed = { ...record, leaseUntil: new Date(now.getTime() + integrationPolicy.submissionLeaseMs).toISOString(),
      updatedAt: now.toISOString() };
    const saved = await this.context.uow.run(tenantId, (tx) => this.work.submissions.save(tx, renewed,
      { state: record.state, leaseUntil: record.leaseUntil }));
    return saved ? renewed : undefined;
  }

  private async reconcile(tenantId: string, record: SubmissionRecord): Promise<void> {
    const adapter = this.resources.registry.get(record.adapterId, record.adapterVersion);
    if (!adapter?.getStatus) {
      await this.releaseUnavailable(tenantId, record);
      return;
    }
    const operation = this.routing.spec(record.adapterId, record.adapterVersion, record.statusRequest, 'GET_STATUS');
    const route = operation?.route === 'FILE' ? 'FILE' : 'API';
    const result = await this.executor.run({
      tenantId, adapter, operation: 'GET_STATUS', route, key: record.idempotencyKey,
      timeoutMs: this.routing.timeout(record.adapterId, record.adapterVersion, record.statusRequest, 'GET_STATUS'),
      invoke: async (ctx) => this.validateStatus(record, await adapter.getStatus!(ctx, {
        idempotencyKey: record.idempotencyKey, insurerRef: record.statusRequest.insurerRef,
      })),
    }, false);
    if (result.outcome.kind === 'success') {
      await this.complete(tenantId, record, route, result.outcome.value);
      return;
    }
    await this.fail(tenantId, record, result.outcome);
  }

  private validateStatus(record: SubmissionRecord, response: CallOutcome<PolicyStatusResult>) {
    const outcome = validateOutcome(statusOutput, response);
    if (outcome.kind === 'success' && outcome.value.status === 'ISSUED' && /^[a-z][a-z0-9+.-]*:/i.test(outcome.value.documentRef)) {
      return validateUrl(outcome, outcome.value.documentRef, record.statusRequest.insurerId, this.resources.allowlist);
    }
    return outcome;
  }

  private async complete(tenantId: string, record: SubmissionRecord, route: 'API' | 'FILE', status: PolicyStatusResult) {
    const result: GatewaySubmissionResult = {
      kind: 'RECONCILED', route, adapterId: record.adapterId, adapterVersion: record.adapterVersion,
      reconciliationId: record.id, status,
    };
    const resultEnc = await this.context.runtime.cipher.encrypt(tenantId, JSON.stringify(result));
    await this.context.uow.run(tenantId, async (tx) => {
      const saved = await this.work.submissions.save(tx, {
        ...record, state: 'COMPLETED', outcome: 'success', resultKind: 'RECONCILED', resultEnc,
        leaseUntil: undefined, nextAttemptAt: undefined, lastError: undefined,
        updatedAt: this.context.runtime.clock.now().toISOString(),
      }, { state: record.state, leaseUntil: record.leaseUntil });
      if (!saved) return;
      await this.context.recorder.record(tx, {
        event: { type: 'integration.submission.reconciled', subject: record.id, data: {
          reconciliationId: record.id, adapterId: record.adapterId, adapterVersion: record.adapterVersion,
          idempotencyKey: record.idempotencyKey, status: status.status,
        } },
        audit: { action: 'integration.submission.reconciled', entityType: 'Submission', entityId: record.id },
      });
    });
  }

  private async fail(tenantId: string, record: SubmissionRecord, outcome: Exclude<CallOutcome<PolicyStatusResult>, { kind: 'success' }>) {
    const attempts = record.attempts + 1;
    const lastError = outcome.kind === 'unknown' ? outcome.reason : outcome.code;
    const now = this.context.runtime.clock.now();
    const policy = new RetryPolicy({ maxAttempts: 3, baseMs: 200, capMs: 5000 }, () => this.context.runtime.random.next());
    const nextAttemptAt = new Date(now.getTime() + policy.delayFor(attempts)).toISOString();
    await this.context.uow.run(tenantId, async (tx) => {
      const saved = await this.work.submissions.save(tx, {
        ...record, attempts, lastError, state: attempts >= 3 ? 'DEAD_LETTER' : 'PENDING',
        leaseUntil: undefined, nextAttemptAt: attempts >= 3 ? undefined : nextAttemptAt, updatedAt: now.toISOString(),
      }, { state: record.state, leaseUntil: record.leaseUntil });
      if (saved && attempts >= 3) await this.createLetter(tx, record, attempts, lastError);
    });
  }

  private async createLetter(tx: Transaction, record: SubmissionRecord, attempts: number, lastError: string) {
    await this.letters.create(tx, {
      adapterId: record.adapterId, adapterVersion: record.adapterVersion, operation: 'GET_STATUS',
      idempotencyKey: record.idempotencyKey, attempts, lastError,
      payload: { kind: 'SUBMISSION_STATUS', reconciliationId: record.id },
    });
  }

  private async releaseUnavailable(tenantId: string, record: SubmissionRecord) {
    const now = this.context.runtime.clock.now();
    await this.context.uow.run(tenantId, (tx) => this.work.submissions.save(tx, {
      ...record, state: 'PENDING', leaseUntil: undefined, lastError: 'adapter_version_unavailable',
      nextAttemptAt: new Date(now.getTime() + integrationPolicy.submissionLeaseMs).toISOString(), updatedAt: now.toISOString(),
    }, { state: record.state, leaseUntil: record.leaseUntil }));
    this.context.runtime.logger.warn('integration.adapter.unavailable', 'Historical adapter unavailable', {
      adapterId: record.adapterId, adapterVersion: record.adapterVersion, code: 'adapter_version_unavailable',
    });
    throw new BusinessRuleError('adapter_version_unavailable', 'Historical adapter unavailable');
  }
}
