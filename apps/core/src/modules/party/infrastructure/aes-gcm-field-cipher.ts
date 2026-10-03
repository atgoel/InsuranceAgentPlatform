import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHmac } from 'node:crypto';

export interface FieldCipher {
  encrypt(tenantId: string, plaintext: string): Promise<string>;
  decrypt(tenantId: string, ciphertext: string): Promise<string>;
  hash(tenantId: string, value: string): string;
}

export class AesGcmFieldCipher implements FieldCipher {
  private masterKey: Buffer;

  constructor(masterKey: Buffer) {
    this.masterKey = masterKey;
  }

  async encrypt(tenantId: string, plaintext: string): Promise<string> {
    const dataKey = this.deriveDataKey(tenantId);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', dataKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, encrypted, tag]);
    return combined.toString('base64');
  }

  async decrypt(tenantId: string, ciphertextB64: string): Promise<string> {
    const combined = Buffer.from(ciphertextB64, 'base64');

    const iv = combined.slice(0, 12);
    const tag = combined.slice(combined.length - 16);
    const encrypted = combined.slice(12, combined.length - 16);

    const dataKey = this.deriveDataKey(tenantId);
    const decipher = createDecipheriv('aes-256-gcm', dataKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  hash(tenantId: string, value: string): string {
    const lookupKey = this.deriveLookupKey(tenantId);
    const hmac = createHmac('sha256', lookupKey);
    hmac.update(value, 'utf8');
    return hmac.digest('hex');
  }

  private deriveDataKey(tenantId: string): Buffer {
    return Buffer.from(hkdfSync('sha256', this.masterKey, tenantId, 'iap-data-key', 32));
  }

  private deriveLookupKey(tenantId: string): Buffer {
    return Buffer.from(hkdfSync('sha256', this.masterKey, tenantId, 'iap-lookup-key', 32));
  }
}
