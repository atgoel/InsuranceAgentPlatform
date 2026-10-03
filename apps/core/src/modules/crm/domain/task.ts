import { ValidationError, BusinessRuleError } from '../../../kernel/errors/domain-errors';

export type TaskKind = 'CALL' | 'WHATSAPP' | 'MEETING' | 'DOCUMENT' | 'FOLLOW_UP' | 'RENEWAL';
export type TaskStatus = 'OPEN' | 'DONE' | 'CANCELLED';
export type TaskSource = 'MANUAL' | 'ROUTING' | 'CADENCE' | 'VOICE_NOTE' | 'SYSTEM';

export interface TaskProps {
  id: string;
  ownerMemberId: string;
  subjectType: 'LEAD' | 'PARTY' | 'OPPORTUNITY' | 'DUE' | 'PROPOSAL';
  subjectId: string;
  kind: TaskKind;
  title: string;
  dueAt: string;
  status: TaskStatus;
  outcome?: string;
  source: TaskSource;
  escalatedAt?: string;
  createdAt: string;
  completedAt?: string;
  version: number;
}

export class Task {
  private _props: TaskProps;

  static create(
    input: {
      id: string;
      ownerMemberId: string;
      subjectType: 'LEAD' | 'PARTY' | 'OPPORTUNITY' | 'DUE' | 'PROPOSAL';
      subjectId: string;
      kind: TaskKind;
      title: string;
      dueAt: Date | string;
      source: TaskSource;
      outcome?: string;
      now: Date;
    }
  ): Task {
    if (input.title.length < 2 || input.title.length > 140) {
      throw new ValidationError('invalid_title_length', 'Title must be 2-140 characters');
    }

    const now = input.now.toISOString();
    const dueAt = typeof input.dueAt === 'string' ? input.dueAt : input.dueAt.toISOString();

    return new Task({
      id: input.id,
      ownerMemberId: input.ownerMemberId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      kind: input.kind,
      title: input.title,
      dueAt,
      source: input.source,
      outcome: input.outcome,
      status: 'OPEN',
      createdAt: now,
      version: 1,
    });
  }

  static restore(props: TaskProps): Task {
    return new Task(props);
  }

  private constructor(props: TaskProps) {
    this._props = props;
  }

  markSaved(): void {
    this._props = { ...this._props, version: this._props.version + 1 };
  }

  get props(): Readonly<TaskProps> {
    return this._props;
  }

  complete(outcome: string | undefined, now: Date): void {
    if (this._props.status !== 'OPEN') {
      throw new BusinessRuleError('invalid_task_transition', `Cannot complete task in ${this._props.status} status`);
    }

    this._props.status = 'DONE';
    this._props.outcome = outcome;
    this._props.completedAt = now.toISOString();
  }

  cancel(_now: Date): void {
    if (this._props.status !== 'OPEN') {
      throw new BusinessRuleError('invalid_task_transition', `Cannot cancel task in ${this._props.status} status`);
    }

    this._props.status = 'CANCELLED';
  }

  reassign(memberId: string): void {
    if (this._props.status !== 'OPEN') {
      throw new BusinessRuleError('invalid_task_transition', `Cannot reassign task in ${this._props.status} status`);
    }

    this._props.ownerMemberId = memberId;
  }

  reschedule(dueAt: Date): void {
    this._props.dueAt = dueAt.toISOString();
  }

  bucket(now: Date, _tz: 'Asia/Kolkata' = 'Asia/Kolkata'): 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'DONE' {
    if (this._props.status === 'DONE' || this._props.status === 'CANCELLED') return 'DONE';

    const due = new Date(this._props.dueAt);
    const istNow = convertToIST(now);
    const istDue = convertToIST(due);

    // Compare in IST time
    if (istDue.getTime() < istNow.getTime()) {
      return 'OVERDUE';
    }

    // Get IST calendar dates for same-day comparison
    const nowDateStr = istNow.toISOString().split('T')[0];
    const dueDateStr = istDue.toISOString().split('T')[0];

    // If dates are the same in IST, it's TODAY
    if (dueDateStr === nowDateStr) {
      return 'TODAY';
    }

    // Otherwise UPCOMING
    return 'UPCOMING';
  }

  needsEscalation(now: Date): boolean {
    if (this._props.status !== 'OPEN') return false;
    if (this._props.escalatedAt) return false;

    const due = new Date(this._props.dueAt);
    const escalationTime = new Date(due.getTime() + 24 * 60 * 60 * 1000); // +24h

    return now > escalationTime;
  }

  markEscalated(now: Date): void {
    this._props.escalatedAt = now.toISOString();
  }
}

// Helper: convert UTC Date to IST (UTC+05:30, no DST)
function convertToIST(utcDate: Date): Date {
  const istDate = new Date(utcDate.getTime() + 5.5 * 60 * 60 * 1000);
  return istDate;
}
