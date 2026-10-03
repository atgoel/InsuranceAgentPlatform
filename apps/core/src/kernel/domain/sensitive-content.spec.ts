import { describe, it, expect } from '@jest/globals';
import { SensitiveContentGuard } from './sensitive-content';
import { BusinessRuleError } from '../errors/domain-errors';

/**
 * AC-M04-04: SensitiveContentGuard rejects PAN (12-digit e.g. ABCDE1234F),
 * 12-digit Aadhaar (incl. spaced "1234 5678 9012"), and 16-digit card numbers (incl. spaced);
 * accepts normal text and 10-digit mobile numbers.
 */
describe('AC-M04-04 SensitiveContentGuard', () => {
  describe('rejects PAN numbers', () => {
    it('rejects valid PAN format ABCDE1234F', () => {
      expect(() => {
        SensitiveContentGuard.check('PAN is ABCDE1234F');
      }).toThrow(BusinessRuleError);
    });

    it('rejects PAN in uppercase at start', () => {
      expect(() => {
        SensitiveContentGuard.check('ABCDE1234F is my PAN');
      }).toThrow(BusinessRuleError);
    });

    it('rejects PAN in middle of text', () => {
      expect(() => {
        SensitiveContentGuard.check('The PAN number ABCDE1234F was used');
      }).toThrow(BusinessRuleError);
    });

    it('has error code sensitive_content_not_allowed', () => {
      expect(codeOf(() => SensitiveContentGuard.check('ABCDE1234F'))).toBe('sensitive_content_not_allowed');
    });
  });

  it('AC-M04-04 rejects a PAN typed in lower case', () => {
    expect(() => SensitiveContentGuard.check('pan is abcde1234f')).toThrow(BusinessRuleError);
  });

  describe('rejects Aadhaar numbers', () => {
    it('rejects 12-digit Aadhaar without spaces', () => {
      expect(() => {
        SensitiveContentGuard.check('Aadhaar: 123456789012');
      }).toThrow(BusinessRuleError);
    });

    it('rejects 12-digit Aadhaar with spaces in format 1234 5678 9012', () => {
      expect(() => {
        SensitiveContentGuard.check('Aadhaar is 1234 5678 9012');
      }).toThrow(BusinessRuleError);
    });

    it('rejects Aadhaar at start of text', () => {
      expect(() => {
        SensitiveContentGuard.check('123456789012 is the number');
      }).toThrow(BusinessRuleError);
    });

    it('rejects Aadhaar in middle of text', () => {
      expect(() => {
        SensitiveContentGuard.check('My Aadhaar is 1234 5678 9012 and valid');
      }).toThrow(BusinessRuleError);
    });

    it('rejects Aadhaar at end of text', () => {
      expect(() => {
        SensitiveContentGuard.check('The number is 1234 5678 9012');
      }).toThrow(BusinessRuleError);
    });
  });

  describe('rejects card numbers', () => {
    it('rejects 16-digit card number without spaces', () => {
      expect(() => {
        SensitiveContentGuard.check('Card: 1234567890123456');
      }).toThrow(BusinessRuleError);
    });

    it('rejects 16-digit card number with spaces', () => {
      expect(() => {
        SensitiveContentGuard.check('Card is 1234 5678 9012 3456');
      }).toThrow(BusinessRuleError);
    });

    it('rejects card at start of text', () => {
      expect(() => {
        SensitiveContentGuard.check('1234 5678 9012 3456 is my card');
      }).toThrow(BusinessRuleError);
    });

    it('rejects card in middle of text', () => {
      expect(() => {
        SensitiveContentGuard.check('The card number 1234 5678 9012 3456 expired');
      }).toThrow(BusinessRuleError);
    });
  });

  describe('accepts normal text', () => {
    it('accepts regular text without sensitive data', () => {
      expect(() => {
        SensitiveContentGuard.check('This is a regular note about the lead');
      }).not.toThrow();
    });

    it('accepts text with dates and references', () => {
      expect(() => {
        SensitiveContentGuard.check('Called on 2026-10-03, customer interested in TERM_LIFE');
      }).not.toThrow();
    });

    it('accepts text with currency amounts', () => {
      expect(() => {
        SensitiveContentGuard.check('Expected premium is 500000 paise per month');
      }).not.toThrow();
    });

    it('accepts multiple short digit sequences', () => {
      expect(() => {
        SensitiveContentGuard.check('Policy 123 issued in month 05 of year 2026');
      }).not.toThrow();
    });

    it('accepts empty text', () => {
      expect(() => {
        SensitiveContentGuard.check('');
      }).not.toThrow();
    });
  });

  describe('accepts mobile numbers', () => {
    it('accepts 10-digit mobile number', () => {
      expect(() => {
        SensitiveContentGuard.check('Contact customer at 9876543210');
      }).not.toThrow();
    });

    it('accepts 10-digit mobile with spaces', () => {
      expect(() => {
        SensitiveContentGuard.check('Mobile: 9876 5432 10');
      }).not.toThrow();
    });

    it('accepts multiple 10-digit numbers', () => {
      expect(() => {
        SensitiveContentGuard.check('Primary: 9876543210, Secondary: 9123456789');
      }).not.toThrow();
    });

    it('accepts mobile with +91 prefix', () => {
      expect(() => {
        SensitiveContentGuard.check('Call +919876543210');
      }).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('does not reject 11-digit sequences', () => {
      expect(() => {
        SensitiveContentGuard.check('Policy number 12345678901');
      }).not.toThrow();
    });

    it('does not reject 13-digit sequences', () => {
      expect(() => {
        SensitiveContentGuard.check('Reference 1234567890123');
      }).not.toThrow();
    });

    it('does not reject 15-digit sequences', () => {
      expect(() => {
        SensitiveContentGuard.check('Code 123456789012345');
      }).not.toThrow();
    });

    it('rejects only exact 12-digit Aadhaar format or 16-digit card format', () => {
      expect(() => {
        SensitiveContentGuard.check('1234567890 and extra text');
      }).not.toThrow();
    });
  });
});

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return undefined;
}
