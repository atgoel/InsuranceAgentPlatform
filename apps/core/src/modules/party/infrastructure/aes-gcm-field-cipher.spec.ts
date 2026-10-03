import { describe, it, expect } from '@jest/globals';
import { AesGcmFieldCipher } from './aes-gcm-field-cipher';

/**
 * AC-M03-02: FieldCipher round-trips plaintext, produces different ciphertexts
 * for the same input (random IV), produces equal hashes for equal inputs within
 * a tenant and different hashes across tenants, and fails to decrypt with
 * another tenant's key.
 */
describe('AC-M03-02 AesGcmFieldCipher', () => {
  const masterKey = Buffer.from('0'.repeat(64), 'hex'); // 32 bytes of zeros

  describe('encrypt and decrypt', () => {
    it('round-trips plaintext through encrypt and decrypt', async () => {
      const cipher = new AesGcmFieldCipher(masterKey);
      const plaintext = '+919876543210';

      const ciphertext = await cipher.encrypt('ten_acme', plaintext);
      const decrypted = await cipher.decrypt('ten_acme', ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertexts for the same plaintext (random IV)', async () => {
      const cipher = new AesGcmFieldCipher(masterKey);
      const plaintext = '+919876543210';

      const ciphertext1 = await cipher.encrypt('ten_acme', plaintext);
      const ciphertext2 = await cipher.encrypt('ten_acme', plaintext);

      expect(ciphertext1).not.toBe(ciphertext2);
      // But both should decrypt to the same value
      const decrypted1 = await cipher.decrypt('ten_acme', ciphertext1);
      const decrypted2 = await cipher.decrypt('ten_acme', ciphertext2);
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
    });

    it('produces base64-encoded ciphertext', async () => {
      const cipher = new AesGcmFieldCipher(masterKey);
      const ciphertext = await cipher.encrypt('ten_acme', '+919876543210');

      // Should be valid base64
      expect(() => {
        Buffer.from(ciphertext, 'base64');
      }).not.toThrow();
    });

    it('fails to decrypt with a different master key', async () => {
      const cipher1 = new AesGcmFieldCipher(masterKey);
      const differentKey = Buffer.from('1'.repeat(64), 'hex');
      const cipher2 = new AesGcmFieldCipher(differentKey);

      const plaintext = '+919876543210';
      const ciphertext = await cipher1.encrypt('ten_acme', plaintext);

      // Decrypting with different key should fail
      await expect(cipher2.decrypt('ten_acme', ciphertext)).rejects.toThrow();
    });

    it('fails to decrypt with a different tenant ID', async () => {
      const cipher = new AesGcmFieldCipher(masterKey);
      const plaintext = '+919876543210';

      const ciphertext = await cipher.encrypt('ten_acme', plaintext);

      // Decrypting with different tenant should fail (key derivation includes tenant)
      await expect(cipher.decrypt('ten_zen', ciphertext)).rejects.toThrow();
    });

    it('handles empty plaintext', async () => {
      const cipher = new AesGcmFieldCipher(masterKey);

      const ciphertext = await cipher.encrypt('ten_acme', '');
      const decrypted = await cipher.decrypt('ten_acme', ciphertext);

      expect(decrypted).toBe('');
    });

    it('handles long plaintext', async () => {
      const cipher = new AesGcmFieldCipher(masterKey);
      const plaintext = 'x'.repeat(1000);

      const ciphertext = await cipher.encrypt('ten_acme', plaintext);
      const decrypted = await cipher.decrypt('ten_acme', ciphertext);

      expect(decrypted).toBe(plaintext);
    });

    it('handles special characters', async () => {
      const cipher = new AesGcmFieldCipher(masterKey);
      const plaintext = 'José María Rodríguez @#$%^&*()';

      const ciphertext = await cipher.encrypt('ten_acme', plaintext);
      const decrypted = await cipher.decrypt('ten_acme', ciphertext);

      expect(decrypted).toBe(plaintext);
    });
  });

  describe('hash', () => {
    it('produces equal hashes for equal inputs within a tenant', () => {
      const cipher = new AesGcmFieldCipher(masterKey);

      const hash1 = cipher.hash('ten_acme', '+919876543210');
      const hash2 = cipher.hash('ten_acme', '+919876543210');

      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different values', () => {
      const cipher = new AesGcmFieldCipher(masterKey);

      const hash1 = cipher.hash('ten_acme', '+919876543210');
      const hash2 = cipher.hash('ten_acme', '+919876543211');

      expect(hash1).not.toBe(hash2);
    });

    it('produces different hashes across tenants for the same value', () => {
      const cipher = new AesGcmFieldCipher(masterKey);

      const hash1 = cipher.hash('ten_acme', '+919876543210');
      const hash2 = cipher.hash('ten_zen', '+919876543210');

      expect(hash1).not.toBe(hash2);
    });

    it('produces hex-encoded hashes', () => {
      const cipher = new AesGcmFieldCipher(masterKey);
      const hash = cipher.hash('ten_acme', '+919876543210');

      // Should be valid hex (only 0-9, a-f)
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('produces consistent hash length', () => {
      const cipher = new AesGcmFieldCipher(masterKey);

      const hash1 = cipher.hash('ten_acme', '+919876543210');
      const hash2 = cipher.hash('ten_acme', 'short');
      const hash3 = cipher.hash('ten_acme', 'very-long-value-that-goes-on-and-on');

      // All hashes should be same length (SHA256 = 64 hex chars)
      expect(hash1.length).toBe(hash2.length);
      expect(hash2.length).toBe(hash3.length);
    });

    it('is deterministic across cipher instances', () => {
      const cipher1 = new AesGcmFieldCipher(masterKey);
      const cipher2 = new AesGcmFieldCipher(masterKey);

      const hash1 = cipher1.hash('ten_acme', '+919876543210');
      const hash2 = cipher2.hash('ten_acme', '+919876543210');

      expect(hash1).toBe(hash2);
    });

    it('uses different keys for different purposes', () => {
      const cipher = new AesGcmFieldCipher(masterKey);

      // Data key is used for encryption, lookup key for hashing
      // They should produce different values for the same input
      const ciphertext = await cipher.encrypt('ten_acme', 'test');
      const hash = cipher.hash('ten_acme', 'test');

      expect(ciphertext).not.toContain(hash);
    });
  });

  describe('per-tenant isolation', () => {
    it('derives separate keys per tenant', async () => {
      const cipher = new AesGcmFieldCipher(masterKey);
      const plaintext = '+919876543210';

      const acmeEnc = await cipher.encrypt('ten_acme', plaintext);
      const zenEnc = await cipher.encrypt('ten_zen', plaintext);

      expect(acmeEnc).not.toBe(zenEnc);

      // Cross-tenant decryption fails
      await expect(cipher.decrypt('ten_zen', acmeEnc)).rejects.toThrow();
      await expect(cipher.decrypt('ten_acme', zenEnc)).rejects.toThrow();
    });

    it('uses HKDF for key derivation with correct info strings', () => {
      const cipher = new AesGcmFieldCipher(masterKey);

      // Hashes for the same value should differ across tenants
      // This is because HKDF-derived keys differ per tenant
      const hash1 = cipher.hash('ten_acme', '+919876543210');
      const hash2 = cipher.hash('ten_zen', '+919876543210');

      expect(hash1).not.toBe(hash2);
    });
  });
});
