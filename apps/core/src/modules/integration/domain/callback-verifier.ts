import { createHmac, timingSafeEqual } from 'crypto';
import { UnauthenticatedError } from '../../../kernel/errors/domain-errors';

export class ReplayWindow {
  contains(timestamp: string, now: Date): boolean {
    if (!/^\d+$/.test(timestamp)) {
      return false;
    }
    const seconds = Number(timestamp);
    return Number.isSafeInteger(seconds) && Math.abs(now.getTime() - seconds * 1000) <= 300_000;
  }
}

export class HmacCallbackVerifier {
  private readonly window = new ReplayWindow();

  verify(input: {
    rawBody: string;
    signatureHeader: string;
    timestampHeader: string;
    secret: string;
    now: Date;
  }): void {
    if (!input.secret || !/^[a-f0-9]{64}$/.test(input.signatureHeader)) {
      this.reject();
    }
    if (!this.window.contains(input.timestampHeader, input.now)) {
      this.reject();
    }
    const expected = createHmac('sha256', input.secret)
      .update(`${input.timestampHeader}.${input.rawBody}`, 'utf8')
      .digest();
    const supplied = Buffer.from(input.signatureHeader, 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) {
      this.reject();
    }
  }

  private reject(): never {
    throw new UnauthenticatedError('callback_signature_invalid', 'Callback signature invalid');
  }
}
