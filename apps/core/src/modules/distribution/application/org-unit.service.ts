import { Inject, Injectable } from '@nestjs/common';
import { OrgUnit, OrgUnitKind, OrgUnitNode } from '../domain/org-unit';
import { MEMBER_REPOSITORY, MemberRepository, ORG_UNIT_REPOSITORY, OrgUnitRepository } from './ports';
import { DistributionContext } from './distribution-context';

export type OrgUnitView = Omit<OrgUnitNode, 'children'> & { memberCount: number; children: OrgUnitView[] };

/** Branch / team hierarchy (F33, F91) — Composite tree validated in the domain. */
@Injectable()
export class OrgUnitService {
  constructor(
    @Inject(ORG_UNIT_REPOSITORY) private readonly units: OrgUnitRepository,
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    private readonly ctx: DistributionContext,
  ) {}

  tree(tenantId: string): Promise<{ root: OrgUnitView }> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const [tree, counts] = await Promise.all([this.units.tree(tx), this.members.countByOrgUnit(tx)]);
      const [root] = tree.toNested().map((n) => withCounts(n, counts));
      return { root };
    });
  }

  create(tenantId: string, input: { parentId: string; kind: OrgUnitKind; name: string; territoryCodes?: string[] }): Promise<OrgUnit> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const unit: OrgUnit = { id: this.ctx.ids.next('ou'), parentId: input.parentId, kind: input.kind, name: input.name, territoryCodes: input.territoryCodes ?? [] };
      (await this.units.tree(tx)).add(unit); // validates parent kind
      await this.units.save(tx, unit);
      await this.recordChange(tx, unit, 'distribution.org_unit.create');
      return unit;
    });
  }

  move(tenantId: string, unitId: string, parentId: string): Promise<OrgUnit> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const moved = (await this.units.tree(tx)).move(unitId, parentId).get(unitId); // validates kind + cycles
      await this.units.save(tx, moved);
      await this.recordChange(tx, moved, 'distribution.org_unit.move');
      return moved;
    });
  }

  private recordChange(tx: Parameters<DistributionContext['recorder']['record']>[0], unit: OrgUnit, action: string): Promise<void> {
    return this.ctx.recorder.record(tx, {
      event: { type: 'distribution.org_unit.changed', subject: unit.id, data: { kind: unit.kind, parentId: unit.parentId ?? null } },
      audit: { action, entityType: 'org_unit', entityId: unit.id, after: unit },
    });
  }
}

function withCounts(node: OrgUnitNode, counts: Record<string, number>): OrgUnitView {
  return { ...node, memberCount: counts[node.id] ?? 0, children: (node.children ?? []).map((c) => withCounts(c, counts)) };
}
