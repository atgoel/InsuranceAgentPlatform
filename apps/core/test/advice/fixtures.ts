import { TestApp } from '../support/test-app';
import { AUDIT_LOG, OUTBOX, OUTBOX_RELAY } from '../../src/kernel/tokens';
import { InMemoryOutbox } from '../../src/kernel/outbox/outbox';
import { InMemoryAuditLog } from '../../src/kernel/audit/audit-log';
import { OutboxRelay } from '../../src/kernel/outbox/outbox-relay';
import { tokenFor } from '../support/tokens';
import { newIdempotencyKey } from '../support/idempotency';
import { setupSellerWithRouting } from '../crm/fixtures';
import { tieUps } from '../catalogue/fixtures';

export const HOST = 'acme.iap.test';

/** Seed catalogue versions (M05): TERM, SAVINGS, ULIP (LIFE) and HEALTH. */
export const V = {
  term: 'pv_hdfc_term_v1',
  savings: 'pv_hdfc_sanchay_v1',
  ulip: 'pv_icici_ulip_v1',
  health: 'pv_star_comp_v1',
  floater: 'pv_star_floater_v1',
  /** Insurer not tied up in the fixtures: out of scope for the tenant. */
  outOfScope: 'pv_tata_term_v1',
} as const;

export const DOC_REF = 'doc_01ARZ3NDEKTSV4RRFFQ69G5FAV';
export const EVIDENCE_REF = 'doc_01ARZ3NDEKTSV4RRFFQ69G5FAW';

export interface Seller {
  memberId: string;
  token: string;
}

export interface Api {
  get(path: string): ReturnType<TestApp['http']['get']>;
  post(path: string, body?: object): ReturnType<TestApp['http']['post']>;
  put(path: string, body?: object, ifMatch?: string): ReturnType<TestApp['http']['put']>;
  del(path: string): ReturnType<TestApp['http']['delete']>;
}

/** HTTP helper bound to a token and host: POSTs carry a fresh Idempotency-Key. */
export function api(t: TestApp, token: string, host = HOST): Api {
  const auth = (r: ReturnType<TestApp['http']['get']>) => r.set('Host', host).set('Authorization', `Bearer ${token}`);
  return {
    get: (path) => auth(t.http.get(path)),
    post: (path, body) => auth(t.http.post(path)).set('Idempotency-Key', newIdempotencyKey()).send(body),
    put: (path, body, ifMatch) => {
      const r = auth(t.http.put(path));
      return (ifMatch ? r.set('If-Match', ifMatch) : r).send(body);
    },
    del: (path) => auth(t.http.delete(path)),
  };
}

export const adminToken = (tenantId = 'ten_acme') => tokenFor({ tenantId, roles: ['TENANT_ADMIN'], memberId: `admin_${tenantId}` });
export const complianceToken = () => tokenFor({ tenantId: 'ten_acme', roles: ['COMPLIANCE'], memberId: 'member_compliance', orgUnitId: 'ou_root' });

/** Tie-ups for HDFC Life (LIFE) and Star Health (HEALTH), then one active salesperson who owns the leads routed in. */
export async function setupTenant(t: TestApp): Promise<Seller> {
  await tieUps(t, [['ins_hdfc_life', 'LIFE'], ['ins_icici_pru', 'LIFE'], ['ins_star', 'HEALTH']]);
  return setupSellerWithRouting(t, 'advice_seller');
}

let mobileCounter = 0;

