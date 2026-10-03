import { Inject, Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { KERNEL_OPTIONS, LOGGER, OUTBOX_RELAY } from '../tokens';
import { KernelConfig } from '../config';
import { Logger } from '../observability/logger';
import { OutboxRelay } from './outbox-relay';

const INTERVAL_MS = 1000;

/**
 * Drains the outbox to in-process subscribers on a fixed interval (at-least-once; consumers dedupe via the Inbox).
 * Off in the test environment, where tests call `relayOnce()` on OUTBOX_RELAY to deliver deterministically.
 */
@Injectable()
export class OutboxRelayScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(OUTBOX_RELAY) private readonly relay: OutboxRelay,
    @Inject(KERNEL_OPTIONS) private readonly config: KernelConfig,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.env === 'test') return;
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; skipped while the previous pass is still running so batches never overlap. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.relay.relayOnce();
    } catch (error) {
      this.logger.error('outbox.relay.failed', 'Outbox relay pass failed', error);
    } finally {
      this.running = false;
    }
  }
}
