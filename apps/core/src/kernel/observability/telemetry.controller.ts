import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../tenancy/decorators';
import { ERROR_DEDUPLICATOR, LOGGER, METRICS } from '../tokens';
import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { Logger } from './logger';
import { MetricsRegistry } from './metrics';
import { ErrorDeduplicator } from './error-deduplicator';

const ClientError = z
  .object({ kind: z.literal('error'), fingerprint: z.string().min(1).max(64), message: z.string().max(500).optional(), route: z.string().max(200).optional(), release: z.string().max(40).optional() })
  .strict();
const ClientVital = z
  .object({ kind: z.literal('vital'), name: z.enum(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']), value: z.number().nonnegative(), route: z.string().max(200).optional(), release: z.string().max(40).optional() })
  .strict();
const TelemetryBody = z.object({ events: z.array(z.discriminatedUnion('kind', [ClientError, ClientVital])).min(1).max(20) }).strict();
type TelemetryBody = z.infer<typeof TelemetryBody>;

/** Client errors and web vitals from the web apps (spec 02 §7). Errors are deduplicated by fingerprint. */
@Controller('api/v1/telemetry')
export class TelemetryController {
  constructor(
    @Inject(LOGGER) private readonly logger: Logger,
    @Inject(METRICS) private readonly metrics: MetricsRegistry,
    @Inject(ERROR_DEDUPLICATOR) private readonly dedup: ErrorDeduplicator,
  ) {}

  @Post('client-errors')
  @Public()
  @HttpCode(202)
  ingest(@Body(new ZodValidationPipe(TelemetryBody)) body: TelemetryBody): { accepted: number } {
    for (const event of body.events) {
      if (event.kind === 'vital') {
        this.metrics.histogram('web_vital', 'Web vitals reported by clients', ['name'], [50, 100, 200, 500, 1000, 2500, 4000]).observe(event.value, { name: event.name });
      } else if (this.dedup.admit(`client:${event.fingerprint}`).log) {
        // msg stays static; client text goes through ctx so the redactor scrubs it (02 §3).
        this.logger.warn('client.error', 'Client error reported', { fingerprint: event.fingerprint, message: event.message, route: event.route, release: event.release });
      } else {
        this.metrics.counter('client_errors_suppressed_total', 'Duplicate client errors not logged').inc();
      }
    }
    return { accepted: body.events.length };
  }
}
