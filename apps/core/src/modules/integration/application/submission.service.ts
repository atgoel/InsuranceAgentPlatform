import { Injectable } from '@nestjs/common';
import { integrationPolicy } from '../domain/integration-policy';
import { canonicalJson, sha256Hex } from '../../../kernel/domain/canonical-json';
import { ConflictError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import { CanonicalProposal } from '../domain/canonical';
import { GatewaySubmissionResult, SubmissionRecord } from './ports';
import { IntegrationContext } from './integration-context';
import { IntegrationWork } from './integration-resources';
import { IntegrationRouting } from './integration-routing';
import { IntegrationExecutor } from './integration-executor';
import { submissionOutput, validateOutcome } from './canonical-validation';
@Injectable()
export class SubmissionService {
  constructor(
    private readonly context: IntegrationContext,
    private readonly work: IntegrationWork,
    private readonly routing: IntegrationRouting,
    private readonly executor: IntegrationExecutor
  ) { }
  async submit(principal: Principal, input: CanonicalProposal, key: string): Promise<GatewaySubmissionResult> {
    const hash = sha256Hex(canonicalJson(input));
    const previous = await this.context.uow.run(principal.tenantId, (tx) => this.work.submissions.getByKey(tx, key));
    if (previous)
      return this.replay(principal.tenantId, previous, hash);
    const selected = await this.routing.select(principal.tenantId, input, 'SUBMIT_PROPOSAL');
    if (selected.route === 'ASSISTED')
      return {
        kind: 'DIRECT',
        route: 'ASSISTED',
        adapterId: 'assisted',
        adapterVersion: '1.0.0',
        reason: 'assisted_fallback',
        outcome: {
          kind: 'unknown',
          reason: 'assisted'
        },
        instructions: {
          kind: 'INSURER_PORTAL',
          evidenceRequired: true
        },
      };
    const record = await this.intent(principal, input, key, hash, selected);
    if (!record.created)
      return this.replay(principal.tenantId, record.record, hash);
    return this.send(principal, input, record.record, selected.route);
  }
  private async intent(principal: Principal, input: CanonicalProposal, key: string, hash: string, selected: {
    adapterId: string;
    adapterVersion: string;
  }) {
    const { runtime } = this.context;
    const now = runtime.clock.now();
    const record: SubmissionRecord = {
      id: runtime.ids.next('isub'),
      adapterId: selected.adapterId,
      adapterVersion: selected.adapterVersion,
      idempotencyKey: key,
      inputHash: hash,
      proposalEnc: await runtime.cipher.encrypt(principal.tenantId, JSON.stringify(input)),
      statusRequest: {
        schemaVersion: 'v1',
        insurerId: input.insurerId,
        line: input.line
      },
      state: 'SENDING',
      attempts: 0,
      leaseUntil: new Date(now.getTime() + integrationPolicy.submissionLeaseMs).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    return this.context.uow.run(principal.tenantId, (tx) => this.work.submissions.reserve(tx, record));
  }
  private async send(principal: Principal, input: CanonicalProposal, record: SubmissionRecord, route: 'API' | 'FILE') {
    const adapter = this.routing.bound(record.adapterId, record.adapterVersion);
    const execution = await this.executor.run({
      tenantId: principal.tenantId,
      adapter,
      operation: 'SUBMIT_PROPOSAL',
      route,
      key: record.idempotencyKey,
      timeoutMs: this.routing.timeout(record.adapterId, record.adapterVersion, input, 'SUBMIT_PROPOSAL'),
      invoke: async (ctx) => {
        if (!adapter.submitProposal)
          return {
            kind: 'failure',
            retryable: false,
            code: 'dependency_unavailable',
            message: 'Integration unavailable'
          };
        return validateOutcome(submissionOutput, await adapter.submitProposal(ctx, input));
      },
    });
    const result: GatewaySubmissionResult = {
      kind: 'DIRECT',
      route,
      adapterId: record.adapterId,
      adapterVersion: record.adapterVersion,
      reason: route === 'API' ? 'api_available' : 'file_available',
      outcome: execution.outcome,
      reconciliationId: execution.outcome.kind === 'unknown' ? record.id : undefined,
    };
    const saved = await this.finish(principal.tenantId, record, result);
    return saved ? result : this.unknown(record, route);
  }
  private async finish(tenantId: string, record: SubmissionRecord, result: Extract<GatewaySubmissionResult, {
    kind: 'DIRECT';
  }>) {
    const now = this.context.runtime.clock.now().toISOString();
    const pending = result.outcome.kind === 'unknown';
    const updated: SubmissionRecord = {
      ...record,
      state: pending ? 'PENDING' : 'COMPLETED',
      updatedAt: now,
      leaseUntil: undefined,
      nextAttemptAt: pending ? now : undefined,
      outcome: result.outcome.kind === 'unknown' ? undefined : result.outcome.kind,
      resultKind: pending ? undefined : 'DIRECT',
      resultEnc: pending ? undefined : await this.context.runtime.cipher.encrypt(tenantId, JSON.stringify(result)),
    };
    return this.context.uow.run(tenantId, (tx) => this.work.submissions.save(tx, updated, {
      state: 'SENDING',
      leaseUntil: record.leaseUntil
    }));
  }
  private async replay(tenantId: string, record: SubmissionRecord, hash: string): Promise<GatewaySubmissionResult> {
    if (record.inputHash !== hash)
      throw new ConflictError('idempotency_key_reuse', 'Idempotency key already used for different input');
    if (record.state === 'COMPLETED' && record.resultEnc) {
      return JSON.parse(await this.context.runtime.cipher.decrypt(tenantId, record.resultEnc)) as GatewaySubmissionResult;
    }
    const spec = this.routing.spec(record.adapterId, record.adapterVersion, record.statusRequest, 'SUBMIT_PROPOSAL');
    return this.unknown(record, spec?.route === 'FILE' ? 'FILE' : 'API');
  }
  private unknown(record: SubmissionRecord, route: 'API' | 'FILE'): GatewaySubmissionResult {
    return {
      kind: 'DIRECT',
      route,
      adapterId: record.adapterId,
      adapterVersion: record.adapterVersion,
      reason: route === 'API' ? 'api_available' : 'file_available',
      outcome: {
        kind: 'unknown',
        reason: 'timeout'
      },
      reconciliationId: record.id,
    };
  }
}
