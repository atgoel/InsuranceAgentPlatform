import { createHash } from 'node:crypto';
import { FieldCipher } from '../application/ports';
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ContactPointFactory } from './contact-point';
import { ValidationError } from '../../../kernel/errors/domain-errors';

/**
 * AC-M03-01: ContactPoint factory creates masked, hashed, encrypted contact values.
 */
describe('AC-M03-01 ContactPointFactory', () => {
  let factory: ContactPointFactory;
  let fakeCipher: FieldCipher;

  beforeEach(() => {
    // Opaque but reversible test double: ciphertext and hash never contain the plaintext.
    const seal = (tenantId: string, value: string) => Buffer.from(`${tenantId}|${value}`).toString('base64').split('').reverse().join('');
    fakeCipher = {
      encrypt: async (tenantId: string, value: string) => seal(tenantId, value),
      decrypt: async (tenantId: string, ciphertext: string) => {
        const [owner, value] = Buffer.from(ciphertext.split('').reverse().join(''), 'base64').toString().split('|');
        if (owner !== tenantId) throw new Error('Invalid ciphertext');
        return value ?? '';
      },
      hash: (tenantId: string, value: string) => createHash('sha256').update(`${tenantId}|${value}`).digest('hex'),
    };

    factory = new ContactPointFactory(fakeCipher);
  });

  describe('create MOBILE', () => {
    it('validates and creates a mobile contact point', async () => {
      const cp = await factory.create('ten_acme', {
        channel: 'MOBILE',
        value: '+919876543210',
        isPrimary: true,
      });

      expect(cp.channel).toBe('MOBILE');
      expect(cp.valueEnc).toBeDefined();
      expect(cp.valueHash).toBeDefined();
      expect(cp.masked).toBeDefined();
      expect(cp.isPrimary).toBe(true);
      // Encrypted value should not contain plaintext
      expect(cp.valueEnc).not.toContain('9876543210');
    });

    it('normalizes mobile to E.164 format', async () => {
      const cp = await factory.create('ten_acme', {
        channel: 'MOBILE',
        value: '+91 9876543210',
        isPrimary: true,
      });

      // Should be normalized to +919876543210
      expect(cp.valueHash).toBe(
        fakeCipher.hash('ten_acme', '+919876543210')
      );
    });

    it('masks mobile numbers correctly', async () => {
      const cp = await factory.create('ten_acme', {
        channel: 'MOBILE',
        value: '+919876543210',
        isPrimary: true,
      });

      // Mask should be like +91-XXXXXX3210
      expect(cp.masked).toMatch(/\+91-X{6}\d{4}/);
      expect(cp.masked).toContain('3210');
    });

    it('rejects invalid mobile numbers', async () => {
      await expect(
        factory.create('ten_acme', {
          channel: 'MOBILE',
          value: 'not-a-phone',
          isPrimary: true,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('create EMAIL', () => {
    it('validates and creates an email contact point', async () => {
      const cp = await factory.create('ten_acme', {
        channel: 'EMAIL',
        value: 'john@example.com',
        isPrimary: true,
      });

      expect(cp.channel).toBe('EMAIL');
      expect(cp.valueEnc).toBeDefined();
      expect(cp.valueHash).toBeDefined();
      expect(cp.masked).toBeDefined();
      expect(cp.isPrimary).toBe(true);
      expect(cp.valueEnc).not.toContain('john@example.com');
    });

    it('normalizes email to lowercase', async () => {
      const cp = await factory.create('ten_acme', {
        channel: 'EMAIL',
        value: 'John@Example.COM',
        isPrimary: true,
      });

      expect(cp.valueHash).toBe(
        fakeCipher.hash('ten_acme', 'john@example.com')
      );
    });

    it('masks email correctly', async () => {
      const cp = await factory.create('ten_acme', {
        channel: 'EMAIL',
        value: 'john.doe@example.com',
        isPrimary: true,
      });

      // Mask should be like j***@example.com
      expect(cp.masked).toMatch(/j\*{3}@example\.com/);
    });

    it('rejects invalid email addresses', async () => {
      await expect(
        factory.create('ten_acme', {
          channel: 'EMAIL',
          value: 'not-an-email',
          isPrimary: true,
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('hashFor', () => {
    it('returns consistent hash for the same value', async () => {
      const hash1 = await factory.hashFor('ten_acme', 'MOBILE', '+919876543210');
      const hash2 = await factory.hashFor('ten_acme', 'MOBILE', '+919876543210');

      expect(hash1).toBe(hash2);
    });

    it('normalizes input before hashing', async () => {
      const hash1 = await factory.hashFor('ten_acme', 'MOBILE', '+91 9876543210');
      const hash2 = await factory.hashFor('ten_acme', 'MOBILE', '+919876543210');

      expect(hash1).toBe(hash2);
    });

    it('returns different hashes for different values', async () => {
      const hash1 = await factory.hashFor('ten_acme', 'MOBILE', '+919876543210');
      const hash2 = await factory.hashFor('ten_acme', 'MOBILE', '+911234567890');

      expect(hash1).not.toBe(hash2);
    });

    it('returns different hashes for different tenants', async () => {
      const hash1 = await factory.hashFor('ten_acme', 'MOBILE', '+919876543210');
      const hash2 = await factory.hashFor('ten_zen', 'MOBILE', '+919876543210');

      expect(hash1).not.toBe(hash2);
    });
  });
});
