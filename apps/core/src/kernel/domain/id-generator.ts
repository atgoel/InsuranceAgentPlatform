import { ValidationError } from '../errors/domain-errors';
import { Clock } from './clock';
import { randomBytes } from 'crypto';

export interface IdGenerator {
  next(prefix: string): string;
}

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32Encode(bytes: Buffer): string {
  let result = '';
  let buffer = 0;
  let bitsInBuffer = 0;

  for (let i = 0; i < bytes.length; i++) {
    buffer = (buffer << 8) | bytes[i];
    bitsInBuffer += 8;

    while (bitsInBuffer >= 5) {
      bitsInBuffer -= 5;
      const index = (buffer >> bitsInBuffer) & 0x1f;
      result += CROCKFORD_ALPHABET[index];
    }
  }

  if (bitsInBuffer > 0) {
    const index = (buffer << (5 - bitsInBuffer)) & 0x1f;
    result += CROCKFORD_ALPHABET[index];
  }

  return result;
}

export class UlidIdGenerator implements IdGenerator {
  constructor(private clock: Clock, private random?: () => number) {}

  next(prefix: string): string {
    if (!/^[a-z]{2,6}$/.test(prefix)) {
      throw new ValidationError('invalid_id_prefix', 'Prefix must match /^[a-z]{2,6}$/');
    }

    // Generate timestamp part (10 chars in Crockford base32 = 50 bits)
    const now = this.clock.now().getTime();
    const timeBytes = Buffer.allocUnsafe(8);
    timeBytes.writeBigUInt64BE(BigInt(now), 0);
    const timePart = base32Encode(timeBytes).slice(-10);

    // Generate random part (16 chars in Crockford base32 = 80 bits = 10 bytes)
    const randomBytes1 = this.random ? Buffer.allocUnsafe(10) : randomBytes(10);
    if (this.random) {
      for (let i = 0; i < 10; i++) {
        randomBytes1[i] = Math.floor(this.random() * 256);
      }
    }
    const randomPart = base32Encode(randomBytes1);

    return `${prefix}_${timePart}${randomPart}`;
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counters: Record<string, number> = {};

  next(prefix: string): string {
    if (!this.counters[prefix]) {
      this.counters[prefix] = 0;
    }
    this.counters[prefix]++;
    const counter = this.counters[prefix].toString().padStart(4, '0');
    return `${prefix}_${counter}`;
  }
}
