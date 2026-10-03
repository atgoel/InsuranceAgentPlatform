import { BiRecord } from './benefit-illustration';
import { ShareToken } from './share-token';

const now = new Date('2026-10-03T06:00:00.000Z');
const DOC = 'doc_01J9ZK3V8Q4Y6W2T5R7N0M1P3A';
const attach = () => BiRecord.attach({ id: 'bi_1', quoteOptionId: 'qo_1', documentRef: DOC, insurerBiVersion: 'BI-v3', uploadedBy: 'mem_1', now });

describe('AC-M06-07 benefit illustration evidence', () => {
  it('AC-M06-07 attaches the insurer BI with its version and a document pointer', () => {
    expect(attach().props).toMatchObject({ documentRef: DOC, insurerBiVersion: 'BI-v3', uploadedBy: 'mem_1' });
    expect(() => BiRecord.attach({ id: 'bi_2', quoteOptionId: 'qo_1', documentRef: 'not-a-doc', insurerBiVersion: 'v1', uploadedBy: 'mem_1', now })).toThrow(
      expect.objectContaining({ code: 'invalid_document_ref' }),
    );
  });

  it('AC-M06-07 acknowledges once', () => {
    const bi = attach();
    bi.acknowledge({ method: 'CUSTOMER_LINK', by: 'pty_1' }, now);
    expect(bi.acknowledged).toBe(true);
    expect(() => bi.acknowledge({ method: 'CUSTOMER_LINK', by: 'pty_1' }, now)).toThrow(expect.objectContaining({ code: 'bi_already_acknowledged' }));
  });

  it('AC-M06-07 ASSISTED acknowledgement needs evidence', () => {
    const bi = attach();
    expect(() => bi.acknowledge({ method: 'ASSISTED', by: 'mem_1' }, now)).toThrow(expect.objectContaining({ code: 'evidence_required' }));
    bi.acknowledge({ method: 'ASSISTED', by: 'mem_1', evidenceRef: DOC }, now);
    expect(bi.props.acknowledgement).toEqual({ method: 'ASSISTED', at: now.toISOString(), by: 'mem_1', evidenceRef: DOC });
  });
});

describe('AC-M06-08 share token', () => {
  const tokens = new ShareToken('test-secret');

  it('AC-M06-08 issues a signed token valid for 7 days, bound to the tenant', () => {
    const { token, expiresAt } = tokens.issue('qr_1', 'ten_a', now);
    expect(expiresAt.toISOString()).toBe('2026-10-10T06:00:00.000Z');
    expect(tokens.verify(token, 'ten_a', now)).toEqual({ ok: true, payload: { quoteRequestId: 'qr_1', tenantId: 'ten_a', exp: expiresAt.getTime() / 1000 } });
  });

  it('AC-M06-08 refuses tampered, expired, other-tenant and malformed tokens', () => {
    const { token } = tokens.issue('qr_1', 'ten_a', now);
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ quoteRequestId: 'qr_2', tenantId: 'ten_a', exp: 9_999_999_999 })).toString('base64url');
    expect(tokens.verify(`${forged}.${sig}`, 'ten_a', now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(tokens.verify(`${body}.${sig.slice(0, -1)}`, 'ten_a', now)).toEqual({ ok: false, reason: 'bad_signature' });
    expect(tokens.verify(token, 'ten_a', new Date('2026-10-10T06:00:00.000Z'))).toEqual({ ok: false, reason: 'expired' });
    expect(tokens.verify(token, 'ten_b', now)).toEqual({ ok: false, reason: 'tenant_mismatch' });
    expect(tokens.verify('garbage', 'ten_a', now)).toEqual({ ok: false, reason: 'malformed' });
    expect(new ShareToken('other-secret').verify(token, 'ten_a', now)).toEqual({ ok: false, reason: 'bad_signature' });
  });
});
