import { Controller, Get, Header, Inject } from '@nestjs/common';
import { Public } from '../tenancy/decorators';
import { METRICS } from '../tokens';
import { MetricsRegistry } from './metrics';

/** Prometheus scrape endpoint; network-restricted in infrastructure, excluded from request logging/metrics. */
@Controller('metrics')
export class MetricsController {
  constructor(@Inject(METRICS) private readonly metrics: MetricsRegistry) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  render(): string {
    return this.metrics.render();
  }
}
