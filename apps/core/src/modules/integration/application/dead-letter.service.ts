import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError, DomainError, NotFoundError, ValidationError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { PERMISSION_POLICY } from '../../../kernel/tokens';
import { hasPermission, PermissionPolicy } from '../../../kernel/tenancy/permissions';
import { CallOutcome } from '../domain/outcome';
import { PolicyStatusResult, CanonicalQuoteRequest, PaymentLinkRequest } from '../domain/canonical';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { DeadLetter, ReplayPayload, SubmissionRecord, GatewaySubmissionResult } from './ports';
import { IntegrationContext } from './integration-context';
import { IntegrationResources, IntegrationWork } from './integration-resources';
import { IntegrationExecutor } from './integration-executor';
import { IntegrationRouting } from './integration-routing';
import { DeadLetterWriter } from './dead-letter-writer';
import * as validation from './canonical-validation';
class PayloadExpiredError extends DomainError {
  readonly httpStatus = 410;
  constructor() {
    super('integration_payload_expired', 'Integration payload expired');
  }
}
@Injectable()
export class DeadLetterService {
  constructor(
    private readonly context: IntegrationContext,
    private readonly resources: IntegrationResources,
    private readonly work: IntegrationWork,
    private readonly executor: IntegrationExecutor,
    private readonly routing: IntegrationRouting,
    private readonly writer: DeadLetterWriter,
    @Inject(PERMISSION_POLICY) private readonly permissions: PermissionPolicy,
  ) {}
  list(principal: Principal, query: {
    status?: DeadLetter['status'];
    cursor?: string;
    limit: number;
  }) {
    return this.context.uow.run(principal.tenantId, (tx) => this.work.letters.list(tx, query));
  }
  async detail(principal: Principal, id: string) {
    return this.context.uow.run(principal.tenantId, async (tx) => {
      const entry = await this.require(tx, id);
      const stored = await this.work.payloads.get(tx, entry.payloadRef);
      const payloadExpired = !stored || Date.parse(stored.expiresAt) <= this.context.runtime.clock.now().getTime();
      const canRead = hasPermission(this.permissions.permissionsFor(principal.roles), 'integration.write');
      if (payloadExpired || !stored || !canRead)
        return {
          entry,
          payloadExpired
        };
      const payload: unknown = JSON.parse(await this.context.runtime.cipher.decrypt(tx.tenantId, stored.payloadEnc));
      await this.context.audit.append(tx, {
        action: 'integration.payload.accessed',
        entityType: 'DeadLetter',
        entityId: id
      });
      return {
        entry,
        payload,
        payloadExpired
      };
    });
  }
  async discard(principal: Principal, id: string, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 500)
      throw new ValidationError('discard_reason_required', 'Discard reason must be 1 to 500 characters');
    await this.context.uow.run(principal.tenantId, async (tx) => {
      const entry = await this.require(tx, id);
      this.requireOpen(entry);
      await this.work.letters.save(tx, {
        ...entry,
        status: 'DISCARDED',
        discardReason: trimmed
      });
      await this.context.audit.append(tx, {
        action: 'integration.dead_letter.discarded',
        entityType: 'DeadLetter',
        entityId: id
      });
    });
    return {
      id,
      status: 'DISCARDED' as const
    };
  }
  async replay(principal: Principal, id: string) {
    const reserved = await this.prepare(principal, id);
    const execution = await this.attempt(principal, reserved.entry, reserved.payload);
    return this.context.uow.run(principal.tenantId, async (tx) => {
      await this.work.letters.save(tx, {
        ...reserved.entry,
        status: 'REPLAYED'
      });
      if (execution.outcome.kind === 'success' && execution.record) {
        await this.completeStatus(tx, execution.record, execution.outcome.value as PolicyStatusResult);
      }
      const replacement = execution.outcome.kind === 'success' ? undefined : await this.writer.create(tx, {
        ...reserved.entry,
        replayedFromId: id,
        payload: reserved.payload,
        attempts: 1,
        lastError: execution.outcome.kind === 'failure' ? execution.outcome.code : 'outcome_unknown',
      });
      await this.context.audit.append(tx, {
        action: 'integration.dead_letter.replayed',
        entityType: 'DeadLetter',
        entityId: id
      });
      return {
        id,
        status: 'REPLAYED' as const,
        result: execution.outcome.kind === 'success' ? 'SUCCEEDED' as const : 'FAILED' as const,
        replacementId: replacement?.id
      };
    });
  }
  private async prepare(principal: Principal, id: string) {
    return this.context.uow.run(principal.tenantId, async (tx) => {
      const entry = await this.require(tx, id);
      this.requireOpen(entry);
      this.routing.bound(entry.adapterId, entry.adapterVersion);
      const certification = await this.resources.certifications.get(tx, entry.adapterId, entry.adapterVersion);
      if (certification?.status !== 'PASSED')
        throw new BusinessRuleError('adapter_not_certified', 'Adapter is not certified');
      const stored = await this.work.payloads.get(tx, entry.payloadRef);
      if (!stored || Date.parse(stored.expiresAt) <= this.context.runtime.clock.now().getTime())
        throw new PayloadExpiredError();
      const payload = JSON.parse(await this.context.runtime.cipher.decrypt(tx.tenantId, stored.payloadEnc)) as ReplayPayload;
      return {
        entry,
        payload
      };
    });
  }
  private async attempt(principal: Principal, entry: DeadLetter, payload: ReplayPayload): Promise<{
    outcome: CallOutcome<unknown>;
    record?: SubmissionRecord;
  }> {
    const adapter = this.routing.bound(entry.adapterId, entry.adapterVersion);
    if (payload.kind === 'SUBMISSION_STATUS') {
      const record = await this.context.uow.run(principal.tenantId, (tx) => this.work.submissions.getByKey(tx, entry.idempotencyKey));
      if (!record || record.id !== payload.reconciliationId)
        throw new NotFoundError('integrationSubmission');
      const call = await this.executor.run({
        tenantId: principal.tenantId,
        adapter,
        operation: 'GET_STATUS',
        route: this.routing.spec(entry.adapterId, entry.adapterVersion, record.statusRequest, 'GET_STATUS')?.route === 'FILE' ? 'FILE' : 'API',
        key: entry.idempotencyKey,
        timeoutMs: this.routing.timeout(entry.adapterId, entry.adapterVersion, record.statusRequest, 'GET_STATUS'),
        invoke: async (ctx) => {
          if (!adapter.getStatus)
            return this.unavailable();
          const outcome = validation.validateOutcome(validation.statusOutput, await adapter.getStatus(ctx, {
            idempotencyKey: entry.idempotencyKey,
            insurerRef: record.statusRequest.insurerRef
          }));
          if (outcome.kind === 'success' && outcome.value.status === 'ISSUED' && /^[a-z][a-z0-9+.-]*:/i.test(outcome.value.documentRef)) {
            return validation.validateUrl(outcome, outcome.value.documentRef, record.statusRequest.insurerId, this.resources.allowlist);
          }
          return outcome;
        },
      }, false);
      return {
        outcome: call.outcome,
        record
      };
    }
    return this.outboundAttempt(principal, entry, payload);
  }
  private async outboundAttempt(principal: Principal, entry: DeadLetter, payload: Extract<ReplayPayload, {
    kind: 'OUTBOUND';
  }>) {
    const adapter = this.routing.bound(entry.adapterId, entry.adapterVersion);
    const route = this.routing.spec(entry.adapterId, entry.adapterVersion, payload.input, payload.operation)?.route;
    const call = await this.executor.run({
      tenantId: principal.tenantId,
      adapter,
      operation: payload.operation,
      route: route === 'FILE' ? 'FILE' : 'API',
      key: entry.idempotencyKey,
      timeoutMs: this.routing.timeout(entry.adapterId, entry.adapterVersion, payload.input, payload.operation),
      invoke: async (ctx): Promise<CallOutcome<unknown>> => {
        if (payload.operation === 'QUOTE' && adapter.quote) {
          return validation.validateDocumentLinks(validation.validateOutcome(validation.quoteOutput,
            await adapter.quote(ctx, payload.input as CanonicalQuoteRequest)), payload.input.insurerId, this.resources.allowlist);
        }
        if (payload.operation === 'PAYMENT_LINK' && adapter.paymentLink) {
          const outcome = validation.validateOutcome(validation.paymentOutput, await adapter.paymentLink(ctx, payload.input as PaymentLinkRequest));
          return outcome.kind === 'success' ? validation.validateUrl(outcome, outcome.value.url, payload.input.insurerId, this.resources.allowlist) : outcome;
        }
        return this.unavailable();
      },
    }, false);
    return {
      outcome: call.outcome
    };
  }
  private async completeStatus(tx: Transaction, record: SubmissionRecord, status: PolicyStatusResult) {
    const result: GatewaySubmissionResult = {
      kind: 'RECONCILED',
      route: this.routing.spec(record.adapterId, record.adapterVersion, record.statusRequest, 'GET_STATUS')?.route === 'FILE' ? 'FILE' : 'API',
      adapterId: record.adapterId,
      adapterVersion: record.adapterVersion,
      reconciliationId: record.id,
      status,
    };
    const saved = await this.work.submissions.save(tx, {
      ...record,
      state: 'COMPLETED',
      outcome: 'success',
      resultKind: 'RECONCILED',
      leaseUntil: undefined,
      nextAttemptAt: undefined,
      updatedAt: this.context.runtime.clock.now().toISOString(),
      resultEnc: await this.context.runtime.cipher.encrypt(tx.tenantId, JSON.stringify(result)),
    }, {
      state: record.state,
      leaseUntil: record.leaseUntil
    });
    if (saved)
      await this.context.recorder.record(tx, {
        event: {
          type: 'integration.submission.reconciled',
          subject: record.id,
          data: {
            reconciliationId: record.id,
            adapterId: record.adapterId,
            adapterVersion: record.adapterVersion,
            idempotencyKey: record.idempotencyKey,
            status: status.status,
          }
        },
        audit: {
          action: 'integration.submission.reconciled',
          entityType: 'Submission',
          entityId: record.id
        },
      });
  }
  private async require(tx: Transaction, id: string) {
    const entry = await this.work.letters.get(tx, id);
    if (!entry)
      throw new NotFoundError('deadLetter');
    return entry;
  }
  private requireOpen(entry: DeadLetter) {
    if (entry.status !== 'OPEN')
      throw new ConflictError('dead_letter_closed', 'Dead letter is closed');
  }
  private unavailable(): CallOutcome<never> {
    return {
      kind: 'failure',
      retryable: false,
      code: 'dependency_unavailable',
      message: 'Integration unavailable'
    };
  }
}
