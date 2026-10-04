import { Inject, Injectable } from '@nestjs/common';
import { Principal } from '../../../kernel/tenancy/principal';
import { PreconditionFailedError, NotFoundError } from '../../../kernel/errors/domain-errors';
import { ServicingRequest, ServicingRequestProps } from '../domain/servicing';
import { HELD_POLICY_REPOSITORY, HeldPolicyRepository, SERVICING_REPOSITORY, ServicingRepository, Transaction } from './ports';
import { BookContext } from './book-context';
import { BookScope } from './book-scope';
export type ServicingInput = Pick<ServicingRequestProps, 'kind' | 'insurerRef' | 'followUpOn' | 'portalUrl'>;
@Injectable()
export class ServicingService {
  constructor(
    @Inject(SERVICING_REPOSITORY)
    readonly requests: ServicingRepository,
    @Inject(HELD_POLICY_REPOSITORY)
    private readonly policies: HeldPolicyRepository,
    private readonly scope: BookScope,
    private readonly ctx: BookContext,
  ) {}
  create(p: Principal, id: string, input: ServicingInput) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      await this.scope.policy(tx, p, await this.policies.get(tx, id), id);
      const request = ServicingRequest.create({ id: this.ctx.ids.next('srv'), heldPolicyId: id, ...input, now: this.ctx.clock.now() });
      await this.requests.save(tx, request);
      await this.audit(tx, request);
      return request.props;
    });
  }
  async scoped(tx: Transaction, p: Principal, id: string) {
    const request = await this.requests.get(tx, id);
    if (!request) throw new NotFoundError('servicing_request', id);
    await this.scope.policy(tx, p, await this.policies.get(tx, request.props.heldPolicyId), request.props.heldPolicyId);
    return request;
  }
  patch(
    p: Principal,
    id: string,
    input: Partial<Pick<ServicingRequestProps, 'status' | 'insurerRef' | 'followUpOn' | 'portalUrl'>>,
    version: number,
  ) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      const request = await this.scoped(tx, p, id);
      if (request.props.version !== version) throw new PreconditionFailedError();
      if (input.status) request.transition(input.status);
      request.update(input);
      await this.requests.save(tx, request);
      await this.audit(tx, request);
      return request.props;
    });
  }
  note(p: Principal, id: string, text: string) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      const request = await this.scoped(tx, p, id);
      request.addNote(text, p.memberId ?? p.userRef, this.ctx.clock.now());
      await this.requests.save(tx, request);
      await this.audit(tx, request);
      return request.props;
    });
  }
  list(p: Principal, followUpBefore?: string) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      const requests = followUpBefore ? await this.requests.openFollowUpsBefore(tx, followUpBefore) : await this.requests.all(tx);
      const visible = [];
      for (const request of requests) {
        try {
          await this.scope.policy(tx, p, await this.policies.get(tx, request.props.heldPolicyId), request.props.heldPolicyId);
          visible.push(request.props);
        } catch (error) {
          if (!(error instanceof NotFoundError)) throw error;
        }
      }
      return { items: visible.sort((a, b) => (a.followUpOn ?? '9999').localeCompare(b.followUpOn ?? '9999')) };
    });
  }
  async audit(tx: Transaction, request: ServicingRequest) {
    await this.ctx.recorder.record(tx, {
      audit: {
        action: 'book.servicing.changed',
        entityType: 'servicing_request',
        entityId: request.props.id,
        metadata: { status: request.props.status },
      },
    });
  }
}
