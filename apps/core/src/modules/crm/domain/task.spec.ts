import { describe, it, expect } from '@jest/globals';
import { Task } from './task';
import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M04-09: Task title 2..140 chars; complete/cancel only from OPEN;
 * reassign OPEN only; buckets computed in Asia/Kolkata (TODAY = same IST calendar day);
 * task due 23:00 IST "today" when now is 00:30 IST same day;
 * one due 18:45Z is next IST day; needsEscalation after 24h only once.
 */
describe('AC-M04-09 Task aggregate', () => {
  const now = new Date('2026-10-03T10:00:00Z');

  describe('Task.create', () => {
    it('creates a task with valid title 2..140 chars', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Follow up with customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      expect(task.props.id).toBe('task_1');
      expect(task.props.title).toBe('Follow up with customer');
      expect(task.props.status).toBe('OPEN');
      expect(task.props.createdAt).toBe(now.toISOString());
    });

    it('rejects title with less than 2 chars', () => {
      expect(() => {
        Task.create({
          id: 'task_1',
          ownerMemberId: 'member_1',
          subjectType: 'LEAD',
          subjectId: 'lead_1',
          kind: 'CALL',
          title: 'A',
          dueAt: new Date('2026-10-03T14:00:00Z'),
          source: 'MANUAL',
          now,
        });
      }).toThrow(ValidationError);
    });

    it('rejects title longer than 140 chars', () => {
      expect(() => {
        Task.create({
          id: 'task_1',
          ownerMemberId: 'member_1',
          subjectType: 'LEAD',
          subjectId: 'lead_1',
          kind: 'CALL',
          title: 'x'.repeat(141),
          dueAt: new Date('2026-10-03T14:00:00Z'),
          source: 'MANUAL',
          now,
        });
      }).toThrow(ValidationError);
    });

    it('accepts title exactly 2 chars', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Ab',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      expect(task.props.title).toBe('Ab');
    });

    it('accepts title exactly 140 chars', () => {
      const title = 'x'.repeat(140);
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title,
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      expect(task.props.title).toBe(title);
    });
  });

  describe('complete', () => {
    it('completes an OPEN task', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      const completeTime = new Date('2026-10-03T14:30:00Z');
      task.complete('Called successfully', completeTime);

      expect(task.props.status).toBe('DONE');
      expect(task.props.outcome).toBe('Called successfully');
      expect(task.props.completedAt).toBe(completeTime.toISOString());
    });

    it('rejects completing a DONE task', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.complete('Done', new Date('2026-10-03T14:30:00Z'));

      expect(() => {
        task.complete('Again', new Date('2026-10-03T15:00:00Z'));
      }).toThrow(BusinessRuleError);
    });

    it('rejects completing a CANCELLED task', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.cancel(new Date('2026-10-03T11:00:00Z'));

      expect(() => {
        task.complete('Done', new Date('2026-10-03T14:30:00Z'));
      }).toThrow(BusinessRuleError);
    });
  });

  describe('cancel', () => {
    it('cancels an OPEN task', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.cancel(new Date('2026-10-03T11:00:00Z'));

      expect(task.props.status).toBe('CANCELLED');
    });

    it('rejects cancelling a DONE task', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.complete('Done', new Date('2026-10-03T14:30:00Z'));

      expect(() => {
        task.cancel(new Date('2026-10-03T15:00:00Z'));
      }).toThrow(BusinessRuleError);
    });
  });

  describe('reassign', () => {
    it('reassigns an OPEN task', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.reassign('member_2');

      expect(task.props.ownerMemberId).toBe('member_2');
    });

    it('rejects reassigning a DONE task', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.complete('Done', new Date('2026-10-03T14:30:00Z'));

      expect(() => {
        task.reassign('member_2');
      }).toThrow(BusinessRuleError);
    });

    it('rejects reassigning a CANCELLED task', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call customer',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.cancel(new Date('2026-10-03T11:00:00Z'));

      expect(() => {
        task.reassign('member_2');
      }).toThrow(BusinessRuleError);
    });
  });

  describe('bucket in Asia/Kolkata timezone', () => {
    it('returns OVERDUE when dueAt < now', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T09:00:00Z'),
        source: 'MANUAL',
        now,
      });

      expect(task.bucket(now, 'Asia/Kolkata')).toBe('OVERDUE');
    });

    it('returns TODAY when due on same IST calendar day and not overdue', () => {
      // now = 2026-10-03T10:00:00Z = 2026-10-03T15:30:00 IST (10:00 UTC + 5:30)
      // task due = 2026-10-03T11:00:00Z = 2026-10-03T16:30:00 IST (same day)
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T11:00:00Z'),
        source: 'MANUAL',
        now,
      });

      expect(task.bucket(now, 'Asia/Kolkata')).toBe('TODAY');
    });

    it('returns TODAY for task due at 23:00 IST when now is 00:30 IST same IST day', () => {
      // now = 2026-10-03T00:30:00Z = 2026-10-03T06:00:00 IST (same IST day)
      // task due = 2026-10-03T17:30:00Z = 2026-10-03T23:00:00 IST (same IST day)
      const now_earlyUtc = new Date('2026-10-03T00:30:00Z');
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T17:30:00Z'),
        source: 'MANUAL',
        now: now_earlyUtc,
      });

      expect(task.bucket(now_earlyUtc, 'Asia/Kolkata')).toBe('TODAY');
    });

    it('returns UPCOMING when due on next IST calendar day', () => {
      // now = 2026-10-03T18:45:00Z = 2026-10-04T00:15:00 IST (next IST day)
      const now_eveningUtc = new Date('2026-10-03T18:45:00Z');
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-04T06:00:00Z'), // next IST day
        source: 'MANUAL',
        now: now_eveningUtc,
      });

      expect(task.bucket(now_eveningUtc, 'Asia/Kolkata')).toBe('UPCOMING');
    });

    it('returns DONE when task is completed', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.complete('Done', new Date('2026-10-03T14:30:00Z'));

      expect(task.bucket(now, 'Asia/Kolkata')).toBe('DONE');
    });

    it('returns DONE when task is cancelled', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.cancel(new Date('2026-10-03T11:00:00Z'));

      expect(task.bucket(now, 'Asia/Kolkata')).toBe('DONE');
    });
  });

  describe('needsEscalation', () => {
    it('returns false for task created less than 24h ago', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      const thirtyMinutesLater = new Date('2026-10-03T10:30:00Z');
      expect(task.needsEscalation(thirtyMinutesLater)).toBe(false);
    });

    it('returns true when OPEN and 24h have passed since dueAt', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T10:00:00Z'),
        source: 'MANUAL',
        now,
      });

      const moreThan24hLater = new Date('2026-10-04T10:01:00Z');
      expect(task.needsEscalation(moreThan24hLater)).toBe(true);
    });

    it('returns false once already escalated', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T10:00:00Z'),
        source: 'MANUAL',
        now,
      });

      const moreThan24hLater = new Date('2026-10-04T10:01:00Z');
      task.markEscalated(moreThan24hLater);

      expect(task.needsEscalation(moreThan24hLater)).toBe(false);
    });

    it('returns false when task is DONE', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T10:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.complete('Done', new Date('2026-10-03T14:00:00Z'));

      const moreThan24hLater = new Date('2026-10-04T10:01:00Z');
      expect(task.needsEscalation(moreThan24hLater)).toBe(false);
    });

    it('returns false when task is CANCELLED', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T10:00:00Z'),
        source: 'MANUAL',
        now,
      });

      task.cancel(new Date('2026-10-03T11:00:00Z'));

      const moreThan24hLater = new Date('2026-10-04T10:01:00Z');
      expect(task.needsEscalation(moreThan24hLater)).toBe(false);
    });
  });

  describe('markEscalated', () => {
    it('sets escalatedAt timestamp', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T10:00:00Z'),
        source: 'MANUAL',
        now,
      });

      const escalateTime = new Date('2026-10-04T10:05:00Z');
      task.markEscalated(escalateTime);

      expect(task.props.escalatedAt).toBe(escalateTime.toISOString());
    });
  });

  describe('reschedule', () => {
    it('updates task dueAt', () => {
      const task = Task.create({
        id: 'task_1',
        ownerMemberId: 'member_1',
        subjectType: 'LEAD',
        subjectId: 'lead_1',
        kind: 'CALL',
        title: 'Call',
        dueAt: new Date('2026-10-03T14:00:00Z'),
        source: 'MANUAL',
        now,
      });

      const newDueDate = new Date('2026-10-04T10:00:00Z');
      task.reschedule(newDueDate);

      expect(task.props.dueAt).toBe(newDueDate.toISOString());
    });
  });
});
