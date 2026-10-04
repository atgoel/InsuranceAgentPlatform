import { createHmac } from 'crypto';
import { HmacCallbackVerifier, ReplayWindow } from './callback-verifier';

const now = new Date('2026-10-04T00:00:00.000Z');
const timestamp = String(now.getTime() / 1000);
const rawBody = '{ "eventId": "cb_1", "status": "RECEIVED" }';
const secret = 'callback-test-secret';
const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');

describe('AC-M08-07 callback verification', () => {
  const verifier = new HmacCallbackVerifier();

  it('AC-M08-07 signs exact raw bytes rather than normalized JSON', () => {
    const input = { rawBody, timestampHeader: timestamp, signatureHeader: signature, secret, now };
    expect(() => verifier.verify(input)).not.toThrow();
    expect(() => verifier.verify({ ...input, rawBody: JSON.stringify(JSON.parse(rawBody)) })).toThrow('Callback signature invalid');
    expect(() => verifier.verify({ ...input, secret: 'other-tenant-secret' })).toThrow('Callback signature invalid');
  });

  it.each(['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), 'z'.repeat(64), '0'.repeat(64)])(
    'AC-M08-07 malformed or incorrect signature %s returns the specified 401', invalid => {
      expect(() => verifier.verify({ rawBody, timestampHeader: timestamp, signatureHeader: invalid, secret, now }))
        .toThrow(expect.objectContaining({ code: 'callback_signature_invalid', httpStatus: 401 }));
    },
  );

  it.each([-300_001, 300_001])('AC-M08-07 rejects timestamp skew of %i milliseconds', skew => {
    expect(() => verifier.verify({ rawBody, timestampHeader: timestamp, signatureHeader: signature, secret,
      now: new Date(now.getTime() + skew) })).toThrow('Callback signature invalid');
  });

  it.each([-300_000, 300_000])('AC-M08-07 accepts the exact %i millisecond replay boundary', skew => {
    expect(() => verifier.verify({ rawBody, timestampHeader: timestamp, signatureHeader: signature, secret,
      now: new Date(now.getTime() + skew) })).not.toThrow();
  });

  it.each(['-1', '1e9', '0.1', ' 1791072000', '9007199254740992', ''])('AC-M08-07 rejects invalid timestamp %s', value => {
    expect(new ReplayWindow().contains(value, now)).toBe(false);
  });

  it('AC-M08-07 unavailable credentials fail closed', () => {
    expect(() => verifier.verify({ rawBody, timestampHeader: timestamp, signatureHeader: signature, secret: '', now }))
      .toThrow('Callback signature invalid');
  });
});
