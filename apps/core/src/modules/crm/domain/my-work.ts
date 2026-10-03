import type { Transaction } from '../../../kernel/persistence/unit-of-work';
import type { Logger } from '../../../kernel/observability/logger';

export interface MyWorkItem {
  kind: 'TASK' | 'HOT_LEAD' | 'SLA_AT_RISK' | 'DUE' | 'PROPOSAL' | 'BIRTHDAY';
  id: string;
  title: string;
  subtitle?: string;
  dueAt?: string;
  priority: number; // 0 = highest
  subject: { type: string; id: string };
  actions: Array<'CALL' | 'WHATSAPP' | 'LOG' | 'OPEN'>;
}

export interface MyWorkContributor {
  readonly name: string;
  contribute(tx: Transaction, memberId: string, at: Date): Promise<MyWorkItem[]>;
}

export class MyWorkComposer {
  constructor(
    private contributors: MyWorkContributor[],
    private logger?: Logger
  ) {}

  async compose(tx: Transaction, memberId: string, at: Date): Promise<MyWorkItem[]> {
    const allItems: MyWorkItem[] = [];

    for (const contributor of this.contributors) {
      try {
        const items = await contributor.contribute(tx, memberId, at);
        allItems.push(...items);
      } catch (error) {
        if (this.logger) {
          this.logger.warn('crm.my_work.contributor_failed', `Contributor ${contributor.name} failed`, { error: String(error) });
        }
        // Continue with next contributor despite failure (degraded mode)
      }
    }

    // Sort by priority (ascending) then by dueAt (ascending)
    allItems.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Items without dueAt come last
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;

      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    });

    return allItems;
  }
}
