import { Inject, Injectable } from '@nestjs/common';
import { INBOX } from '../../../kernel/tokens';
import { Inbox } from '../../../kernel/outbox/inbox';
import { DomainEvent } from '../../../kernel/domain/domain-event';
import { CatalogueAdminService, PLATFORM_TENANT_ID } from './catalogue-admin.service';
import { CatalogueContext } from './catalogue-context';

const CONSUMER = 'catalogue.product-version-locker';

/** Locks a product version once it has been quoted (M06 `quote.option.created`); idempotent through the inbox. */
@Injectable()
export class ProductVersionLocker {
  constructor(
    @Inject(INBOX) private readonly inbox: Inbox,
    private readonly admin: CatalogueAdminService,
    private readonly ctx: CatalogueContext,
  ) {}

  onQuoteOptionCreated(event: DomainEvent<{ versionId?: string }>): Promise<boolean> {
    const versionId = event.data.versionId;
    return this.inbox.processOnce(CONSUMER, event.id, async () => {
      if (!versionId) return this.ctx.logger.warn('catalogue.lock.skipped', 'Quote option event without a version id', { eventId: event.id });
      await this.ctx.uow.run(PLATFORM_TENANT_ID, (tx) => this.admin.lock(tx, versionId));
    });
  }
}
