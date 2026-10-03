import { Inject, Injectable } from '@nestjs/common';
import { LEAD_REPOSITORY, LeadRepository, OPPORTUNITY_REPOSITORY, OpportunityRepository, PARTY_FACADE, PartyFacade, TASK_REPOSITORY, TaskRepository, Transaction } from './ports';
import { SyncObject } from './twenty-sync.ports';
import { TwentyProjector } from './twenty-projector';
import { CrmContext } from './crm-context';

/** Loads the current Core record for a sync request and returns its minimised Twenty projection. */
@Injectable()
export class SyncRecordSource {
  constructor(
    @Inject(LEAD_REPOSITORY) private readonly leads: LeadRepository,
    @Inject(TASK_REPOSITORY) private readonly tasks: TaskRepository,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly opportunities: OpportunityRepository,
    @Inject(PARTY_FACADE) private readonly parties: PartyFacade,
    private readonly ctx: CrmContext,
  ) {}

  /** Loads and minimises one record; undefined when it no longer exists (nothing to sync). */
  async project(tx: Transaction, object: SyncObject, id: string): Promise<Record<string, unknown> | undefined> {
    if (object === 'lead') {
      const lead = await this.leads.get(tx, id);
      return lead && TwentyProjector.lead(lead.props);
    }
    if (object === 'task') {
      const task = await this.tasks.get(tx, id);
      return task && TwentyProjector.task(task.props);
    }
    if (object === 'opportunity') {
      const opportunity = await this.opportunities.get(tx, id);
      return opportunity && TwentyProjector.opportunity(opportunity.props);
    }
    const party = await this.parties.summary(tx, id);
    if (!party) return undefined;
    const contact = await this.parties.contactability(tx, id, 'CALL', 'SERVICE', this.ctx.clock.now());
    return TwentyProjector.person(party, contact.allowed);
  }

}
