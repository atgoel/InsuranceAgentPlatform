import { ValidationError, BusinessRuleError, NotFoundError } from '../../../kernel/errors/domain-errors';

export type OrgUnitKind = 'HEAD_OFFICE' | 'REGION' | 'BRANCH' | 'TEAM';

export interface OrgUnit {
  id: string;
  parentId?: string;
  kind: OrgUnitKind;
  name: string;
  territoryCodes: string[];
}

export interface OrgUnitNode extends OrgUnit {
  children?: OrgUnitNode[];
}

export class OrgTree {
  private readonly unitMap: Map<string, OrgUnit>;
  private readonly childrenMap: Map<string, string[]>;
  private readonly rootId: string;

  constructor(units: OrgUnit[]) {
    const headOffices = units.filter(u => u.kind === 'HEAD_OFFICE');

    if (headOffices.length === 0) {
      throw new ValidationError('org_tree_root_invalid', 'Org tree must have exactly one HEAD_OFFICE root');
    }
    if (headOffices.length > 1) {
      throw new ValidationError('org_tree_root_invalid', 'Org tree must have exactly one HEAD_OFFICE root');
    }

    this.rootId = headOffices[0].id;
    this.unitMap = new Map();
    this.childrenMap = new Map();

    for (const unit of units) {
      this.unitMap.set(unit.id, unit);
      if (unit.parentId) {
        if (!this.childrenMap.has(unit.parentId)) {
          this.childrenMap.set(unit.parentId, []);
        }
        this.childrenMap.get(unit.parentId)!.push(unit.id);
      }
    }
  }

  add(unit: OrgUnit): OrgTree {
    const parent = this.unitMap.get(unit.parentId!);
    if (!parent) {
      throw new BusinessRuleError('org_unit_parent_invalid', 'Parent unit does not exist');
    }

    if (!this.isValidParentKind(unit.kind, parent.kind)) {
      throw new BusinessRuleError('org_unit_parent_invalid', `Cannot add ${unit.kind} under ${parent.kind}`);
    }

    const newUnits = Array.from(this.unitMap.values());
    newUnits.push(unit);

    return new OrgTree(newUnits);
  }

  move(unitId: string, newParentId: string): OrgTree {
    const unit = this.unitMap.get(unitId);
    if (!unit) {
      throw new NotFoundError('org_unit', unitId);
    }

    const newParent = this.unitMap.get(newParentId);
    if (!newParent) {
      throw new BusinessRuleError('org_unit_parent_invalid', 'New parent unit does not exist');
    }

    if (!this.isValidParentKind(unit.kind, newParent.kind)) {
      throw new BusinessRuleError('org_unit_parent_invalid', `Cannot move ${unit.kind} under ${newParent.kind}`);
    }

    if (this.isDescendant(newParentId, unitId)) {
      throw new BusinessRuleError('org_unit_cycle', 'Cannot move unit under its own descendant');
    }

    const newUnits = Array.from(this.unitMap.values()).map(u =>
      u.id === unitId ? { ...u, parentId: newParentId } : u
    );

    return new OrgTree(newUnits);
  }

  subtreeIds(unitId: string): string[] {
    const result: string[] = [unitId];
    const queue: string[] = [unitId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const children = this.childrenMap.get(currentId) || [];
      result.push(...children);
      queue.push(...children);
    }

    return result;
  }

  ancestors(unitId: string): OrgUnit[] {
    const result: OrgUnit[] = [];
    let current = this.unitMap.get(unitId);

    while (current && current.parentId) {
      current = this.unitMap.get(current.parentId);
      if (current) {
        result.push(current);
      }
    }

    return result;
  }

  get(unitId: string): OrgUnit {
    const unit = this.unitMap.get(unitId);
    if (!unit) {
      throw new NotFoundError('org_unit', unitId);
    }
    return unit;
  }

  toNested(): OrgUnitNode[] {
    const root = this.unitMap.get(this.rootId)!;
    return [this.buildNested(root)];
  }

  private buildNested(unit: OrgUnit): OrgUnitNode {
    const children = (this.childrenMap.get(unit.id) || [])
      .map(childId => this.buildNested(this.unitMap.get(childId)!));

    return {
      ...unit,
      children: children.length > 0 ? children : undefined,
    };
  }

  private isValidParentKind(childKind: OrgUnitKind, parentKind: OrgUnitKind): boolean {
    const validParents: Record<OrgUnitKind, OrgUnitKind[]> = {
      REGION: ['HEAD_OFFICE'],
      BRANCH: ['HEAD_OFFICE', 'REGION'],
      TEAM: ['BRANCH'],
      HEAD_OFFICE: [],
    };

    return validParents[childKind].includes(parentKind);
  }

  private isDescendant(potentialAncestorId: string, potentialDescendantId: string): boolean {
    const descendants = this.subtreeIds(potentialDescendantId);
    return descendants.includes(potentialAncestorId);
  }
}
