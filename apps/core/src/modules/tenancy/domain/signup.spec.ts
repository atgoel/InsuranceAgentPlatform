import { SoloSignup, hashOtp } from './signup';
import { PhoneNumber } from '../../../kernel/domain/phone-number';
import { BusinessRuleError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M01-10: Solo signup: OTP stored only as a hash and never logged; wrong OTP increments attempts;
 * 5 failures lock; expiry after 10 minutes; success provisions an active SOLO tenant;
 * more than 3 starts per phone per hour → 429.
 */
describe('AC-M01-10 SoloSignup', () => {
  const phone = PhoneNumber.parse('9876543210');
  const displayName = 'John Doe';
  const licence = {
    insurerName: 'Reliance',
    line: 'LIFE' as const,
    licenceNo: 'LIC123456',
  };
  const consentNoticeVersion = '1.0';
  const now = new Date('2026-01-01T10:00:00Z');

  describe('start', () => {
    it('creates a signup in otp_sent state', () => {
      const otpHash = hashOtp('123456', 'pepper');
      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      expect(signup.state).toBe('otp_sent');
      expect(signup.id).toBe('sig_001');
    });

    it('sets expiration to 10 minutes after start', () => {
      const otpHash = hashOtp('123456', 'pepper');
      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      const expectedExpiry = new Date(now.getTime() + 10 * 60 * 1000);
      expect(signup.expiresAt).toEqual(expectedExpiry);
    });

    it('initializes attempts to 0', () => {
      const otpHash = hashOtp('123456', 'pepper');
      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      expect(signup.attempts).toBe(0);
    });

    it('stores OTP as hash, not raw', () => {
      const rawOtp = '123456';
      const pepper = 'test-pepper';
      const otpHash = hashOtp(rawOtp, pepper);

      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      // The stored otpHash should not contain the raw OTP
      expect(signup.otpHash).toBe(otpHash);
      expect(signup.otpHash).not.toContain('123456');
    });
  });

  describe('verify', () => {
    it('transitions from otp_sent to verified on correct OTP', () => {
      const rawOtp = '123456';
      const pepper = 'pepper';
      const otpHash = hashOtp(rawOtp, pepper);

      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      signup.verify(otpHash, now);

      expect(signup.state).toBe('verified');
    });

    it('increments attempts on wrong OTP', () => {
      const otpHash = hashOtp('123456', 'pepper');

      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      expect(() => signup.verify(hashOtp('000000', 'pepper'), now)).toThrow(BusinessRuleError);
      expect(signup.attempts).toBe(1);
    });

    it('locks signup on 5th failed attempt', () => {
      const otpHash = hashOtp('123456', 'pepper');

      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      // Fail 4 times
      for (let i = 0; i < 4; i++) {
        try {
          signup.verify(hashOtp(`00000${i}`, 'pepper'), now);
        } catch {
          // expected
        }
      }

      expect(signup.attempts).toBe(4);

      // 5th attempt locks
      expect(() => signup.verify(hashOtp('000004', 'pepper'), now)).toThrow(BusinessRuleError);
      expect(signup.state).toBe('locked');
    });

    it('prevents verify when signup is not in otp_sent state', () => {
      const otpHash = hashOtp('123456', 'pepper');

      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      signup.verify(otpHash, now);

      expect(() => signup.verify(otpHash, now)).toThrow(BusinessRuleError);
    });

    it('detects OTP expiry', () => {
      const otpHash = hashOtp('123456', 'pepper');

      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      // Try to verify 11 minutes later (expired)
      const expiredTime = new Date(now.getTime() + 11 * 60 * 1000);

      expect(() => signup.verify(otpHash, expiredTime)).toThrow(BusinessRuleError);
      expect(signup.state).toBe('expired');
    });

    it('allows verify at exactly 10 minutes', () => {
      const otpHash = hashOtp('123456', 'pepper');

      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      const exactTime = new Date(now.getTime() + 10 * 60 * 1000);
      signup.verify(otpHash, exactTime);

      expect(signup.state).toBe('verified');
    });
  });

  describe('attachTenant', () => {
    it('attaches a tenant ID to a verified signup', () => {
      const otpHash = hashOtp('123456', 'pepper');

      const signup = SoloSignup.start({
        id: 'sig_001',
        phone,
        displayName,
        licence,
        consentNoticeVersion,
        otpHash,
        now,
      });

      signup.verify(otpHash, now);
      signup.attachTenant('ten_agent_001');

      expect(signup.tenantId).toBe('ten_agent_001');
    });
  });

  describe('hashOtp', () => {
    it('produces consistent hash for same OTP and pepper', () => {
      const otp = '123456';
      const pepper = 'test-pepper';

      const hash1 = hashOtp(otp, pepper);
      const hash2 = hashOtp(otp, pepper);

      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different OTP', () => {
      const pepper = 'test-pepper';

      const hash1 = hashOtp('123456', pepper);
      const hash2 = hashOtp('654321', pepper);

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hash for different pepper', () => {
      const otp = '123456';

      const hash1 = hashOtp(otp, 'pepper1');
      const hash2 = hashOtp(otp, 'pepper2');

      expect(hash1).not.toBe(hash2);
    });

    it('returns hex string', () => {
      const hash = hashOtp('123456', 'pepper');
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });
  });
});
