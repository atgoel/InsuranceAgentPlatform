#!/usr/bin/env node
/**
 * Demo seed (ADR-007 decision 3). Creates a believable client demo dataset in tenant `ten_acme` ONLY through the public
 * HTTP API of the core (signed with a development HS256 token, as the test fixtures do), then links the Keycloak demo
 * users to the created members by setting their `mid` and `ou` attributes through the Keycloak admin REST API.
 *
 * Usage:   node scripts/demo-seed.mjs
 * Idempotent: if the org unit "Mumbai West" already exists, data creation is skipped and only the Keycloak links are
 * (re)applied, using the existing members found by display name.
 *
 * Environment (defaults in brackets):
 *   CORE_URL [http://localhost:3000]   CORE_HOST [localhost] (tenant is resolved from the Host header)
 *   AUTH_HS256_SECRET [dev-only-hs256-secret-change-me-0001]   TENANT_ID [ten_acme]
 *   KEYCLOAK_URL [http://localhost:8180]   KEYCLOAK_REALM [iap]
 *   KEYCLOAK_ADMIN [admin]   KEYCLOAK_ADMIN_PASSWORD [admin]
 *
 * Exits non-zero with the HTTP status and the problem JSON on any unexpected response.
 */
import { createHmac, randomUUID } from 'node:crypto';

const CORE_URL = process.env.CORE_URL ?? 'http://localhost:3000';
const CORE_HOST = process.env.CORE_HOST ?? 'localhost';
const SECRET = process.env.AUTH_HS256_SECRET ?? 'dev-only-hs256-secret-change-me-0001';
const TENANT = process.env.TENANT_ID ?? 'ten_acme';
const KC_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:8180';
const KC_REALM = process.env.KEYCLOAK_REALM ?? 'iap';
const KC_ADMIN = process.env.KEYCLOAK_ADMIN ?? 'admin';
const KC_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin';
const BRANCH_NAME = 'Mumbai West';

const PERSONAS = [
  { username: 'priya.sales', name: 'Priya Sharma', role: 'SALESPERSON', phone: '+919820010001' },
  { username: 'rahul.manager', name: 'Rahul Verma', role: 'BRANCH_MANAGER', phone: '+919820010002' },
  { username: 'anita.admin', name: 'Anita Rao', role: 'TENANT_ADMIN', phone: '+919820010003' },
  { username: 'vikram.po', name: 'Vikram Iyer', role: 'PRINCIPAL_OFFICER', phone: '+919820010004' },
  { username: 'meera.ops', name: 'Meera Nair', role: 'OPS', phone: '+919820010005' },
];

