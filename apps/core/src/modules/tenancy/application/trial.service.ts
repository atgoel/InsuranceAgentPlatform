import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { TENANT_DIRECTORY, TenantDirectory } from './ports';
import { TenancyRecorder } from './tenancy-recorder';
import { TenantQueryService } from './tenant-query.service';

const TRIAL_DAYS = 14;

/** Solo Pro trial (M19). Subscription billing itself is a provider integration (later). */
@Injectable()
export class TrialService {
  constructor(
    @Inject(TENANT_DIRECTORY) private readonly directory: TenantDirectory,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tenants: TenantQueryService,
    private readonly recorder: TenancyRecorder,
  ) {}

  async start(tenantId: string, planCode: 'SOLO_PRO') {
    const tenant = await this.tenants.require(tenantId);
    const endsAt = new Date(this.clock.now().getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    tenant.startTrial(planCode, endsAt);
    await this.directory.save(tenant);
    await this.uow.run(tenantId, (tx) =>
      this.recorder.record(tx, {
        event: { type: 'tenant.tenant.trial_started', subject: tenantId, data: { planCode, trialEndsAt: endsAt.toISOString() } },
        audit: { action: 'tenant.trial.start', entityType: 'tenant', entityId: tenantId },
      }),
    );
    return this.tenants.profile(tenantId);
  }
}
