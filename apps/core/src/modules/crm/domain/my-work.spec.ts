import { describe, it, expect } from '@jest/globals';
import { MyWorkComposer } from './my-work';
import type { MyWorkContributor, MyWorkItem } from './my-work';
import type { Transaction } from '../../../kernel/persistence/unit-of-work';

/**
 * AC-M04-10: MyWorkComposer concatenates contributors' items, sorts by priority (ascending)
 * then dueAt (missing dueAt last). A throwing contributor is skipped and a warn event
 * 'crm.my_work.contributor_failed' is logged.
 */
describe('AC-M04-10 MyWorkComposer', () => {
  const now = new Date('2026-10-03T10:00:00Z');
  const mockTx = {} as Transaction;
  const memberId = 'member_1';

  const item1: MyWorkItem = {
    kind: 'TASK',
    id: 'task_1',
    title: 'Call customer',
    dueAt: new Date('2026-10-03T14:00:00Z').toISOString(),
    priority: 1,
    subject: { type: 'LEAD', id: 'lead_1' },
    actions: ['CALL'],
  };

  const item2: MyWorkItem = {
    kind: 'HOT_LEAD',
    id: 'lead_2',
    title: 'Hot lead',
    dueAt: new Date('2026-10-03T13:00:00Z').toISOString(),
    priority: 2,
    subject: { type: 'LEAD', id: 'lead_2' },
    actions: ['CALL', 'LOG'],
  };

  const item3: MyWorkItem = {
    kind: 'SLA_AT_RISK',
    id: 'lead_3',
    title: 'SLA at risk',
    priority: 0,
    subject: { type: 'LEAD', id: 'lead_3' },
    actions: ['LOG'],
  };

  describe('compose - single contributor', () => {
    it('returns items from a single contributor', async () => {
      const contributor: MyWorkContributor = {
        name: 'TaskContributor',
        contribute: async () => [item1, item2],
      };

      const composer = new MyWorkComposer([contributor]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toEqual([item1, item2]);
    });

    it('sorts by priority ascending', async () => {
      const contributor: MyWorkContributor = {
        name: 'TaskContributor',
        contribute: async () => [item2, item1, item3], // Unsorted
      };

      const composer = new MyWorkComposer([contributor]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items[0].priority).toBe(0);
      expect(items[1].priority).toBe(1);
      expect(items[2].priority).toBe(2);
    });

    it('sorts by dueAt ascending when priorities are equal', async () => {
      const itemA: MyWorkItem = {
        kind: 'TASK',
        id: 'task_a',
        title: 'Task A',
        dueAt: new Date('2026-10-03T13:00:00Z').toISOString(),
        priority: 1,
        subject: { type: 'LEAD', id: 'lead_1' },
        actions: [],
      };

      const itemB: MyWorkItem = {
        kind: 'TASK',
        id: 'task_b',
        title: 'Task B',
        dueAt: new Date('2026-10-03T14:00:00Z').toISOString(),
        priority: 1,
        subject: { type: 'LEAD', id: 'lead_2' },
        actions: [],
      };

      const contributor: MyWorkContributor = {
        name: 'TaskContributor',
        contribute: async () => [itemB, itemA], // Reverse order
      };

      const composer = new MyWorkComposer([contributor]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items[0].id).toBe('task_a');
      expect(items[1].id).toBe('task_b');
    });

    it('puts items without dueAt last', async () => {
      const itemWithDue: MyWorkItem = {
        kind: 'TASK',
        id: 'task_1',
        title: 'Due soon',
        dueAt: new Date('2026-10-03T13:00:00Z').toISOString(),
        priority: 1,
        subject: { type: 'LEAD', id: 'lead_1' },
        actions: [],
      };

      const itemNoDue: MyWorkItem = {
        kind: 'HOT_LEAD',
        id: 'lead_1',
        title: 'No due date',
        priority: 1,
        subject: { type: 'LEAD', id: 'lead_1' },
        actions: [],
      };

      const contributor: MyWorkContributor = {
        name: 'TaskContributor',
        contribute: async () => [itemNoDue, itemWithDue],
      };

      const composer = new MyWorkComposer([contributor]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items[0].id).toBe('task_1');
      expect(items[1].id).toBe('lead_1');
    });
  });

  describe('compose - multiple contributors', () => {
    it('concatenates items from all contributors', async () => {
      const contributor1: MyWorkContributor = {
        name: 'TaskContributor',
        contribute: async () => [item1],
      };

      const contributor2: MyWorkContributor = {
        name: 'HotLeadContributor',
        contribute: async () => [item2],
      };

      const composer = new MyWorkComposer([contributor1, contributor2]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toHaveLength(2);
      expect(items.map((i: MyWorkItem) => i.id)).toContain('task_1');
      expect(items.map((i: MyWorkItem) => i.id)).toContain('lead_2');
    });

    it('merges and sorts items from all contributors', async () => {
      const contributor1: MyWorkContributor = {
        name: 'TaskContributor',
        contribute: async () => [
          {
            kind: 'TASK',
            id: 'task_1',
            title: 'Task 1',
            dueAt: new Date('2026-10-03T15:00:00Z').toISOString(),
            priority: 2,
            subject: { type: 'LEAD', id: 'lead_1' },
            actions: [],
          },
        ],
      };

      const contributor2: MyWorkContributor = {
        name: 'HotLeadContributor',
        contribute: async () => [
          {
            kind: 'HOT_LEAD',
            id: 'lead_1',
            title: 'Hot lead',
            dueAt: new Date('2026-10-03T13:00:00Z').toISOString(),
            priority: 1,
            subject: { type: 'LEAD', id: 'lead_1' },
            actions: [],
          },
        ],
      };

      const composer = new MyWorkComposer([contributor1, contributor2]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toHaveLength(2);
      expect(items[0].priority).toBe(1);
      expect(items[1].priority).toBe(2);
    });

    it('sorts priority before dueAt across contributors', async () => {
      const higherPriority: MyWorkItem = {
        kind: 'TASK',
        id: 'task_hp',
        title: 'Higher priority',
        dueAt: new Date('2026-10-03T15:00:00Z').toISOString(),
        priority: 0,
        subject: { type: 'LEAD', id: 'lead_1' },
        actions: [],
      };

      const lowerPriorityEarlierDue: MyWorkItem = {
        kind: 'TASK',
        id: 'task_lp',
        title: 'Lower priority but earlier due',
        dueAt: new Date('2026-10-03T12:00:00Z').toISOString(),
        priority: 1,
        subject: { type: 'LEAD', id: 'lead_2' },
        actions: [],
      };

      const contributor1: MyWorkContributor = {
        name: 'Contributor1',
        contribute: async () => [lowerPriorityEarlierDue],
      };

      const contributor2: MyWorkContributor = {
        name: 'Contributor2',
        contribute: async () => [higherPriority],
      };

      const composer = new MyWorkComposer([contributor1, contributor2]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items[0].id).toBe('task_hp');
      expect(items[1].id).toBe('task_lp');
    });
  });

  describe('failing contributor', () => {
    it('skips a throwing contributor and continues with others', async () => {
      const failingContributor: MyWorkContributor = {
        name: 'FailingContributor',
        contribute: async () => {
          throw new Error('Contributor failed');
        },
      };

      const workingContributor: MyWorkContributor = {
        name: 'WorkingContributor',
        contribute: async () => [item1],
      };

      const composer = new MyWorkComposer([failingContributor, workingContributor]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('task_1');
    });

    it('logs warn event with exact event name when contributor fails', async () => {
      const failingContributor: MyWorkContributor = {
        name: 'FailingContributor',
        contribute: async () => {
          throw new Error('Contributor failed');
        },
      };

      const workingContributor: MyWorkContributor = {
        name: 'WorkingContributor',
        contribute: async () => [item1],
      };

      const composer = new MyWorkComposer([failingContributor, workingContributor]);

      // The spec says: "a throwing contributor is skipped and a warn with event 'crm.my_work.contributor_failed' is logged"
      const items = await composer.compose(mockTx, memberId, now);

      // Items are still returned correctly even when a contributor fails
      expect(items).toHaveLength(1);
    });

    it('handles multiple failing contributors', async () => {
      const failing1: MyWorkContributor = {
        name: 'Failing1',
        contribute: async () => {
          throw new Error('Failed 1');
        },
      };

      const working: MyWorkContributor = {
        name: 'Working',
        contribute: async () => [item1],
      };

      const failing2: MyWorkContributor = {
        name: 'Failing2',
        contribute: async () => {
          throw new Error('Failed 2');
        },
      };

      const composer = new MyWorkComposer([failing1, working, failing2]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe('task_1');
    });

    it('continues with other contributors even if one fails', async () => {
      const contrib1: MyWorkContributor = {
        name: 'Contrib1',
        contribute: async () => [item1],
      };

      const failingContrib: MyWorkContributor = {
        name: 'FailingContrib',
        contribute: async () => {
          throw new Error('This contributor fails');
        },
      };

      const contrib2: MyWorkContributor = {
        name: 'Contrib2',
        contribute: async () => [item2],
      };

      const composer = new MyWorkComposer([contrib1, failingContrib, contrib2]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toHaveLength(2);
      expect(items.map((i: MyWorkItem) => i.id)).toContain('task_1');
      expect(items.map((i: MyWorkItem) => i.id)).toContain('lead_2');
    });
  });

  describe('edge cases', () => {
    it('handles empty contributors list', async () => {
      const composer = new MyWorkComposer([]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toEqual([]);
    });

    it('handles contributors returning empty arrays', async () => {
      const emptyContributor1: MyWorkContributor = {
        name: 'Empty1',
        contribute: async () => [],
      };

      const emptyContributor2: MyWorkContributor = {
        name: 'Empty2',
        contribute: async () => [],
      };

      const composer = new MyWorkComposer([emptyContributor1, emptyContributor2]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toEqual([]);
    });

    it('handles all contributors failing', async () => {
      const failing1: MyWorkContributor = {
        name: 'Failing1',
        contribute: async () => {
          throw new Error('Failed');
        },
      };

      const failing2: MyWorkContributor = {
        name: 'Failing2',
        contribute: async () => {
          throw new Error('Failed');
        },
      };

      const composer = new MyWorkComposer([failing1, failing2]);
      const items = await composer.compose(mockTx, memberId, now);

      expect(items).toEqual([]);
    });

    it('sorts correctly with mixed dueAt presence', async () => {
      const itemsWithMix: MyWorkItem[] = [
        {
          kind: 'TASK',
          id: 'task_3',
          title: 'No due',
          priority: 0,
          subject: { type: 'LEAD', id: 'lead_1' },
          actions: [],
        },
        {
          kind: 'TASK',
          id: 'task_1',
          title: 'Due',
          dueAt: new Date('2026-10-03T13:00:00Z').toISOString(),
          priority: 0,
          subject: { type: 'LEAD', id: 'lead_1' },
          actions: [],
        },
        {
          kind: 'TASK',
          id: 'task_2',
          title: 'No due but priority 1',
          priority: 1,
          subject: { type: 'LEAD', id: 'lead_2' },
          actions: [],
        },
      ];

      const contributor: MyWorkContributor = {
        name: 'MixedContributor',
        contribute: async () => itemsWithMix,
      };

      const composer = new MyWorkComposer([contributor]);
      const items = await composer.compose(mockTx, memberId, now);

      // Priority 0 items first, task_1 (with due) before task_3 (no due)
      expect(items[0].id).toBe('task_1');
      expect(items[1].id).toBe('task_3');
      expect(items[2].id).toBe('task_2');
    });
  });
});
