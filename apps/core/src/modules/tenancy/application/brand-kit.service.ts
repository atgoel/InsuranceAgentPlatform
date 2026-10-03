import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../kernel/tokens';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { BrandKit, BrandKitProps, contrastRatio } from '../domain/brand-kit';
import { PlanCatalogue } from '../domain/plan';
import { PLAN_CATALOGUE, TENANT_SETTINGS_REPOSITORY, TenantSettingsRepository } from './ports';
import { TenancyRecorder } from './tenancy-recorder';
import { TenantQueryService } from './tenant-query.service';

export type BrandKitView = BrandKitProps & { contrastRatio: number };

/** White-label brand kit within approved tokens (F95). */
@Injectable()
export class BrandKitService {
  constructor(
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly settings: TenantSettingsRepository,
    @Inject(PLAN_CATALOGUE) private readonly plans: PlanCatalogue,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly tenants: TenantQueryService,
    private readonly recorder: TenancyRecorder,
  ) {}

  get(tenantId: string): Promise<BrandKitView> {
    return this.uow.run(tenantId, async (tx) => view((await this.settings.getBrandKit(tx)) ?? BrandKit.platformDefault()));
  }

  async update(tenantId: string, props: BrandKitProps): Promise<BrandKitView> {
    const tenant = await this.tenants.require(tenantId);
    const kit = BrandKit.create(props, this.plans.get(tenant.props.planCode));
    return this.uow.run(tenantId, async (tx) => {
      await this.settings.saveBrandKit(tx, kit);
      await this.recorder.record(tx, {
        event: { type: 'tenant.brand_kit.updated', subject: tenantId, data: { typeface: props.typeface, poweredByVisible: props.poweredByVisible } },
        audit: { action: 'tenant.brand_kit.update', entityType: 'brand_kit', entityId: tenantId, after: props },
      });
      return view(kit);
    });
  }
}

function view(kit: BrandKit): BrandKitView {
  return { ...kit.props, contrastRatio: Math.round(contrastRatio(kit.props.primary, '#FFFFFF') * 100) / 100 };
}
