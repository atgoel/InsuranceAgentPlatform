import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AdviceModule } from '../../src/modules/advice/advice.module';
import { createTestApp, TestApp } from '../support/test-app';
import { operatorToken } from '../support/tokens';
import { Api, Seller, V, addOption, api, eventData, openQuote, opportunityFor, optionInput, relay, setupTenant } from './fixtures';

const DAY_MS = 86_400_000;
const PUBLIC = '/api/v1/public/quote-shares';

/** AC-M06-08 share link; AC-M06-09 cross-module reactions to the quote events. */
describe('AC-M06-08/09 Share link and quote events', () => {
  let t: TestApp;
  let seller: Seller;
  let http: Api;
  let opp: { partyId: string; opportunityId: string };
  let quoteId: string;

  const tokenOf = (url: string) => url.slice(`${PUBLIC}/`.length);
  const share = async (): Promise<{ url: string; expiresAt: string }> => {
    const res = await http.post(`/api/v1/quotes/${quoteId}/shares`);
    expect(res.status).toBe(200);
    return res.body as { url: string; expiresAt: string };
  };
  const open = (token: string, host = 'acme.iap.test') => t.http.get(`${PUBLIC}/${token}`).set('Host', host);
  const rejections = () => t.logs.byEvent('security.quote_share_rejected');
  const stageOf = async (): Promise<string | undefined> => {
    const board = await http.get('/api/v1/opportunities');
    const items = (board.body.columns as Array<{ items: Array<{ id: string; stage: string }> }>).flatMap((c) => c.items);
    return items.find((o) => o.id === opp.opportunityId)?.stage;
  };

  beforeEach(async () => {
    t = await createTestApp({ imports: [AdviceModule] });
    seller = await setupTenant(t);
    http = api(t, seller.token);
    opp = await opportunityFor(t, seller);
    quoteId = await openQuote(t, seller.token, opp);
    await addOption(t, seller.token, quoteId, optionInput(V.term));
  });
  afterEach(async () => t.close());

  describe('AC-M06-08 share link', () => {
    it('AC-M06-08 sharing marks the quote SHARED and issues a link valid for 7 days', async () => {
      const res = await http.post(`/api/v1/quotes/${quoteId}/shares`);

      expect(res.status).toBe(200);
      expect(res.body.url).toMatch(new RegExp(`^${PUBLIC}/[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$`));
      expect(res.body.expiresAt).toBe('2026-01-08T00:00:00.000Z');
      expect(Object.keys(res.body).sort()).toEqual(['expiresAt', 'url']);
      expect((await http.get(`/api/v1/quotes/${quoteId}`)).body).toMatchObject({ status: 'SHARED', sharedAt: '2026-01-01T00:00:00.000Z' });
    });

    it('AC-M06-08 a quote without options cannot be shared (422 quote_has_no_options)', async () => {
      const empty = await openQuote(t, seller.token, opp);

      const res = await http.post(`/api/v1/quotes/${empty}/shares`);

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('quote_has_no_options');
    });

    it('AC-M06-08 a valid link shows the comparison without contact data, ids or member references, and is not cacheable', async () => {
      const { url, expiresAt } = await share();

      const res = await open(tokenOf(url));

      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(Object.keys(res.body).sort()).toEqual(['comparison', 'customerFirstName', 'disclosure', 'expiresAt', 'options', 'status']);
      expect(res.body).toMatchObject({
        customerFirstName: 'Asha', status: 'SHARED', expiresAt,
        disclosure: 'Showing plans from your tied insurers only: HDFC Life, ICICI Prudential Life. This disclosure appears on shared comparisons.',
      });
      expect(res.body.options).toHaveLength(1);
      expect(res.body.options[0]).toEqual({
        optionId: expect.stringMatching(/^qop_/), productName: 'Click 2 Protect Supreme', insurerName: 'HDFC Life', sumAssuredPaise: 1_000_000_000, validUntil: '2026-01-31',
        premium: { basePaise: 1_000_000, ridersPaise: 100_000, taxPaise: 198_000, totalPaise: 1_298_000, frequency: 'ANNUAL' },
      });
      expect(res.body.comparison.find((r: { key: string }) => r.key === 'premium_total').values).toEqual([1_298_000]);
      const text = JSON.stringify(res.body);
      for (const secret of [opp.partyId, opp.opportunityId, seller.memberId, quoteId, 'Verma', '+9198', '@']) expect(text).not.toContain(secret);
    });

    it('AC-M06-08 a tampered signature is 404 and security-logged without the token', async () => {
      const { url } = await share();
      const token = tokenOf(url);
      const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;

      const res = await open(tampered);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('quote_share_not_found');
      expect(rejections()).toHaveLength(1);
      expect(rejections()[0]).toMatchObject({ level: 'warn', channel: 'security', ctx: { reason: 'bad_signature' } });
      expect(JSON.stringify(rejections()[0])).not.toContain(token.slice(0, 20));
    });

    it('AC-M06-08 a payload pointing at another quote or tenant fails the signature check', async () => {
      const { url } = await share();
      const [body, signature] = tokenOf(url).split('.');
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>;
      const forged = Buffer.from(JSON.stringify({ ...payload, tenantId: 'ten_zen' })).toString('base64url');

      const res = await open(`${forged}.${signature}`, 'zen.iap.test');

      expect(res.status).toBe(404);
      expect(rejections().map((r) => r.ctx)).toEqual([{ reason: 'bad_signature' }]);
    });

    it('AC-M06-08 an expired link is 404 with reason expired; just before expiry it still works', async () => {
      const { url } = await share();
      t.clock.advance(7 * DAY_MS - 1_000);
      const before = await open(tokenOf(url));
      t.clock.advance(1_000);

      const after = await open(tokenOf(url));

      expect(before.status).toBe(200);
      expect(after.status).toBe(404);
      expect(rejections().map((r) => r.ctx)).toEqual([{ reason: 'expired' }]);
    });

    it('AC-M06-08 another tenant’s host is 404 with reason tenant_mismatch; a malformed token is 404 with reason malformed', async () => {
      const { url } = await share();

      const otherHost = await open(tokenOf(url), 'zen.iap.test');
      const malformed = await open('not-a-token');

      expect(otherHost.status).toBe(404);
      expect(malformed.status).toBe(404);
      expect(rejections().map((r) => r.ctx)).toEqual([{ reason: 'tenant_mismatch' }, { reason: 'malformed' }]);
    });

    it('AC-M06-08 an unknown or suspended host cannot open a link', async () => {
      const { url } = await share();

      const unknown = await open(tokenOf(url), 'nobody.iap.test');
      const suspended = await open(tokenOf(url), 'sleepy.iap.test');

      expect([unknown.status, suspended.status]).toEqual([404, 404]);
    });

    it('AC-M06-08 the link follows the quote: a selected option shows as SELECTED status', async () => {
      const { url } = await share();
      const optionId = (await http.get(`/api/v1/quotes/${quoteId}`)).body.options[0].id as string;
      await http.post(`/api/v1/quotes/${quoteId}/selection`, { optionId });

      const res = await open(tokenOf(url));

      expect(res.body.status).toBe('SELECTED');
    });
  });

  describe('AC-M06-09 cross-module reactions', () => {
    it('AC-M06-09 quote.request.shared moves the opportunity from DISCOVERY to QUOTE_SHARED once the event is delivered', async () => {
      expect(await stageOf()).toBe('DISCOVERY');

      await share();
      expect(await stageOf()).toBe('DISCOVERY');
      await relay(t);

      expect(eventData(t, 'quote.request.shared')).toEqual([{ quoteRequestId: quoteId, opportunityId: opp.opportunityId }]);
      expect(await stageOf()).toBe('QUOTE_SHARED');
    });

    it('AC-M06-09 quote.option.created locks the product version: it cannot be edited afterwards, while an unquoted version still can', async () => {
      const edit = (id: string) => t.http.put(`/api/v1/ops/catalogue/versions/${id}`).set('Authorization', `Bearer ${operatorToken()}`).send({ posEligible: true });
      await relay(t);

      const locked = await edit(V.term);
      const untouched = await edit(V.savings);

      expect(locked.status).toBe(422);
      expect(locked.body.code).toBe('product_version_locked');
      expect(untouched.status).toBe(200);
    });
  });
});
