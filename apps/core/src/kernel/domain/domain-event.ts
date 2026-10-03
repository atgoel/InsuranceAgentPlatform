import { Clock } from './clock';
import { IdGenerator } from './id-generator';
import { RequestContext } from '../observability/request-context';
import { ValidationError } from '../errors/domain-errors';

export interface DomainEvent<T = Record<string, unknown>> {
  id: string;
  specVersion: '1.0';
  type: string;
  source: string;
  subject: string;
  tenantId: string;
  occurredAt: string;
  dataVersion: number;
  traceId?: string;
  data: T;
}

export class DomainEventFactory {
  constructor(private clock: Clock, private ids: IdGenerator) {}

  create<T>(input: {
    type: string;
    source: string;
    subject: string;
    tenantId: string;
    data: T;
    dataVersion?: number;
  }): DomainEvent<T> {
    // Validate type: /^[a-z]+(\.[a-z_]+){2}$/
    if (!/^[a-z]+(\.[a-z_]+){2}$/.test(input.type)) {
      throw new ValidationError('invalid_event_type', 'Event type must match /^[a-z]+(\\.[a-z_]+){2}$/');
    }

    const context = RequestContext.current();

    return Object.freeze({
      id: this.ids.next('evt'),
      specVersion: '1.0',
      type: input.type,
      source: input.source,
      subject: input.subject,
      tenantId: input.tenantId,
      occurredAt: this.clock.now().toISOString(),
      dataVersion: input.dataVersion ?? 1,
      traceId: context?.traceId,
      data: input.data,
    });
  }
}
