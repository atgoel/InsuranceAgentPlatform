import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes, createHmac } from 'node:crypto';
import { KernelConfig } from '../config';

export interface FieldCipher {
  encrypt(tenantId: string, plaintext: string): Promise<string>;
  decrypt(tenantId: string, ciphertext: string): Promise<string>;
  hash(tenantId: string, value: string): string;
}

export class AesGcmFieldCipher implements FieldCipher {
  private masterKey: Buffer;
  private readonly dataKeys = new Map<string, Buffer>();
  private readonly lookupKeys = new Map<string, Buffer>();

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
    return this.derived(this.dataKeys, tenantId, 'iap-data-key');
  }

  private deriveLookupKey(tenantId: string): Buffer {
    return this.derived(this.lookupKeys, tenantId, 'iap-lookup-key');
  }

  /** HKDF output is deterministic per tenant and purpose, so each key is derived once and reused. */
  private derived(cache: Map<string, Buffer>, tenantId: string, info: string): Buffer {
    const cached = cache.get(tenantId);
    if (cached) return cached;
    const key = Buffer.from(hkdfSync('sha256', this.masterKey, tenantId, info, 32));
    cache.set(tenantId, key);
    return key;
  }
}

/** FIELD_MASTER_KEY (64 hex chars) in production; a fixed development key elsewhere. Data keys are derived per tenant (HKDF). */
export function fieldMasterKey(config: KernelConfig, env: NodeJS.ProcessEnv = process.env): Buffer {
  const hex = env.FIELD_MASTER_KEY;
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) return Buffer.from(hex, 'hex');
  if (config.env === 'production') throw new Error('FIELD_MASTER_KEY (64 hex chars) is required in production');
  return createHash('sha256').update('iap-development-field-key').digest();
}
