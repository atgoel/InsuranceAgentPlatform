import { Inject, Injectable } from '@nestjs/common';
import { Principal } from '../../../kernel/tenancy/principal';
import { addDays, istDate } from '../../../kernel/domain/ist';
import { DueEngine } from '../domain/due-engine';
import { LIFE_GRACE } from '../domain/premium-schedule';
import { HeldPolicyProps } from '../domain/held-policy';
import { HELD_POLICY_REPOSITORY, HeldPolicyRepository, Transaction } from './ports';
import { BookContext } from './book-context';
import { BookScope } from './book-scope';
export interface DueItem {
  policyId: string;
  holderName: string;
  productName: string;
  line: string;
  source: string;
  asOf: string;
  confidence: string;
  dueDate: string;
  status: string;
  amountPaise: number;
  graceEndsOn?: string;
}
@Injectable()
export class DueService {
  readonly engine = new DueEngine(LIFE_GRACE);
  constructor(
    @Inject(HELD_POLICY_REPOSITORY)
    readonly policies: HeldPolicyRepository,
    readonly ctx: BookContext,
    readonly scope: BookScope,
  ) {}
  async item(tx: Transaction, p: Readonly<HeldPolicyProps>, dueDate: string, status: string): Promise<DueItem> {
    return {
      policyId: p.id,
      holderName: (await this.scope.parties.summary(tx, p.proposerPartyId))?.displayName ?? 'Customer',
      productName: p.productName,
      line: p.line,
      source: p.source,
      asOf: p.asOf,
      confidence: p.confidence,
      dueDate,
      status,
      amountPaise: p.premiumPaise,
      graceEndsOn: this.engine.classifyInstallment(p, dueDate, istDate(this.ctx.clock.now())).graceEndsOn,
    };
  }
  calendar(p: Principal, from: string, to: string) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      const policies = await this.policies.dueBetween(tx, from, to, await this.scope.scopes.resolve(tx, p));
      const rows = this.engine.window(
        policies.map((policy) => policy.props),
        from,
        to,
      );
      const today = istDate(this.ctx.clock.now());
      const days = new Map<string, DueItem[]>();
      for (const row of rows) {
        const policy = policies.find((policy) => policy.props.id === row.policyId);
        if (!policy) continue;
        const status = this.engine.classifyInstallment(policy.props, row.dueDate, today).status;
        const item = await this.item(tx, policy.props, row.dueDate, status);
        days.set(row.dueDate, [...(days.get(row.dueDate) ?? []), item]);
      }
      this.ctx.metrics.counter('book_dues_computed_total', 'Dues computed').inc({}, rows.length);
      return { days: [...days].sort(([a], [b]) => a.localeCompare(b)).map(([date, dues]) => ({ date, dues })) };
    });
  }
  today(p: Principal) {
    return this.ctx.uow.run(p.tenantId, async (tx) => {
      const today = istDate(this.ctx.clock.now());
      const policies = await this.policies.dueBetween(tx, addDays(today, -30), addDays(today, 7), await this.scope.scopes.resolve(tx, p));
      const result: {
        dueToday: DueItem[];
        inGrace: DueItem[];
        lapsingSoon: DueItem[];
      } = { dueToday: [], inGrace: [], lapsingSoon: [] };
      for (const policy of policies) {
        const due = this.engine.classify(policy.props, today);
        if (!due.dueDate) continue;
        const item = await this.item(tx, policy.props, due.dueDate, due.status);
        if (due.dueDate === today && ['DUE_TODAY', 'RENEWAL_DUE'].includes(due.status)) result.dueToday.push(item);
        if (due.status === 'IN_GRACE') {
          result.inGrace.push(item);
          if (due.graceEndsOn && due.graceEndsOn <= addDays(today, 7)) result.lapsingSoon.push(item);
        }
      }
      this.ctx.metrics.counter('book_dues_computed_total', 'Dues computed').inc({}, result.dueToday.length + result.inGrace.length);
      return result;
    });
  }
}
