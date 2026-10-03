import { ValidationError } from '../../../kernel/errors/domain-errors';
import { SalespersonType } from './member';

export type ChecklistItemKey = 'IDENTITY_PAN' | 'TRAINING' | 'EXAM' | 'CERTIFICATE' | 'INSURER_CODE';

export interface ChecklistItem {
  key: ChecklistItemKey;
  done: boolean;
  evidenceRef?: string;
  note?: string;
  hoursLogged?: number;
  hoursRequired?: number;
  completedAt?: string;
}

export interface ChecklistTemplate {
  readonly salespersonType: SalespersonType;
  items(): ChecklistItem[];
}

class TemplateImpl implements ChecklistTemplate {
  readonly salespersonType: SalespersonType;
  private readonly _items: ChecklistItem[];

  constructor(salespersonType: SalespersonType, items: ChecklistItem[]) {
    this.salespersonType = salespersonType;
    this._items = items;
  }

  items(): ChecklistItem[] {
    return this._items.map(item => ({ ...item }));
  }
}

export const POSP_TEMPLATE: ChecklistTemplate = new TemplateImpl('POSP', [
  { key: 'IDENTITY_PAN', done: false, hoursRequired: undefined },
  { key: 'TRAINING', done: false, hoursRequired: 15, hoursLogged: 0 },
  { key: 'EXAM', done: false, hoursRequired: undefined },
  { key: 'CERTIFICATE', done: false, hoursRequired: undefined },
  { key: 'INSURER_CODE', done: false, hoursRequired: undefined },
]);

export const ISP_TEMPLATE: ChecklistTemplate = new TemplateImpl('ISP', [
  { key: 'IDENTITY_PAN', done: false, hoursRequired: undefined },
  { key: 'TRAINING', done: false, hoursRequired: 25, hoursLogged: 0 },
  { key: 'EXAM', done: false, hoursRequired: undefined },
  { key: 'CERTIFICATE', done: false, hoursRequired: undefined },
  { key: 'INSURER_CODE', done: false, hoursRequired: undefined },
]);

export const EMPLOYEE_TEMPLATE: ChecklistTemplate = new TemplateImpl('EMPLOYEE', [
  { key: 'IDENTITY_PAN', done: false, hoursRequired: undefined },
  { key: 'INSURER_CODE', done: false, hoursRequired: undefined },
]);

export const SOLO_TEMPLATE: ChecklistTemplate = new TemplateImpl('SOLO', []);

export function templateFor(type: SalespersonType): ChecklistTemplate {
  switch (type) {
    case 'POSP':
      return POSP_TEMPLATE;
    case 'ISP':
      return ISP_TEMPLATE;
    case 'EMPLOYEE':
      return EMPLOYEE_TEMPLATE;
    case 'SOLO':
      return SOLO_TEMPLATE;
  }
}

export class OnboardingChecklist {
  private items_: ChecklistItem[];

  static for(type: SalespersonType): OnboardingChecklist {
    const template = templateFor(type);
    return new OnboardingChecklist(template.items());
  }

  static restore(items: ChecklistItem[]): OnboardingChecklist {
    return new OnboardingChecklist(items.map(item => ({ ...item })));
  }

  private constructor(items: ChecklistItem[]) {
    this.items_ = items.map(item => ({ ...item }));
  }

  recordEvidence(key: ChecklistItemKey, input: { evidenceRef: string; note?: string }, now: Date): void {
    const item = this.items_.find(i => i.key === key);
    if (!item) {
      throw new ValidationError('checklist_item_not_applicable', `Item ${key} is not applicable to this template`);
    }

    if (key === 'TRAINING') {
      throw new ValidationError('checklist_item_not_applicable', 'Training cannot be recorded via recordEvidence; use logTraining');
    }

    item.done = true;
    item.evidenceRef = input.evidenceRef;
    item.note = input.note;
    item.completedAt = now.toISOString();
  }

  logTraining(hours: number, evidenceRef: string, now: Date): void {
    if (hours < 0.5 || hours > 40) {
      throw new ValidationError('invalid_hours', 'Hours must be between 0.5 and 40');
    }

    const item = this.items_.find(i => i.key === 'TRAINING');
    if (!item) {
      return;
    }

    item.hoursLogged = (item.hoursLogged || 0) + hours;
    item.evidenceRef = evidenceRef;

    if (item.hoursRequired && item.hoursLogged >= item.hoursRequired) {
      item.done = true;
      item.completedAt = now.toISOString();
    }
  }

  markInsurerCodeMapped(now: Date): void {
    const item = this.items_.find(i => i.key === 'INSURER_CODE');
    if (item) {
      item.done = true;
      item.completedAt = now.toISOString();
    }
  }

  isComplete(): boolean {
    return this.items_.every(item => item.done);
  }

  missing(): ChecklistItemKey[] {
    return this.items_.filter(item => !item.done).map(item => item.key);
  }

  items(): readonly ChecklistItem[] {
    return this.items_.map(item => ({ ...item }));
  }
}