/** Captures, qualifies and converts a lead for `seller`; returns the party and opportunity it created. */
export async function opportunityFor(t: TestApp, seller: Seller, productInterest: 'TERM_LIFE' | 'SAVINGS_LIFE' | 'HEALTH' = 'TERM_LIFE'): Promise<{ partyId: string; opportunityId: string }> {
  mobileCounter += 1;
  const http = api(t, seller.token);
  const mobile = `+91981230${String(mobileCounter).padStart(4, '0')}`;
  // Lead capture creates unowned parties (M04); the seller creates the party first so M03 gives it an owner and the lead links to it.
  const party = await http.post('/api/v1/parties', { kind: 'PERSON', displayName: 'Asha Verma', contacts: [{ channel: 'MOBILE', value: mobile, isPrimary: true }] });
  if (party.status !== 201) throw new Error(`party failed: ${party.status} ${JSON.stringify(party.body)}`);
  const lead = await http.post('/api/v1/leads', {
    fullName: 'Asha Verma', mobile, productInterest, source: 'WEB_FORM',
    consent: { granted: true, noticeVersion: 'v2', channels: ['CALL'], purposes: ['SERVICE', 'MARKETING'] },
  });
  if (lead.status !== 201) throw new Error(`lead failed: ${lead.status} ${JSON.stringify(lead.body)}`);
  if (lead.body.partyId !== party.body.party.id) throw new Error('lead did not link to the seeded party');
  const id = lead.body.leadId as string;
  const steps = [
    () => http.post(`/api/v1/leads/${id}/activities`, { kind: 'CALL', outcome: 'CONNECTED' }),
    () => http.post(`/api/v1/leads/${id}/stage-transitions`, { to: 'CONTACTED' }),
    () => http.put(`/api/v1/leads/${id}/qualification`, { need: 'PROTECTION', budgetBand: 'LT_15K', timeline: 'THIS_MONTH' }),
    () => http.post(`/api/v1/leads/${id}/stage-transitions`, { to: 'QUALIFIED' }),
  ];
  for (const step of steps) {
    const res = await step();
    if (res.status >= 300) throw new Error(`lead step failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const conversion = await http.post(`/api/v1/leads/${id}/conversion`, { partyChoice: 'LEAD_PARTY', productInterest, expectedPremiumPaise: 2_000_000, startStage: 'DISCOVERY' });
  if (conversion.status !== 201) throw new Error(`conversion failed: ${conversion.status} ${JSON.stringify(conversion.body)}`);
  return { partyId: lead.body.partyId as string, opportunityId: conversion.body.opportunityId as string };
}

/** A valid option payload: ₹12,980 annual premium, valid for 30 days from the fixed clock (2026-01-01 IST). */
export function optionInput(versionId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    versionId,
    source: 'MANUAL_PORTAL',
    insurerQuoteRef: 'QREF-1',
    sumAssuredPaise: 1_000_000_000,
    policyTermYears: 30,
    premium: { basePaise: 1_000_000, ridersPaise: 100_000, taxPaise: 198_000, totalPaise: 1_298_000, frequency: 'ANNUAL' },
    coverage: [{ label: 'Accidental death', value: 'Included' }],
    exclusions: ['Suicide within 12 months'],
    waitingPeriods: [{ label: 'Initial', months: 1 }],
    assumptions: { smoker: 'no' },
    validUntil: '2026-01-31',
    ...overrides,
  };
}

/** Opens a quote for the opportunity and returns its id. */
export async function openQuote(t: TestApp, token: string, opp: { partyId: string; opportunityId: string }, extra: Record<string, unknown> = {}): Promise<string> {
  const res = await api(t, token).post('/api/v1/quotes', { opportunityId: opp.opportunityId, insuredPartyIds: [opp.partyId], requirements: { sumAssured: '1cr' }, ...extra });
  if (res.status !== 201) throw new Error(`quote failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

/** Adds an option and returns the new option's id. */
export async function addOption(t: TestApp, token: string, quoteId: string, input: Record<string, unknown>): Promise<string> {
  const res = await api(t, token).post(`/api/v1/quotes/${quoteId}/options`, input);
  if (res.status !== 201) throw new Error(`option failed: ${res.status} ${JSON.stringify(res.body)}`);
  const options = res.body.options as Array<{ id: string; versionId: string }>;
  return options[options.length - 1].id;
}

/** Payloads of the domain events of `type` written to the outbox so far. */
export function eventData(t: TestApp, type: string): Array<Record<string, unknown>> {
  return t.app.get<InMemoryOutbox>(OUTBOX).events.filter((e) => e.type === type).map((e) => e.data as Record<string, unknown>);
}

/** Audit actions recorded so far for the entity. */
export function auditActions(t: TestApp, entityId: string): string[] {
  return t.app.get<InMemoryAuditLog>(AUDIT_LOG).events.filter((e) => e.entityId === entityId).map((e) => e.action);
}

/** Delivers outbox events to their subscribers (cross-module reactions). */
export async function relay(t: TestApp): Promise<void> {
  await t.app.get<OutboxRelay>(OUTBOX_RELAY).relayOnce();
}
