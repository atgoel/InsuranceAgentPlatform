import { ValidationError, BusinessRuleError, NotFoundError } from '../../../kernel/errors/domain-errors';
import { OrgTree, OrgUnit } from './org-unit';

/**
 * AC-M02-01: OrgTree enforces a single HEAD_OFFICE root, valid parent kinds and no cycles;
 * subtreeIds and ancestors are correct.
 */
describe('AC-M02-01 OrgTree aggregate', () => {
  describe('construction', () => {
    it('creates a tree with a single HEAD_OFFICE root', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      const tree = createOrgTree([root]);

      expect(tree).toBeDefined();
      const fetched = tree.get('ou_root');
      expect(fetched.id).toBe('ou_root');
      expect(fetched.kind).toBe('HEAD_OFFICE');
    });

    it('rejects tree with no HEAD_OFFICE root', () => {
      expect(() => {
        createOrgTree([
          { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Branch 1', parentId: 'ou_root', territoryCodes: [] },
        ]);
      }).toThrow(ValidationError);
    });

    it('rejects tree with multiple HEAD_OFFICE roots', () => {
      expect(() => {
        createOrgTree([
          { id: 'ou_root1', kind: 'HEAD_OFFICE' as const, name: 'Root 1', parentId: undefined, territoryCodes: [] },
          { id: 'ou_root2', kind: 'HEAD_OFFICE' as const, name: 'Root 2', parentId: undefined, territoryCodes: [] },
        ]);
      }).toThrow(ValidationError);
    });
  });

  describe('add', () => {
    it('allows REGION as child of HEAD_OFFICE', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);

      const region = { id: 'ou_reg1', kind: 'REGION' as const, name: 'North', parentId: 'ou_root', territoryCodes: ['001', '002'] };
      tree = tree.add(region);

      expect(tree.get('ou_reg1').parentId).toBe('ou_root');
    });

    it('allows BRANCH as child of HEAD_OFFICE', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);

      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };
      tree = tree.add(branch);

      expect(tree.get('ou_br1').parentId).toBe('ou_root');
    });

    it('allows BRANCH as child of REGION', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const region = { id: 'ou_reg1', kind: 'REGION' as const, name: 'North', parentId: 'ou_root', territoryCodes: [] };
      tree = tree.add(region);

      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_reg1', territoryCodes: [] };
      tree = tree.add(branch);

      expect(tree.get('ou_br1').parentId).toBe('ou_reg1');
    });

    it('allows TEAM as child of BRANCH', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };
      tree = tree.add(branch);

      const team = { id: 'ou_tm1', kind: 'TEAM' as const, name: 'Team A', parentId: 'ou_br1', territoryCodes: [] };
      tree = tree.add(team);

      expect(tree.get('ou_tm1').parentId).toBe('ou_br1');
    });

    it('rejects REGION as child of BRANCH (invalid parent kind)', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };
      tree = tree.add(branch);

      expect(() => {
        tree.add({ id: 'ou_reg1', kind: 'REGION' as const, name: 'North', parentId: 'ou_br1', territoryCodes: [] });
      }).toThrow(BusinessRuleError);
    });

    it('rejects TEAM as child of HEAD_OFFICE (invalid parent kind)', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      const tree = createOrgTree([root]);

      expect(() => {
        tree.add({ id: 'ou_tm1', kind: 'TEAM' as const, name: 'Team', parentId: 'ou_root', territoryCodes: [] });
      }).toThrow(BusinessRuleError);
    });

    it('rejects add when parent does not exist', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      const tree = createOrgTree([root]);

      expect(() => {
        tree.add({ id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_nonexist', territoryCodes: [] });
      }).toThrow(BusinessRuleError);
    });
  });

  describe('move', () => {
    it('moves a BRANCH from one parent to another under same root', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const region1 = { id: 'ou_reg1', kind: 'REGION' as const, name: 'North', parentId: 'ou_root', territoryCodes: [] };
      const region2 = { id: 'ou_reg2', kind: 'REGION' as const, name: 'South', parentId: 'ou_root', territoryCodes: [] };
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_reg1', territoryCodes: [] };

      tree = tree.add(region1).add(region2).add(branch);
      tree = tree.move('ou_br1', 'ou_reg2');

      expect(tree.get('ou_br1').parentId).toBe('ou_reg2');
    });

    it('rejects move to invalid parent kind', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };
      const team = { id: 'ou_tm1', kind: 'TEAM' as const, name: 'Team', parentId: 'ou_br1', territoryCodes: [] };

      tree = tree.add(branch).add(team);

      expect(() => {
        tree.move('ou_tm1', 'ou_root');
      }).toThrow(BusinessRuleError);
    });

    it('rejects move under own descendant (cycle)', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };
      const team = { id: 'ou_tm1', kind: 'TEAM' as const, name: 'Team', parentId: 'ou_br1', territoryCodes: [] };

      tree = tree.add(branch).add(team);

      expect(() => {
        tree.move('ou_br1', 'ou_tm1');
      }).toThrow(BusinessRuleError);
    });
  });

  describe('subtreeIds', () => {
    it('returns unitId and all descendants depth-first', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };
      const team1 = { id: 'ou_tm1', kind: 'TEAM' as const, name: 'Team1', parentId: 'ou_br1', territoryCodes: [] };
      const team2 = { id: 'ou_tm2', kind: 'TEAM' as const, name: 'Team2', parentId: 'ou_br1', territoryCodes: [] };

      tree = tree.add(branch).add(team1).add(team2);

      const ids = tree.subtreeIds('ou_br1');
      expect(ids).toContain('ou_br1');
      expect(ids).toContain('ou_tm1');
      expect(ids).toContain('ou_tm2');
      expect(ids[0]).toBe('ou_br1');
    });

    it('returns single unit when leaf', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };

      tree = tree.add(branch);

      const ids = tree.subtreeIds('ou_br1');
      expect(ids).toEqual(['ou_br1']);
    });
  });

  describe('ancestors', () => {
    it('returns ancestors nearest first', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };
      const team = { id: 'ou_tm1', kind: 'TEAM' as const, name: 'Team', parentId: 'ou_br1', territoryCodes: [] };

      tree = tree.add(branch).add(team);

      const ancestors = tree.ancestors('ou_tm1');
      expect(ancestors.length).toBe(2);
      expect(ancestors[0].id).toBe('ou_br1');
      expect(ancestors[1].id).toBe('ou_root');
    });

    it('returns empty for root', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      const tree = createOrgTree([root]);

      const ancestors = tree.ancestors('ou_root');
      expect(ancestors).toEqual([]);
    });
  });

  describe('get', () => {
    it('returns unit by id', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };

      tree = tree.add(branch);

      expect(tree.get('ou_br1').name).toBe('Delhi');
    });

    it('throws NotFoundError for unknown id', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      const tree = createOrgTree([root]);

      expect(() => {
        tree.get('ou_unknown');
      }).toThrow(NotFoundError);
    });
  });

  describe('toNested', () => {
    it('returns hierarchy with children', () => {
      const root = { id: 'ou_root', kind: 'HEAD_OFFICE' as const, name: 'ACME', parentId: undefined, territoryCodes: [] };
      let tree = createOrgTree([root]);
      const branch = { id: 'ou_br1', kind: 'BRANCH' as const, name: 'Delhi', parentId: 'ou_root', territoryCodes: [] };
      const team = { id: 'ou_tm1', kind: 'TEAM' as const, name: 'Team', parentId: 'ou_br1', territoryCodes: [] };

      tree = tree.add(branch).add(team);

      const nested = tree.toNested();
      expect(nested).toHaveLength(1);
      expect(nested[0].id).toBe('ou_root');
      expect(nested[0].children).toHaveLength(1);
      expect(nested[0].children?.[0].id).toBe('ou_br1');
      expect(nested[0].children?.[0].children).toHaveLength(1);
    });
  });
});

// Helper stub - will be implemented
function createOrgTree(units: OrgUnit[]) {
  return new OrgTree(units);
}
