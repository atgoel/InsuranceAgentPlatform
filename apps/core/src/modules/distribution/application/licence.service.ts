import { Inject, Injectable } from '@nestjs/common';
import { METRICS } from '../../../kernel/tokens';
import { MetricsRegistry } from '../../../kernel/observability/metrics';
import { Licence, LicenceKind, createLicence, daysUntil, dueThreshold } from '../domain/licence';
import { LICENCE_REPOSITORY, LicenceRepository, MEMBER_REPOSITORY, MemberRepository } from './ports';
import { DistributionContext } from './distribution-context';
import { MemberService } from './member.service';

export interface LicenceInput { kind: LicenceKind; number: string; validFrom: string; validTo: string }

/** Licence and certificate validity (F86). */
@Injectable()
export class LicenceService {
  constructor(
    @Inject(LICENCE_REPOSITORY) private readonly licences: LicenceRepository,
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    private readonly memberService: MemberService,
    private readonly ctx: DistributionContext,
  ) {}

  record(tenantId: string, memberId: string, input: LicenceInput): Promise<Licence> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      await this.memberService.require(tx, memberId);
      const licence = createLicence({ ...input, memberId, id: this.ctx.ids.next('lic') });
      await this.licences.save(tx, licence);
      await this.ctx.recorder.record(tx, {
        event: { type: 'distribution.licence.recorded', subject: licence.id, data: { memberId, kind: licence.kind, validTo: licence.validTo } },
        audit: { action: 'distribution.licence.record', entityType: 'licence', entityId: licence.id },
      });
      return licence;
    });
  }

  listForMember(tenantId: string, memberId: string): Promise<Licence[]> {
    return this.ctx.uow.run(tenantId, (tx) => this.licences.listForMember(tx, memberId));
  }

  expiring(tenantId: string, withinDays: number) {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const today = this.ctx.clock.now();
      const soon = (await this.licences.all(tx)).filter((l) => daysUntil(l.validTo, today) <= withinDays);
      const items = await Promise.all(soon.map(async (l) => ({ ...l, memberName: (await this.members.get(tx, l.memberId))?.props.displayName ?? '', daysLeft: daysUntil(l.validTo, today) })));
      return { items: items.sort((a, b) => a.daysLeft - b.daysLeft) };
    });
  }
}

/** Daily job: alerts once per 60/30/7-day threshold per licence (AC-M02-08). */
@Injectable()
export class LicenceExpiryScanner {
  constructor(
    @Inject(LICENCE_REPOSITORY) private readonly licences: LicenceRepository,
    @Inject(METRICS) private readonly metrics: MetricsRegistry,
    private readonly ctx: DistributionContext,
  ) {}

  run(tenantId: string): Promise<{ alerted: number }> {
    return this.ctx.uow.run(tenantId, async (tx) => {
      const today = this.ctx.clock.now();
      let alerted = 0;
      for (const licence of await this.licences.all(tx)) {
        const threshold = dueThreshold(licence, today, await this.licences.alertedThresholds(tx, licence.id));
        if (threshold === undefined) continue;
        await this.licences.recordAlert(tx, licence.id, threshold);
        await this.ctx.recorder.record(tx, {
          event: { type: 'distribution.licence.expiring', subject: licence.id, data: { memberId: licence.memberId, licenceId: licence.id, kind: licence.kind, daysLeft: daysUntil(licence.validTo, today), threshold } },
          audit: { action: 'distribution.licence.expiry_alert', entityType: 'licence', entityId: licence.id, metadata: { threshold } },
        });
        this.metrics.gauge('distribution_licences_expiring', 'Licences crossing an expiry threshold in the last scan', ['threshold']).inc({ threshold: String(threshold) });
        alerted += 1;
      }
      return { alerted };
    });
  }
}
