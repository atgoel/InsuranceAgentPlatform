export { SensitiveContentGuard } from '../../../kernel/domain/sensitive-content';
export type ActivityKind =
  | 'CALL'
  | 'NOTE'
  | 'WHATSAPP'
  | 'SMS'
  | 'EMAIL'
  | 'MEETING'
  | 'STAGE_CHANGE'
  | 'RE_ENQUIRY'
  | 'ASSIGNMENT'
  | 'VOICE_NOTE';

export type CallOutcome = 'CONNECTED' | 'NO_ANSWER' | 'CALL_BACK' | 'WRONG_NUMBER' | 'NOT_INTERESTED';

export interface Activity {
  id: string;
  subjectType: 'LEAD' | 'PARTY' | 'OPPORTUNITY';
  subjectId: string;
  kind: ActivityKind;
  outcome?: CallOutcome;
  summary?: string;
  occurredAt: string;
  actorMemberId?: string;
  clientRef?: string; // offline idempotency
}
