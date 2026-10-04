import { Inject, Injectable } from '@nestjs/common';
import { addDays, istDate } from '../../../kernel/domain/ist';
import { isPgTransaction } from '../../../kernel/persistence/unit-of-work';
import { CATALOGUE_QUERY, CatalogueQueryFacade } from '../../catalogue/application/ports';
import {
  LifecycleAlertEngine,
  LifecycleParty,
  MaturityRule,
  SurvivalBenefitRule,
  AnniversaryRule,
  FreeLookEndRule,
  AgeChangeRule,
  BirthdayRule,
} from '../domain/lifecycle-alerts';
import { HELD_POLICY_REPOSITORY, HeldPolicyRepository, ALERT_LEDGER, AlertLedger, Transaction } from './ports';
import { HeldPolicyProps, TERMINAL_STATUSES } from '../domain/held-policy';
import { BOOK_LIFECYCLE_ALERT } from '../domain/events';
import { BookContext } from './book-context';
import { BookScope } from './book-scope';
@Injectable()
export class LifecycleService {
  constructor(
    @Inject(HELD_POLICY_REPOSITORY)
    private readonly policies: HeldPolicyRepository,
    @Inject(ALERT_LEDGER)
    private readonly ledger: AlertLedger,
    @Inject(CATALOGUE_QUERY) private readonly catalogue: CatalogueQueryFacade,
    private readonly scope: BookScope,
    private readonly ctx: BookContext,
  ) {}
  run(tenantId: string) {
    return this.ctx.exclusive(`${tenantId}:lifecycle`, () => this.ctx.uow.run(tenantId, (tx) => this.runIn(tx)));
  }
  private async runIn(tx: Transaction) {
    if (isPgTransaction(tx)) await tx.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`${tx.tenantId}:lifecycle`]);
    const policies = (await this.policies.all(tx)).map((policy) => policy.props).filter((policy) => !TERMINAL_STATUSES.includes(policy.status));
    const resolved = await this.insuredPolicies(tx, policies);
    const engine = await this.engine(policies);
    const from = istDate(this.ctx.clock.now());
    const alerts = engine.alertsBetween(resolved.policies, resolved.parties, from, addDays(from, 30));
    const emitted = await this.ledger.emittedKeys(
      tx,
      alerts.map((alert) => alert.key),
    );
    const fresh = alerts.filter((alert) => !emitted.has(alert.key));
    await this.ledger.record(
      tx,
      fresh.map((alert) => alert.key),
    );
    for (const alert of fresh) {
      await this.ctx.recorder.record(tx, {
        event: {
          type: BOOK_LIFECYCLE_ALERT,
          subject: alert.policyId,
          data: { policyId: alert.policyId, kind: alert.kind, date: alert.date },
        },
        audit: { action: BOOK_LIFECYCLE_ALERT, entityType: 'held_policy', entityId: alert.policyId },
      });
      this.ctx.metrics.counter('book_lifecycle_alerts_total', 'Lifecycle alerts', ['kind']).inc({ kind: alert.kind });
    }
    this.ctx.logger.info('job.completed', 'Book lifecycle job completed', { job: 'book.lifecycle', count: fresh.length });
    return { emitted: fresh.length };
  }
  private async insuredPolicies(tx: Transaction, policies: readonly HeldPolicyProps[]) {
    const effective: HeldPolicyProps[] = [];
    const parties: LifecycleParty[] = [];
    for (const policy of policies) {
      const roles = await this.scope.parties.rolesForSubject(tx, 'HELD_POLICY', policy.id);
      const insured = roles.filter((role) => ['INSURED', 'LIFE_ASSURED'].includes(role.role));
      if (!insured.length) {
        effective.push({ ...policy });
        const summary = await this.scope.parties.summary(tx, policy.proposerPartyId);
        if (summary) parties.push(summary);
        continue;
      }
      for (const role of insured) {
        effective.push({ ...policy, proposerPartyId: role.partyId });
        const summary = await this.scope.parties.summary(tx, role.partyId);
        if (summary) parties.push(summary);
      }
    }
    return { policies: effective, parties };
  }
  private async engine(policies: readonly HeldPolicyProps[]) {
    const ids = policies.flatMap((policy) => (policy.productVersionId ? [policy.productVersionId] : []));
    const details = await this.catalogue.versionDetails(ids);
    const years = new Map(
      details.map((detail) => {
        const fact = detail.keyFacts?.find((fact) => fact.label === 'survivalBenefitYears');
        return [detail.versionId, fact ? this.survivalYears(fact.value) : []] as const;
      }),
    );
    const survival = new SurvivalBenefitRule((policy) => years.get(policy.productVersionId ?? '') ?? []);
    return new LifecycleAlertEngine([
      new MaturityRule(),
      survival,
      new AnniversaryRule(),
      new FreeLookEndRule(),
      new AgeChangeRule(),
      new BirthdayRule(),
    ]);
  }
  private survivalYears(value: string): number[] {
    const years = value
      .replace(/[[\]]/g, '')
      .split(',')
      .map((part) => Number(part.trim()));
    return years.every((year) => Number.isSafeInteger(year) && year > 0) ? years : [];
  }
}
