import type { LeadProps } from './lead';
import type { CallOutcome } from './activity';
import type { TaskProps, TaskKind, TaskSource } from './task';

export type TaskDraft = Omit<TaskProps, 'id' | 'status' | 'createdAt' | 'version' | 'completedAt' | 'escalatedAt'>;

export interface CadencePolicy {
  onLeadAssigned(lead: LeadProps, now: Date): TaskDraft[];
  onCallOutcome(lead: LeadProps, outcome: CallOutcome, now: Date, attemptsSoFar: number): TaskDraft[];
}

export class DefaultCadencePolicy implements CadencePolicy {
  onLeadAssigned(lead: LeadProps, now: Date): TaskDraft[] {
    if (!lead.ownerMemberId) return [];

    const dueAt = lead.slaDueAt ? new Date(lead.slaDueAt) : new Date(now.getTime() + 2 * 60 * 60 * 1000); // now + 2h

    return [
      {
        ownerMemberId: lead.ownerMemberId,
        subjectType: 'LEAD',
        subjectId: lead.id,
        kind: 'CALL' as TaskKind,
        title: `Call ${lead.partyId}`,
        dueAt: dueAt.toISOString(),
        source: 'CADENCE' as TaskSource,
      },
    ];
  }

  onCallOutcome(lead: LeadProps, outcome: CallOutcome, now: Date, attemptsSoFar: number): TaskDraft[] {
    if (!lead.ownerMemberId) return [];

    // NO_ANSWER and CALL_BACK: retry with schedule
    if (outcome === 'NO_ANSWER' || outcome === 'CALL_BACK') {
      if (attemptsSoFar === 1) {
        // First retry: +4h
        const dueAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);
        return [
          {
            ownerMemberId: lead.ownerMemberId,
            subjectType: 'LEAD',
            subjectId: lead.id,
            kind: 'CALL' as TaskKind,
            title: `Call ${lead.partyId}`,
            dueAt: dueAt.toISOString(),
            source: 'CADENCE' as TaskSource,
          },
        ];
      } else if (attemptsSoFar === 2) {
        // Second retry: next day 10:00 IST (04:30Z)
        const nextDay = new Date(now);
        nextDay.setDate(nextDay.getDate() + 1);
        // Set to 04:30 UTC which is 10:00 IST
        nextDay.setHours(4, 30, 0, 0);
        return [
          {
            ownerMemberId: lead.ownerMemberId,
            subjectType: 'LEAD',
            subjectId: lead.id,
            kind: 'CALL' as TaskKind,
            title: `Call ${lead.partyId}`,
            dueAt: nextDay.toISOString(),
            source: 'CADENCE' as TaskSource,
          },
        ];
      }
      // Attempt 3+: no more tasks
      return [];
    }

    // CONNECTED, WRONG_NUMBER, NOT_INTERESTED: no more tasks
    return [];
  }
}
