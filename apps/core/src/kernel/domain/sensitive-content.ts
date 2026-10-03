import { BusinessRuleError } from '../errors/domain-errors';

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
