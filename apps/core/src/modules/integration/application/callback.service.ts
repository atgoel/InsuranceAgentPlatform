import { Injectable } from '@nestjs/common';
import { integrationPolicy } from '../domain/integration-policy';
import { DomainError, UnauthenticatedError, ValidationError, NotFoundError, ConflictError } from '../../../kernel/errors/domain-errors';
import { createHash } from 'crypto';
import { HmacCallbackVerifier } from '../domain/callback-verifier';
import { CanonicalCallback } from './ports';
import { IntegrationContext } from './integration-context';
import { IntegrationResources, IntegrationWork } from './integration-resources';
import { callbackInput, validateUrl } from './canonical-validation';
import { Transaction } from '../../../kernel/persistence/unit-of-work';
import { SubmissionRecord } from './ports';
class CallbackSizeError extends DomainError {
  readonly httpStatus = 413;
  constructor() {
    super('callback_too_large', 'Callback exceeds size limit');
  }
}
@Injectable()
export class CallbackService {
  constructor(
    private readonly context: IntegrationContext,
    private readonly resources: IntegrationResources,
    private readonly work: IntegrationWork
  ) { }
  async accept(input: {
    tenantId?: string;
    adapterId: string;
    rawBody: Buffer;
    signatureHeader?: string;
    timestampHeader?: string;
  }) {
    if (input.rawBody.length > integrationPolicy.callbackMaxBytes)
      throw new CallbackSizeError();
    await this.verify(input);
    if (!input.tenantId)
      throw new UnauthenticatedError('callback_signature_invalid', 'Invalid callback signature');
    const tenantId = input.tenantId;
    const callback = this.parse(input.rawBody);
    const now = this.context.runtime.clock.now();
    if (Date.parse(callback.occurredAt) > now.getTime() + 300000)
      throw new ValidationError('callback_schema_invalid', 'Invalid callback event time');
    return this.context.uow.run(tenantId, async (tx) => {
      const submission = await this.work.submissions.getByKey(tx, callback.idempotencyKey);
      if (!submission || submission.adapterId !== input.adapterId)
        throw new NotFoundError('integrationSubmission');
      this.validateDocument(callback, submission);
      return this.persist(tx, { callback, submission, rawBody: input.rawBody, now });
    });
  }

  private validateDocument(callback: CanonicalCallback, submission: SubmissionRecord) {
    if (callback.status.status !== 'ISSUED' || !/^[a-z][a-z0-9+.-]*:/i.test(callback.status.documentRef)) return;
    const allowed = validateUrl({ kind: 'success', value: callback.status }, callback.status.documentRef,
      submission.statusRequest.insurerId, this.resources.allowlist);
    if (allowed.kind === 'failure') throw new ValidationError('callback_schema_invalid', 'Invalid callback document URL');
  }

  private async persist(tx: Transaction, input: { callback: CanonicalCallback; submission: SubmissionRecord; rawBody: Buffer; now: Date }) {
      const { callback, submission } = input;
      const result = await this.work.callbacks.accept(tx, await this.storageInput(tx.tenantId, input));
      if (result.kind === 'CONFLICT')
        throw new ConflictError('callback_event_conflict', 'Callback event conflicts with stored event');
      if (result.kind === 'STALE')
        throw new ConflictError('callback_stale', 'Callback transition is stale');
      if (result.kind === 'DUPLICATE')
        return {
          status: 'duplicate' as const
        };
      await this.context.recorder.record(tx, {
        event: {
          type: 'integration.callback.received',
          subject: result.callbackId,
          data: {
            callbackId: result.callbackId,
            adapterId: submission.adapterId,
            adapterVersion: submission.adapterVersion,
            kind: callback.kind,
            idempotencyKey: callback.idempotencyKey,
          }
        },
        audit: {
          action: 'integration.callback.accepted',
          entityType: 'Callback',
          entityId: result.callbackId
        },
      });
      return {
        status: 'accepted' as const
      };
  }

  private async storageInput(tenantId: string, input: { callback: CanonicalCallback; submission: SubmissionRecord; rawBody: Buffer; now: Date }) {
    return {
      callbackId: this.context.runtime.ids.next('icb'),
      adapterId: input.submission.adapterId,
      adapterVersion: input.submission.adapterVersion,
      eventId: input.callback.eventId,
      idempotencyKey: input.callback.idempotencyKey,
      occurredAt: input.callback.occurredAt,
      rawBodyHash: createHash('sha256').update(input.rawBody).digest('hex'),
      rawPayloadEnc: await this.context.runtime.cipher.encrypt(tenantId, input.rawBody.toString('utf8')),
      canonicalPayloadEnc: await this.context.runtime.cipher.encrypt(tenantId, JSON.stringify(input.callback)),
      receivedAt: input.now.toISOString(),
      expiresAt: new Date(input.now.getTime() + integrationPolicy.payloadRetentionMs).toISOString(),
    };
  }
  private async verify(input: {
    tenantId?: string;
    adapterId: string;
    rawBody: Buffer;
    signatureHeader?: string;
    timestampHeader?: string;
  }) {
    try {
      if (!Buffer.from(input.rawBody.toString('utf8'), 'utf8').equals(input.rawBody)) throw new Error('Invalid UTF-8');
      if (!input.tenantId)
        throw new Error('Missing binding');
      const credentials = await this.resources.vault.resolve(input.tenantId, input.adapterId);
      const secret = credentials.callbackSecret;
      if (!secret)
        throw new Error('Missing binding');
      new HmacCallbackVerifier().verify({
        rawBody: input.rawBody.toString('utf8'),
        signatureHeader: input.signatureHeader ?? '',
        timestampHeader: input.timestampHeader ?? '',
        secret,
        now: this.context.runtime.clock.now(),
      });
    }
    catch {
      this.context.runtime.logger.security('security.callback_rejected', 'Callback verification rejected', {
        adapterId: input.adapterId
      });
      throw new UnauthenticatedError('callback_signature_invalid', 'Invalid callback signature');
    }
  }
  private parse(rawBody: Buffer): CanonicalCallback {
    try {
      return callbackInput.parse(JSON.parse(rawBody.toString('utf8'))) as CanonicalCallback;
    }
    catch {
      throw new ValidationError('callback_schema_invalid', 'Invalid callback schema');
    }
  }
}
