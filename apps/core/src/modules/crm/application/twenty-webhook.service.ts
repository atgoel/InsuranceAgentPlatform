import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { INBOX } from '../../../kernel/tokens';
import { Inbox } from '../../../kernel/outbox/inbox';
import { UnauthenticatedError, ValidationError } from '../../../kernel/errors/domain-errors';
import { TASK_REPOSITORY, TaskRepository, Transaction } from './ports';
import { TwentyOwnerChange } from './twenty-owner-change';
import { CRM_SYNC_STATE_REPOSITORY, CrmSyncStateRepository, TWENTY_WORKSPACE_DIRECTORY, TwentyWorkspaceDirectory } from './twenty-sync.ports';
import { enqueueSync } from './crm-port';
import { CrmContext } from './crm-context';

const CONSUMER = 'crm.twenty-webhook';
const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const CORE_OWNED_PERSON_FIELDS = ['name', 'phone', 'email'] as const;

export const TwentyWebhookSchema = z.object({
  id: z.string().min(1).max(100),
  object: z.enum(['person', 'lead', 'opportunity', 'task']),
  updatedAt: z.string().datetime(),
  record: z.object({
    coreId: z.string().min(1).max(64),
    ownerCoreMemberId: z.string().min(1).max(64).optional(),
    status: z.enum(['OPEN', 'DONE']).optional(),
    name: z.string().max(200).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().max(200).optional(),
  }),
});
export type TwentyWebhookEvent = z.infer<typeof TwentyWebhookSchema>;

export type WebhookOutcome = 'applied' | 'unchanged' | 'stale' | 'ineligible_owner' | 'unknown_record' | 'change_request' | 'duplicate';

/**
 * Inbound Twenty webhooks (M04b): signature over `<timestamp>.<raw body>` with the workspace secret, 5-minute replay
 * window, event-id dedup, and field ownership — Twenty owns owner and task status (applied when the Core record is not
 * newer); Core owns person name and contacts (a change request, then the Core values are projected back).
 */
@Injectable()
export class TwentyWebhookService {
  constructor(
    @Inject(TWENTY_WORKSPACE_DIRECTORY) private readonly workspaces: TwentyWorkspaceDirectory,
    @Inject(INBOX) private readonly inbox: Inbox,
    @Inject(CRM_SYNC_STATE_REPOSITORY) private readonly sync: CrmSyncStateRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    private readonly owners: TwentyOwnerChange,
    private readonly ctx: CrmContext,
  ) {}

  async receive(workspaceId: string, rawBody: Buffer | undefined, signature: string | undefined, timestamp: string | undefined): Promise<{ outcome: WebhookOutcome }> {
    const workspace = await this.workspaces.byWorkspace(workspaceId);
    if (!workspace || !rawBody || !signature || !this.validSignature(workspace.webhookSecret, timestamp ?? '', rawBody, signature)) {
      this.reject('security.twenty_webhook_invalid_signature', workspaceId, 'invalid_signature');
    }
    if (!this.fresh(timestamp)) this.reject('security.twenty_webhook_stale', workspaceId, 'stale_webhook');
    const event = parse(rawBody);
    const tenantId = workspace.ref.tenantId;
    let outcome: WebhookOutcome = 'duplicate';
    await this.inbox.processOnce(CONSUMER, `${workspaceId}:${event.id}`, async () => {
      outcome = await this.ctx.uow.run(tenantId, (tx) => this.apply(tx, event));
    });
    this.ctx.metrics.counter('crm_twenty_webhooks_total', 'Inbound Twenty webhook events', ['object', 'outcome']).inc({ object: event.object, outcome });
    return { outcome };
  }

  private async apply(tx: Transaction, e: TwentyWebhookEvent): Promise<WebhookOutcome> {
    if (e.object === 'person') return this.personChangeRequest(tx, e);
    if (e.object === 'task') return this.applyTaskStatus(tx, e);
    return this.owners.apply(tx, e);
  }

  /** Twenty owns task status: DONE completes an open Core task. */
  private async applyTaskStatus(tx: Transaction, e: TwentyWebhookEvent): Promise<WebhookOutcome> {
    const task = await this.tasks.get(tx, e.record.coreId);
    if (!task) return 'unknown_record';
    if (e.record.status !== 'DONE' || task.props.status !== 'OPEN') return 'unchanged';
    if (e.updatedAt < task.props.createdAt) return 'stale';
    task.complete('Completed in Twenty', this.ctx.clock.now());
    await this.tasks.save(tx, task);
    await this.audit(tx, 'crm.task.completed_in_twenty', 'task', task.props.id, {});
    return 'applied';
  }

  /** Core owns person name and contacts: record a change request (field names only) and project Core values back. */
  private async personChangeRequest(tx: Transaction, e: TwentyWebhookEvent): Promise<WebhookOutcome> {
    const fields = CORE_OWNED_PERSON_FIELDS.filter((f) => e.record[f] !== undefined);
    if (fields.length === 0) return 'unchanged';
    await this.ctx.recorder.record(tx, {
      event: { type: 'crm.change_request.created', subject: e.record.coreId, data: { partyId: e.record.coreId, fields, source: 'twenty' } },
      audit: { action: 'crm.change_request.created', entityType: 'party', entityId: e.record.coreId, metadata: { fields, source: 'twenty' } },
    });
    await enqueueSync(this.ctx, this.sync, tx, 'person', e.record.coreId);
    return 'change_request';
  }

  private audit(tx: Transaction, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>): Promise<void> {
    return this.ctx.recorder.record(tx, { audit: { action, entityType, entityId, metadata: { ...metadata, source: 'twenty' } } });
  }

  private validSignature(secret: string, timestamp: string, rawBody: Buffer, signature: string): boolean {
    const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex'));
    const given = Buffer.from(signature);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private fresh(timestamp: string | undefined): boolean {
    const sent = Number(timestamp) * 1000;
    return Number.isFinite(sent) && Math.abs(this.ctx.clock.now().getTime() - sent) <= REPLAY_WINDOW_MS;
  }

  private reject(event: string, workspaceId: string, code: string): never {
    this.ctx.logger.security(event, 'Twenty webhook rejected', { workspaceId, code });
    throw new UnauthenticatedError(code, 'Webhook rejected');
  }
}

function parse(rawBody: Buffer): TwentyWebhookEvent {
  let json: unknown;
  try {
    json = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new ValidationError('invalid_json', 'Body is not JSON');
  }
  const result = TwentyWebhookSchema.safeParse(json);
  if (!result.success) throw new ValidationError('invalid_webhook', 'Unrecognised webhook payload');
  return result.data;
}
