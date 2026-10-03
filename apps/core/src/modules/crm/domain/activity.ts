import { BusinessRuleError } from '../../../kernel/errors/domain-errors';

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

export class SensitiveContentGuard {
  static check(text: string): void {
    // PAN: 5 uppercase letters + 4 digits + 1 uppercase letter = ABCDE1234F
    if (/\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b/.test(text)) {
      throw new BusinessRuleError('sensitive_content_not_allowed', 'Sensitive content detected');
    }

    // Aadhaar: exactly 12 digits with optional spaces in the pattern 4 4 4
    // Use negative lookbehind/lookahead to exclude phone numbers with + prefix or codes
    if (/(?<!\+)\b\d{4}\s\d{4}\s\d{4}\b|\b(?<!\+)\d{12}\b/.test(text)) {
      throw new BusinessRuleError('sensitive_content_not_allowed', 'Sensitive content detected');
    }

    // Card: exactly 16 digits with optional spaces in the pattern 4 4 4 4
    // Match word boundaries to avoid matching partial sequences
    if (/\b\d{4}\s\d{4}\s\d{4}\s\d{4}\b|\b\d{16}\b/.test(text)) {
      throw new BusinessRuleError('sensitive_content_not_allowed', 'Sensitive content detected');
    }
  }
}