class ApiError extends Error {
  constructor(label, status, body) {
    super(`${label} -> ${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.status = status;
  }
}

function signHs256(claims) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const message = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc(claims)}`;
  return `${message}.${createHmac('sha256', SECRET).update(message).digest('base64url')}`;
}

function tokenFor({ roles, memberId, orgUnitId, sub }) {
  const now = Math.floor(Date.now() / 1000);
  return signHs256({
    sub: sub ?? `user_${memberId ?? 'seed'}`,
    org: TENANT,
    roles,
    mid: memberId,
    ou: orgUnitId,
    realm: 'customers',
    amr: ['pwd', 'mfa'],
    iat: now,
    exp: now + 3600,
  });
}

const adminToken = tokenFor({ roles: ['TENANT_ADMIN'], memberId: 'admin', sub: 'demo-seed' });

/** Calls the core. Any non-2xx response is an error. */
async function call(token, method, path, body, ifMatch) {
  const headers = { Host: CORE_HOST, Authorization: `Bearer ${token}` };
  if (ifMatch) headers['If-Match'] = ifMatch;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method === 'POST') headers['Idempotency-Key'] = `demo-seed-${randomUUID()}`;
  const res = await fetch(`${CORE_URL}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (res.status < 200 || res.status >= 300) throw new ApiError(`${method} ${path}`, res.status, json ?? text);
  return json;
}

const step = (msg) => console.log(`[seed] ${msg}`);

function istToday() {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function findUnit(node, name) {
  if (node.name === name) return node;
  for (const child of node.children ?? []) {
    const hit = findUnit(child, name);
    if (hit) return hit;
  }
  return undefined;
}

async function createMembers(branchId) {
  const members = {};
  for (const p of PERSONAS) {
    const created = await call(adminToken, 'POST', '/members', {
      displayName: p.name,
      phone: p.phone,
      roles: [p.role],
      ...(p.role === 'SALESPERSON' ? { salespersonType: 'EMPLOYEE' } : {}),
      orgUnitId: branchId,
    });
    members[p.username] = created.id;
    step(`member ${p.name} (${p.role}) -> ${created.id}`);
  }
  return members;
}

async function acceptOrActivate(members) {
  for (const p of PERSONAS) {
    const id = members[p.username];
    await call(tokenFor({ roles: [], memberId: id, sub: `user_${id}` }), 'POST', '/me/invitation-acceptance');
    if (p.role !== 'SALESPERSON') {
      step(`${p.name}: invitation accepted`);
      continue;
    }
    await call(adminToken, 'POST', `/members/${id}/onboarding/evidence`, { key: 'IDENTITY_PAN', evidenceRef: 'ev_IDENTITY_PAN' });
    await call(adminToken, 'PUT', `/members/${id}/insurer-codes/ins_hdfc`, { code: `HD-${id.slice(-6)}` });
    await call(adminToken, 'POST', `/members/${id}/activation`);
    step(`${p.name}: onboarding complete, activated`);
  }
}

async function configureTenant() {
  const lines = [
    ['ins_hdfc_life', 'LIFE'],
    ['ins_icici_pru', 'LIFE'],
    ['ins_star', 'HEALTH'],
    ['ins_icici_lombard', 'GENERAL'],
  ];
  await call(adminToken, 'PUT', '/tenant/tie-ups', {
    tieUps: lines.map(([insurerId, line]) => ({ insurerId, line, effectiveFrom: '2025-01-01' })),
  });
  step(`tie-ups set (${lines.length})`);
  await call(adminToken, 'PUT', '/routing-rules', {
    rules: [
      { id: 'r_all_leads', priority: 1, name: 'All leads to branch', active: true, conditions: [], method: 'ROUND_ROBIN', slaMinutes: 60, onBreach: 'NOTIFY_MANAGER' },
    ],
  });
  step('routing rule set (round robin)');
}

const LEADS = [
  { name: 'Asha Patil', mobile: '+919876100001', product: 'TERM_LIFE', source: 'WEB_FORM', fate: 'new' },
  { name: 'Rohan Deshmukh', mobile: '+919876100002', product: 'HEALTH', source: 'PHONE', fate: 'new' },
  { name: 'Sunita Joshi', mobile: '+919876100003', product: 'HEALTH_FLOATER', source: 'REFERRAL', fate: 'contacted' },
  { name: 'Imran Shaikh', mobile: '+919876100004', product: 'SAVINGS_LIFE', source: 'WALK_IN', fate: 'hot' },
  { name: 'Kavita Menon', mobile: '+919876100005', product: 'CHILD', source: 'EVENT', fate: 'qualified' },
  { name: 'Deepak Chawla', mobile: '+919876100006', product: 'TERM_LIFE', source: 'WEB_FORM', fate: 'discovery' },
  { name: 'Neha Kulkarni', mobile: '+919876100007', product: 'TERM_LIFE', source: 'MICROSITE', fate: 'quote' },
  { name: 'Sanjay Bhatt', mobile: '+919876100008', product: 'MOTOR', source: 'CAMPAIGN', fate: 'lost' },
];

async function captureLead(l) {
  const lead = await call(adminToken, 'POST', '/leads', {
    fullName: l.name,
    mobile: l.mobile,
    productInterest: l.product,
    source: l.source,
    pincode: '400064',
    consent: { granted: true, noticeVersion: 'v2', channels: ['CALL', 'WHATSAPP'], purposes: ['SERVICE', 'MARKETING'] },
  });
  return { id: lead.leadId, partyId: lead.partyId, owner: lead.ownerMemberId };
}

async function contact(seller, id, ref) {
  await call(seller, 'POST', `/leads/${id}/activities`, { kind: 'CALL', outcome: 'CONNECTED', summary: 'Introductory call', clientRef: ref });
  await call(seller, 'POST', `/leads/${id}/stage-transitions`, { to: 'CONTACTED' });
}

async function qualify(seller, id) {
  await call(seller, 'PUT', `/leads/${id}/qualification`, { need: 'PROTECTION', budgetBand: '15K_30K', timeline: 'THIS_MONTH' });
  await call(seller, 'POST', `/leads/${id}/stage-transitions`, { to: 'QUALIFIED' });
}

async function convert(seller, id, product, startStage) {
  const res = await call(seller, 'POST', `/leads/${id}/conversion`, {
    partyChoice: 'LEAD_PARTY',
    productInterest: product,
    expectedPremiumPaise: 2_500_000,
    startStage,
  });
  return res.opportunityId;
}

async function shareQuote(seller, lead, opportunityId, adviceRecordId) {
  const quote = await call(seller, 'POST', '/quotes', {
    opportunityId,
    insuredPartyIds: [lead.partyId],
    requirements: { sumAssured: '1cr' },
    ...(adviceRecordId ? { adviceRecordId } : {}),
  });
  await call(seller, 'POST', `/quotes/${quote.id}/options`, {
    versionId: 'pv_hdfc_term_v1',
    source: 'MANUAL_PORTAL',
    insurerQuoteRef: 'QREF-DEMO-1',
    sumAssuredPaise: 1_000_000_000,
    policyTermYears: 30,
    premium: { basePaise: 1_000_000, ridersPaise: 100_000, taxPaise: 198_000, totalPaise: 1_298_000, frequency: 'ANNUAL' },
    coverage: [{ label: 'Accidental death', value: 'Included' }],
    exclusions: ['Suicide within 12 months'],
    waitingPeriods: [{ label: 'Initial', months: 1 }],
    assumptions: { smoker: 'no' },
    validUntil: addDays(istToday(), 30),
  });
  await call(seller, 'POST', `/quotes/${quote.id}/shares`);
  const readBack = await call(seller, 'GET', `/quotes/${quote.id}`);
  verify(readBack.status === 'SHARED', `quote ${quote.id} status is ${readBack.status}, expected SHARED`);
  step(`quote ${quote.id} shared for ${lead.id}`);
}

async function seedLeads(seller, sellerId) {
  const created = [];
  for (const [i, l] of LEADS.entries()) {
    const lead = await captureLead(l);
    if (lead.owner !== sellerId) throw new Error(`lead ${l.name} routed to ${lead.owner}, expected ${sellerId}`);
    created.push({ ...l, ...lead });
    const ref = `demo-seed-act-${String(i + 1).padStart(2, '0')}`;
    if (['contacted', 'hot', 'qualified', 'discovery', 'quote', 'lost'].includes(l.fate)) await contact(seller, lead.id, ref);
    if (l.fate === 'hot') await call(seller, 'PUT', `/leads/${lead.id}/temperature`, { temperature: 'HOT' });
    if (['qualified', 'discovery', 'quote'].includes(l.fate)) await qualify(seller, lead.id);
    if (l.fate === 'lost') await call(seller, 'POST', `/leads/${lead.id}/stage-transitions`, { to: 'LOST', lostReason: 'PREMIUM_TOO_HIGH' });
    if (l.fate === 'discovery') await convert(seller, lead.id, l.product, 'DISCOVERY');
    if (l.fate === 'quote') await shareQuote(seller, lead, await convert(seller, lead.id, l.product, 'DISCOVERY'));
    step(`lead ${l.name} -> ${l.fate}`);
  }
  return created;
}

async function seedTasks(seller, leads) {
  const now = Date.now();
  const tasks = [
    { lead: leads[0], kind: 'FOLLOW_UP', title: 'Call back about term cover', dueAt: new Date(now + 2 * 3600_000) },
    { lead: leads[2], kind: 'DOCUMENT', title: 'Send health floater brochure', dueAt: new Date(now - 24 * 3600_000) },
    { lead: leads[4], kind: 'FOLLOW_UP', title: 'Share child plan illustration', dueAt: new Date(now + 3 * 24 * 3600_000) },
  ];
  for (const t of tasks) {
    await call(seller, 'POST', '/tasks', {
      subjectType: 'LEAD',
      subjectId: t.lead.id,
      kind: t.kind,
      title: t.title,
      dueAt: t.dueAt.toISOString(),
    });
  }
  step(`tasks created (${tasks.length})`);
}

async function createParty(seller, displayName, mobile) {
  const res = await call(seller, 'POST', '/parties', {
    kind: 'PERSON',
    displayName,
    contacts: [{ channel: 'MOBILE', value: mobile, isPrimary: true }],
  });
  return res.party.id;
}

function policyBody(partyId, today, spec) {
  return {
    proposerPartyId: partyId,
    policyNumber: spec.number,
    line: spec.line,
    insurerId: spec.insurerId,
    insurerName: spec.insurer,
    productName: spec.product,
    mode: spec.mode,
    commercials: {
      category: spec.category,
      line: spec.line,
      businessType: 'FRESH',
      bookedOn: addDays(today, -200),
      commencementDate: addDays(today, -200),
      premiumNetPaise: spec.netPaise,
      premiumTaxPaise: spec.taxPaise,
      premiumGrossPaise: spec.netPaise + spec.taxPaise,
    },
    sumAssuredPaise: spec.sumPaise,
    ...(spec.line === 'LIFE' ? { nextDueDate: addDays(today, spec.dueOffset) } : { renewalDate: addDays(today, spec.dueOffset) }),
    asOf: today,
    // The domain ignores a status update whose asOf is not newer than the stored one, so set it at creation.
    ...(spec.status ? { status: spec.status, statusAsOf: today } : {}),
  };
}

const POLICIES = [
  { holder: 'Mahesh Gupta', mobile: '+919876200001', number: 'DEMO-LIFE-0001', line: 'LIFE', category: 'TERM', insurerId: 'ins_hdfc_life', insurer: 'HDFC Life', product: 'Click 2 Protect Life', mode: 'MONTHLY', netPaise: 100_000, taxPaise: 18_000, sumPaise: 1_000_000_000, dueOffset: 0, tag: 'due today', servicing: 'CLAIM' },
  { holder: 'Pooja Nambiar', mobile: '+919876200002', number: 'DEMO-LIFE-0002', line: 'LIFE', category: 'TERM', insurerId: 'ins_icici_pru', insurer: 'ICICI Prudential', product: 'iProtect Smart', mode: 'ANNUAL', netPaise: 1_800_000, taxPaise: 324_000, sumPaise: 1_000_000_000, dueOffset: -5, tag: 'in grace', status: 'GRACE' },
  { holder: 'Arjun Reddy', mobile: '+919876200003', number: 'DEMO-MOTR-0003', line: 'GENERAL', category: 'MOTOR', insurerId: 'ins_icici_lombard', insurer: 'ICICI Lombard', product: 'Private Car Package', mode: 'ANNUAL', netPaise: 1_250_000, taxPaise: 225_000, sumPaise: 600_000_000, dueOffset: 6, tag: 'upcoming next week' },
  { holder: 'Lakshmi Pillai', mobile: '+919876200004', number: 'DEMO-LIFE-0004', line: 'LIFE', category: 'SAVINGS', insurerId: 'ins_hdfc_life', insurer: 'HDFC Life', product: 'Sanchay Plus', mode: 'QUARTERLY', netPaise: 2_500_000, taxPaise: 0, sumPaise: 500_000_000, dueOffset: -60, tag: 'overdue / lapsed', status: 'LAPSED' },
  { holder: 'Farhan Khan', mobile: '+919876200005', number: 'DEMO-LIFE-0005', line: 'LIFE', category: 'TERM', insurerId: 'ins_icici_pru', insurer: 'ICICI Prudential', product: 'iProtect Smart', mode: 'ANNUAL', netPaise: 1_200_000, taxPaise: 216_000, sumPaise: 750_000_000, dueOffset: 0, tag: 'paid', pay: true },
  { holder: 'Rekha Saxena', mobile: '+919876200006', number: 'DEMO-HLTH-0006', line: 'HEALTH', category: 'HEALTH_INDIVIDUAL', insurerId: 'ins_star', insurer: 'Star Health', product: 'Star Comprehensive', mode: 'ANNUAL', netPaise: 900_000, taxPaise: 162_000, sumPaise: 500_000_000, dueOffset: 0, tag: 'health renewal due today' },
];

async function seedBook(seller) {
  const today = istToday();
  for (const spec of POLICIES) {
    const partyId = await createParty(seller, spec.holder, spec.mobile);
    const policy = await call(seller, 'POST', '/held-policies', policyBody(partyId, today, spec));
    step(`held policy ${spec.number} (${spec.tag}) -> ${policy.id}`);
    if (spec.pay) {
      await call(seller, 'POST', `/held-policies/${policy.id}/payments`, { installmentDue: addDays(today, spec.dueOffset), paidOn: today });
      step(`payment recorded for ${spec.number}`);
    }
    if (spec.servicing) {
      await call(seller, 'POST', `/held-policies/${policy.id}/servicing-requests`, { kind: spec.servicing, followUpOn: addDays(today, 2) });
      step(`servicing request ${spec.servicing} opened for ${spec.number}`);
    }
  }
}

class VerifyError extends Error {}

function verify(condition, message) {
  if (!condition) throw new VerifyError(`read-back failed: ${message}`);
}

const EXTRA_LEADS = [
  { name: 'Vivek Anand', mobile: '+919876100011', product: 'TERM_LIFE', source: 'REFERRAL', fate: 'advice' },
  { name: 'Meenal Kapoor', mobile: '+919876100012', product: 'HEALTH', source: 'WEB_FORM', fate: 'PROPOSAL_COMPLETE' },
  { name: 'Tarun Bose', mobile: '+919876100013', product: 'TERM_LIFE', source: 'PHONE', fate: 'INSURER_PENDING' },
  { name: 'Gita Rao', mobile: '+919876100014', product: 'SAVINGS_LIFE', source: 'WALK_IN', fate: 'LOST' },
];

const DEDUP_PAIR = [
  { name: 'Suresh Nambiar', mobile: '+919876300001' },
  { name: 'Suresh K Nambiar', mobile: '+919876300001' },
];

const STAGE_PATH = ['QUOTE_SHARED', 'PROPOSAL_COMPLETE', 'INSURER_PENDING'];

async function findLeadByName(seller, name) {
  const res = await call(seller, 'GET', `/leads?q=${encodeURIComponent(name)}&limit=10`);
  return res.items.find((l) => l.fullName === name || l.name === name || l.displayName === name);
}

async function moveOpportunity(seller, opportunityId, finalStage) {
  const path = STAGE_PATH.slice(0, STAGE_PATH.indexOf(finalStage) + 1);
  for (const to of path) {
    await call(seller, 'POST', `/opportunities/${opportunityId}/stage-transitions`, { to });
  }
}

async function seedAdvice(seller, lead, opportunityId) {
  const advice = await call(seller, 'POST', '/advice-records', { partyId: lead.partyId, opportunityId, line: 'LIFE', category: 'TERM' });
  await call(seller, 'POST', `/advice-records/${advice.id}/calculator-runs`, {
    calculator: 'protection-gap',
    input: {
      annualIncomePaise: 120_000_000,
      annualExpensesPaise: 60_000_000,
      yearsToRetire: 25,
      liabilitiesPaise: 500_000_000,
      existingCoverPaise: 0,
      liquidAssetsPaise: 100_000_000,
    },
  });
  const versionId = 'pv_hdfc_term_v1';
  await call(seller, 'POST', `/advice-records/${advice.id}/recommendations`, {
    versionId,
    rationale: 'Pure term cover matches the protection gap and the budget.',
  });
  const current = await call(seller, 'GET', `/advice-records/${advice.id}`);
  const etag = `"v${current.version}"`;
  await call(seller, 'PUT', `/advice-records/${advice.id}/customer-choice`, { versionId }, etag);
  await call(seller, 'POST', `/advice-records/${advice.id}/finalisation`);
  const final = await call(seller, 'GET', `/advice-records/${advice.id}`);
  verify(final.status === 'FINALISED', `advice ${advice.id} status is ${final.status}, expected FINALISED`);
  return advice.id;
}

async function seedExtraLead(seller, sellerId, l, i) {
  const lead = await captureLead(l);
  if (lead.owner !== sellerId) throw new Error(`lead ${l.name} routed to ${lead.owner}, expected ${sellerId}`);
  await contact(seller, lead.id, `demo-seed-act-x${String(i + 1).padStart(2, '0')}`);
  await qualify(seller, lead.id);
  const opportunityId = await convert(seller, lead.id, l.product, 'DISCOVERY');
  if (l.fate === 'advice') {
    const adviceId = await seedAdvice(seller, lead, opportunityId);
    await shareQuote(seller, lead, opportunityId, adviceId);
  } else if (l.fate === 'LOST') {
    await call(seller, 'POST', `/opportunities/${opportunityId}/loss`, { reason: 'PREMIUM_TOO_HIGH' });
  } else {
    await moveOpportunity(seller, opportunityId, l.fate);
  }
  step(`extra lead ${l.name} -> opportunity ${opportunityId} (${l.fate})`);
}

async function seedDedupPair(seller) {
  const ids = [];
  for (const p of DEDUP_PAIR) {
    const res = await call(seller, 'POST', '/parties', {
      kind: 'PERSON',
      displayName: p.name,
      contacts: [{ channel: 'MOBILE', value: p.mobile, isPrimary: true }],
      onDuplicate: 'create',
    });
    ids.push(res.party.id);
  }
  step(`duplicate pair created: ${ids.join(', ')}`);
}

function isDedupItem(item) {
  const names = [item.a.displayName, item.b.displayName].sort();
  return names[0] === DEDUP_PAIR[1].name && names[1] === DEDUP_PAIR[0].name;
}

async function seedExtras(seller, sellerId) {
  for (const [i, l] of EXTRA_LEADS.entries()) {
    const existing = await findLeadByName(seller, l.name);
    if (existing) {
      step(`extra lead ${l.name} already exists; skipped`);
      continue;
    }
    await seedExtraLead(seller, sellerId, l, i);
  }
  const queue = await call(adminToken, 'GET', '/duplicates?limit=100');
  if (queue.items.some(isDedupItem)) {
    step('duplicate pair already queued; skipped');
    return;
  }
  await seedDedupPair(seller);
}

async function verifyExtras(seller) {
  const board = await call(seller, 'GET', '/opportunities?view=board');
  const counts = {};
  for (const col of board.columns) counts[col.stage] = col.count;
  for (const stage of ['DISCOVERY', 'QUOTE_SHARED', 'PROPOSAL_COMPLETE', 'INSURER_PENDING']) {
    verify((counts[stage] ?? 0) >= 1, `no opportunity in stage ${stage} (counts ${JSON.stringify(counts)})`);
  }
  verify(board.closed.lost >= 1, `expected >= 1 LOST opportunities, got ${board.closed.lost}`);
  for (const l of EXTRA_LEADS) {
    verify(await findLeadByName(seller, l.name), `lead ${l.name} not found`);
  }
  const queue = await call(adminToken, 'GET', '/duplicates?limit=100');
  verify(queue.items.some(isDedupItem), 'duplicate pair is not in the dedup queue');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  step(`verified: board=${JSON.stringify(counts)} closed=${JSON.stringify(board.closed)} total open=${total} dedupQueue=${queue.items.length}`);
}

async function existingMembers() {
  const res = await call(adminToken, 'GET', '/members?limit=100');
  const members = {};
  for (const p of PERSONAS) {
    const hit = res.items.find((m) => m.displayName === p.name);
    if (!hit) throw new Error(`demo branch exists but member "${p.name}" was not found`);
    members[p.username] = hit.id;
  }
  return members;
}

async function kcFetch(token, method, path, body) {
  const res = await fetch(`${KC_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new ApiError(`Keycloak ${method} ${path}`, res.status, text);
  return text ? JSON.parse(text) : undefined;
}

async function linkKeycloak(members, branchId) {
  const form = new URLSearchParams({ client_id: 'admin-cli', grant_type: 'password', username: KC_ADMIN, password: KC_PASSWORD });
  const res = await fetch(`${KC_URL}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: form });
  const tokenBody = await res.json();
  if (!res.ok) throw new ApiError('Keycloak admin token', res.status, tokenBody);
  const token = tokenBody.access_token;
  for (const p of PERSONAS) {
    const found = await kcFetch(token, 'GET', `/admin/realms/${KC_REALM}/users?username=${encodeURIComponent(p.username)}&exact=true`);
    if (found.length !== 1) throw new Error(`Keycloak user ${p.username} not found in realm ${KC_REALM}`);
    const user = await kcFetch(token, 'GET', `/admin/realms/${KC_REALM}/users/${found[0].id}`);
    user.attributes = { ...(user.attributes ?? {}), mid: [members[p.username]], ou: [branchId] };
    await kcFetch(token, 'PUT', `/admin/realms/${KC_REALM}/users/${found[0].id}`, user);
    step(`keycloak ${p.username}: mid=${members[p.username]} ou=${branchId}`);
  }
}

async function main() {
  const tree = await call(adminToken, 'GET', '/org-units');
  const existing = findUnit(tree.root, BRANCH_NAME);
  let branchId;
  let members;
  if (existing) {
    branchId = existing.id;
    step(`branch "${BRANCH_NAME}" already exists (${branchId}); skipping data creation`);
    members = await existingMembers();
  } else {
    const branch = await call(adminToken, 'POST', '/org-units', { parentId: 'ou_root', kind: 'BRANCH', name: BRANCH_NAME });
    branchId = branch.id;
    step(`org unit "${BRANCH_NAME}" -> ${branchId}`);
    members = await createMembers(branchId);
    await acceptOrActivate(members);
    await configureTenant();
    const priyaId = members['priya.sales'];
    const seller = tokenFor({ roles: ['SALESPERSON'], memberId: priyaId, orgUnitId: branchId });
    const leads = await seedLeads(seller, priyaId);
    await seedTasks(seller, leads);
    await seedBook(seller);
  }
  const seller = tokenFor({ roles: ['SALESPERSON'], memberId: members['priya.sales'], orgUnitId: branchId });
  await seedExtras(seller, members['priya.sales']);
  await verifyExtras(seller);
  await linkKeycloak(members, branchId);
  step(`done: branch=${branchId} members=${JSON.stringify(members)}`);
}

main().catch((err) => {
  console.error(`[seed] FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
