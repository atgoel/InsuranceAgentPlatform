import { Inject, Injectable } from '@nestjs/common';
import { UNIT_OF_WORK } from '../../../kernel/tokens';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';
import { LineOfBusiness, TieUp, TieUpLimitPolicy, TieUpSet } from '../domain/tie-up';
import { DistributorEntity } from '../domain/distributor-entity';
import { TENANT_SETTINGS_REPOSITORY, TIE_UP_LIMIT_POLICY, TenantSettingsRepository, TieUpReader } from './ports';
import { TenancyRecorder } from './tenancy-recorder';

const LINES: LineOfBusiness[] = ['LIFE', 'HEALTH', 'GENERAL'];

/** Insurer tie-ups per line; limits are data from TieUpLimitPolicy (Rev 3.0 §18). Also the M05 TieUpReader. */
@Injectable()
export class TieUpService implements TieUpReader {
  constructor(
    @Inject(TENANT_SETTINGS_REPOSITORY) private readonly settings: TenantSettingsRepository,
    @Inject(TIE_UP_LIMIT_POLICY) private readonly policy: TieUpLimitPolicy,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    private readonly recorder: TenancyRecorder,
  ) {}

  async get(tenantId: string, today: string) {
    return this.uow.run(tenantId, async (tx) => this.view(requireEntity(await this.settings.getEntity(tx)), await this.settings.getTieUps(tx), today));
  }

  async replace(tenantId: string, tieUps: TieUp[], today: string) {
    return this.uow.run(tenantId, async (tx) => {
      const entity = requireEntity(await this.settings.getEntity(tx));
      const set = new TieUpSet(tieUps);
      set.validate(entity.entityType, this.policy);
      await this.settings.replaceTieUps(tx, set);
      const lines = LINES.map((line) => ({ line, insurerIds: set.insurersFor(line, today) }));
      await this.recorder.record(tx, {
        event: { type: 'tenant.tie_up.updated', subject: tenantId, data: { lines } },
        audit: { action: 'tenant.tie_ups.replace', entityType: 'tenant', entityId: tenantId, metadata: { count: tieUps.length } },
      });
      return this.view(entity, set, today);
    });
  }

  activeInsurers(tenantId: string, line: LineOfBusiness, date: string): Promise<string[]> {
    return this.uow.run(tenantId, async (tx) => (await this.settings.getTieUps(tx)).insurersFor(line, date));
  }

  private view(entity: DistributorEntity, set: TieUpSet, today: string) {
    return {
      entityType: entity.entityType,
      comparisonScope: entity.comparisonScope(),
      lines: LINES.map((line) => ({ line, max: this.policy.maxFor(entity.entityType, line), active: set.activeOn(today, line) })),
    };
  }
}

function requireEntity(entity: DistributorEntity | undefined): DistributorEntity {
  if (!entity) throw new BusinessRuleError('distributor_entity_missing', 'The tenant has no distributor entity configured');
  return entity;
}
