import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ID_GENERATOR, UNIT_OF_WORK } from '../../../kernel/tokens';
import { Clock } from '../../../kernel/domain/clock';
import { IdGenerator } from '../../../kernel/domain/id-generator';
import { UnitOfWork } from '../../../kernel/persistence/unit-of-work';
import { NotFoundError, PreconditionFailedError } from '../../../kernel/errors/domain-errors';
import { Principal } from '../../../kernel/tenancy/principal';
import {
  CustomFieldDefinition, CustomFieldEntity, DefineCustomFieldInput, ReviseCustomFieldInput, defineCustomField, reviseCustomField,
} from '../../../kernel/custom-fields';
import { PlanCatalogue } from '../domain/plan';
import { CUSTOM_FIELD_REPOSITORY, CustomFieldRepository, PLAN_CATALOGUE } from './ports';
import { TenancyRecorder } from './tenancy-recorder';
import { TenantQueryService } from './tenant-query.service';

/** Custom field definitions of the tenant (CR-001, M01 §3.9). Domain rules live in the kernel. */
@Injectable()
export class CustomFieldService {
  constructor(
    @Inject(CUSTOM_FIELD_REPOSITORY) private readonly repo: CustomFieldRepository,
    @Inject(PLAN_CATALOGUE) private readonly plans: PlanCatalogue,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly tenants: TenantQueryService,
    private readonly recorder: TenancyRecorder,
  ) {}

  async list(p: Principal, entity?: CustomFieldEntity): Promise<{ items: CustomFieldDefinition[]; usage: { active: number; limit: number } }> {
    const limit = await this.limitOf(p.tenantId);
    return this.uow.run(p.tenantId, async (tx) => {
      const all = await this.repo.list(tx);
      return { items: entity ? all.filter((d) => d.entity === entity) : all, usage: { active: all.filter((d) => d.active).length, limit } };
    });
  }

  async define(p: Principal, input: DefineCustomFieldInput): Promise<CustomFieldDefinition> {
    const limit = await this.limitOf(p.tenantId);
    return this.uow.run(p.tenantId, async (tx) => {
      const def = defineCustomField(input, await this.repo.list(tx), limit, this.ids.next('cfd'), this.clock.now());
      await this.repo.insert(tx, def);
      await this.recorder.record(tx, {
        event: { type: 'tenant.custom_field.defined', subject: def.id, data: { id: def.id, entity: def.entity, key: def.key, piiClass: def.piiClass } },
        audit: { action: 'tenant.custom_field.defined', entityType: 'custom_field_definition', entityId: def.id, metadata: { entity: def.entity, key: def.key, piiClass: def.piiClass } },
      });
      return def;
    });
  }

  async revise(p: Principal, id: string, patch: ReviseCustomFieldInput, expectedVersion: number): Promise<CustomFieldDefinition> {
    const limit = await this.limitOf(p.tenantId);
    return this.uow.run(p.tenantId, async (tx) => {
      const current = await this.repo.get(tx, id);
      if (!current) throw new NotFoundError('CustomFieldDefinition', id);
      if (current.version !== expectedVersion) throw new PreconditionFailedError();
      const next = reviseCustomField(current, patch, await this.repo.list(tx), limit, this.clock.now());
      await this.repo.update(tx, next, expectedVersion);
      await this.recorder.record(tx, {
        event: { type: 'tenant.custom_field.revised', subject: id, data: { id, version: next.version, active: next.active } },
        audit: { action: 'tenant.custom_field.revised', entityType: 'custom_field_definition', entityId: id, metadata: { version: next.version, active: next.active } },
      });
      return next;
    });
  }

  private async limitOf(tenantId: string): Promise<number> {
    return this.plans.get((await this.tenants.require(tenantId)).props.planCode).limits.customFields;
  }
}
