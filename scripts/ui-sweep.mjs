#!/usr/bin/env node
/**
 * UI sweep (WP-A4). Signs in as each demo persona through the real Keycloak flow, visits every route of the plan
 * table, screenshots the app next to the prototype artboard and records runtime problems (failed /api calls,
 * console errors, page errors, error text in the page). Output is a report, so the exit code is 0 whenever the sweep
 * completes; it is 1 only when setup fails (stack unreachable, browser missing).
 *
 * Usage:   node scripts/ui-sweep.mjs [--routes /m/today,/crm/leads] [--personas priya.sales,rahul.manager]
 *                                    [--app http://localhost:8080] [--proto http://localhost:8081]
 *                                    [--out reports/ui/<YYYY-MM-DD>] [--ignore-https-errors] [--login-only]
 * --ignore-https-errors  accept self-signed certificates in every browser context and in the Node reachability checks.
 * --login-only           skip the route sweep. Waits for <app>/health/live (nginx proxies /health/ to core), signs in each
 *                        persona and prints one line per persona: final URL, status and Authorization header presence of
 *                        /api/v1/me, /api/v1/tenant and /api/v1/my-work, and the service worker state. One screenshot
 *                        per persona goes to <out>/img/login__<persona>.png.
 * Needs the stack running (web, core, Keycloak realm iap, prototype) and Chrome installed; it starts nothing.
 * Environment: KEYCLOAK_URL [http://localhost:8180]   CHROME_PATH [auto: channel chrome, then Program Files]
 * Output: <out>/index.html, <out>/results.json, <out>/img/*.png. Add reports/ui/ to .gitignore.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const KC_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:8180';
const WINDOWS_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PASSWORD = 'Demo@1234';
const MOBILE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };
const BAD_TEXT = ['Something went wrong', 'Coming in a later module', 'Access Denied', 'Access denied', 'Not found'];

// Duplicated from apps/web/src/lib/auth/demo-personas.ts (scripts must not import from apps).
const PERSONAS = [
  { username: 'priya.sales', role: 'SALESPERSON', home: '/m/today' },
  { username: 'rahul.manager', role: 'BRANCH_MANAGER', home: '/crm/leads' },
  { username: 'anita.admin', role: 'TENANT_ADMIN', home: '/console/tenant' },
  { username: 'vikram.po', role: 'PRINCIPAL_OFFICER', home: '/console/onboarding' },
  { username: 'meera.ops', role: 'OPS', home: '/console/onboarding' },
];

// Route to prototype artboard (plan section 2). null artboard means no artboard exists.
const ROUTES = [
  ['/m/today', 'Main'],
  ['/m/leads', 'LeadsPipeline'],
  ['/m/tasks', 'MyTasks'],
  ['/m/customers', 'Customer360'],
  ['/m/book', 'DueCalendar'],
  ['/m/dues', 'DueCalendar'],
  ['/m/book/import', 'BookImport'],
  ['/m/servicing', 'Customer360'],
  ['/m/calculators', 'Calculators'],
  ['/m/compare', 'NeedsCompare'],
  ['/m/research', 'ResearchAssistant'],
  ['/m/me/plan', 'SoloPlan'],
  ['/crm/leads', 'CRMLeads'],
  ['/crm/pipeline', 'CRMPipeline'],
  ['/crm/tasks', 'CRMTasks'],
  ['/crm/customers', 'CRMCustomers'],
  ['/crm/routing', 'CRMAssignment'],
  ['/crm/import', 'CRMImportDedup'],
  ['/crm/import/duplicates', 'CRMImportDedup'],
  ['/console/tenant', 'TenantSetup'],
  ['/console/brand', 'WhiteLabel'],
  ['/console/custom-fields', 'Configuration'],
  ['/console/onboarding', 'OnboardingHierarchy'],
  ['/console/users-roles', 'UsersRoles'],
  ['/console/ops/tenants', 'OperatorTenants'],
  ['/console/integrations', 'Integrations'],
];

// Detail routes: [list route, link prefix, detail route label, artboard]. An id is found from the first list row link.
const DETAILS = [
  ['/m/leads', '/m/leads/', '/m/leads/:id', 'LeadDetail'],
  ['/crm/leads', '/crm/leads/', '/crm/leads/:id', 'CRMLeadDetail'],
  ['/crm/customers', '/crm/customers/', '/crm/customers/:id', 'CRMCustomerRecord'],
];

const BOOLEAN_FLAGS = ['ignore-https-errors', 'login-only'];
const LOGIN_APIS = ['/api/v1/me', '/api/v1/tenant', '/api/v1/my-work'];
const HEALTH_TIMEOUT_MS = 60000;

function parseArgs(argv) {
  const opts = {
    routes: null,
    personas: null,
    app: 'http://localhost:8080',
    proto: 'http://localhost:8081',
    out: join('reports', 'ui', new Date().toISOString().slice(0, 10)),
    'ignore-https-errors': false,
    'login-only': false,
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    const value = argv[i + 1];
    if (BOOLEAN_FLAGS.includes(key)) {
      opts[key] = true;
      i -= 1;
      continue;
    }
    if (!(key in opts) || value === undefined) {
      throw new Error(`Unknown or incomplete argument: ${argv[i]}`);
    }
    opts[key] = key === 'routes' || key === 'personas' ? value.split(',').filter(Boolean) : value;
  }
  return opts;
}

async function assertReachable(url, label) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    throw new Error(`${label} unreachable at ${url}: start the stack before running the sweep`);
  }
}

async function launchBrowser() {
  const executable = process.env.CHROME_PATH;
  if (executable) {
    return chromium.launch({ executablePath: executable, headless: true });
  }
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ executablePath: WINDOWS_CHROME, headless: true });
  }
}

function viewportFor(route) {
  return route.startsWith('/m/') ? MOBILE : DESKTOP;
}

function slug(text) {
  return text.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// The session lives in sessionStorage, so every visit reuses this one tab (a new tab would be signed out).
async function signIn(context, app, persona) {
  const page = await context.newPage();
  await signInOn(page, app, persona);
  return page;
}

async function signInOn(page, app, persona) {
  await page.setViewportSize(DESKTOP);
  await page.goto(`${app}/login`, { waitUntil: 'load' });
  await page.getByRole('button', { name: /sign in/i }).first().click();
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', persona.username);
  await page.fill('#password', PASSWORD);
  await page.click('#kc-login');
  await page.waitForURL((url) => url.origin === new URL(app).origin && !url.pathname.startsWith('/login'), { timeout: 20000 });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
}

function newRecord() {
  return { httpFailures: [], consoleErrors: [], pageErrors: [] };
}

/** Listens for the page's lifetime and writes into holder.current, which each visit replaces. */
function attachRecorders(page, holder) {
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 400) {
      holder.current.httpFailures.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      holder.current.consoleErrors.push(message.text().slice(0, 300));
    }
  });
  page.on('pageerror', (error) => holder.current.pageErrors.push(String(error.message).slice(0, 300)));
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function visit(page, holder, app, route, label, imgDir, personaName) {
  const record = newRecord();
  holder.current = record;
  await page.setViewportSize(viewportFor(route));
  await page.goto(`${app}${route}`, { waitUntil: 'load' }).catch((error) => record.pageErrors.push(`goto: ${error.message}`));
  await settle(page);
  const text = await page.evaluate(() => document.body.innerText).catch(() => '');
  const file = `${slug(personaName)}__${slug(label)}.png`;
  await page.screenshot({ path: join(imgDir, file) });
  const result = {
    persona: personaName,
    route: label,
    finalUrl: page.url(),
    ...record,
    textHits: BAD_TEXT.filter((needle) => text.includes(needle)),
    image: `img/${file}`,
  };
  return result;
}

async function findDetailRoute(page, app, listRoute, prefix) {
  await page.setViewportSize(viewportFor(listRoute));
  await page.goto(`${app}${listRoute}`, { waitUntil: 'load' }).catch(() => undefined);
  await settle(page);
  const href = await page
    .evaluate((start) => {
      const link = [...document.querySelectorAll('a[href]')]
        .map((a) => (a.getAttribute('href') ?? '').replace(/^#/, ''))
        .find((h) => h.startsWith(start) && h.length > start.length);
      return link ?? null;
    }, prefix)
    .catch(() => null);
  return href ?? clickFirstRow(page, app, prefix);
}

/** Rows that are buttons or clickable cells have no href: click the first one and read the URL it navigates to. */
async function clickFirstRow(page, app, prefix) {
  const target = page.locator('tbody tr td button, tbody tr td a, tbody tr, [role="listitem"] button, main li button').first();
  if ((await target.count()) === 0) {
    return null;
  }
  await target.click({ timeout: 3000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const path = new URL(page.url()).pathname;
  return path.startsWith(prefix) && path.length > prefix.length ? path : null;
}

async function artboardImage(browser, cache, proto, artboard, route, imgDir, ignoreHTTPSErrors) {
  if (!artboard) {
    return null;
  }
  const viewport = viewportFor(route);
  const key = `${artboard}@${viewport.width}`;
  if (cache.has(key)) {
    return cache.get(key);
  }
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors });
  const page = await context.newPage();
  await page.goto(`${proto}/#/${artboard}`, { waitUntil: 'load' }).catch(() => undefined);
  await page.waitForTimeout(1000);
  const file = `artboard__${slug(artboard)}__${viewport.width}.png`;
  await page.screenshot({ path: join(imgDir, file) });
  await context.close();
  cache.set(key, `img/${file}`);
  return `img/${file}`;
}

function flagsOf(result) {
  const flags = [];
  if (result.httpFailures.length > 0) {
    flags.push(`HTTP x${result.httpFailures.length}`);
  }
  if (result.consoleErrors.length > 0) {
    flags.push(`CONSOLE x${result.consoleErrors.length}`);
  }
  if (result.pageErrors.length > 0) {
    flags.push(`PAGEERR x${result.pageErrors.length}`);
  }
  for (const hit of result.textHits) {
    flags.push(`TEXT: ${hit}`);
  }
  return flags;
}

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function summaryTable(results, personas, routes) {
  const head = personas.map((p) => `<th>${esc(p.username)}</th>`).join('');
  const rows = routes.map((route) => {
    const cells = personas.map((p) => {
      const r = results.find((x) => x.persona === p.username && x.route === route);
      const flags = r ? flagsOf(r) : ['skipped'];
      const cls = flags.length > 0 ? 'bad' : 'ok';
      return `<td class="${cls}">${flags.length > 0 ? esc(flags.join(', ')) : 'ok'}</td>`;
    });
    return `<tr><th>${esc(route)}</th>${cells.join('')}</tr>`;
  });
  return `<table><tr><th>route</th>${head}</tr>${rows.join('')}</table>`;
}

function routeSection(route, results, artboards) {
  const rows = results.filter((r) => r.route === route).map((r) => {
    const flags = flagsOf(r);
    const details = [...r.httpFailures, ...r.consoleErrors, ...r.pageErrors].map((d) => `<li>${esc(d)}</li>`).join('');
    const board = artboards.get(route);
    const right = board ? `<img src="${board}" alt="artboard">` : '<p>No artboard</p>';
    return `<div class="row"><div><h4>${esc(r.persona)} - ${esc(r.finalUrl)}</h4><img src="${r.image}" alt="app">
      <p class="${flags.length > 0 ? 'bad' : 'ok'}">${esc(flags.join(', ') || 'no flags')}</p><ul>${details}</ul></div>
      <div><h4>artboard</h4>${right}</div></div>`;
  });
  return `<h3 id="${slug(route)}">${esc(route)}</h3>${rows.join('')}`;
}

function renderHtml(report, personas, routeLabels, artboards) {
  const style = `body{font-family:sans-serif;margin:16px}table{border-collapse:collapse;font-size:12px}
    td,th{border:1px solid #ccc;padding:4px;text-align:left}.bad{background:#fde8e8;color:#8a1010}.ok{color:#176117}
    .row{display:flex;gap:16px;margin-bottom:24px}img{max-width:100%;border:1px solid #999}.row>div{flex:1;min-width:0}`;
  const sections = routeLabels.map((route) => routeSection(route, report.results, artboards)).join('');
  const notes = report.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>UI sweep</title><style>${style}</style></head><body>
    <h1>UI sweep ${esc(report.date)}</h1><ul>${notes}</ul>${summaryTable(report.results, personas, routeLabels)}${sections}</body></html>`;
}

async function sweepPersona(browser, opts, persona, routeList, state) {
  const context = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: opts['ignore-https-errors'] });
  const page = await signIn(context, opts.app, persona);
  const holder = { current: newRecord() };
  attachRecorders(page, holder);
  let visits = 0;
  let flagged = 0;
  const targets = [...routeList];
  for (const [listRoute, prefix, route, artboard] of state.detailSpecs) {
    const href = await findDetailRoute(page, opts.app, listRoute, prefix);
    if (href) {
      targets.push([route, artboard, href]);
    } else {
      state.notes.add(`${route}: no list row link found for ${persona.username}; detail route skipped`);
    }
  }
  for (const [label, artboard, href] of targets) {
    const result = await visit(page, holder, opts.app, href ?? label, label, state.imgDir, persona.username);
    state.results.push(result);
    state.boards.set(label, await artboardImage(browser, state.cache, opts.proto, artboard, label, state.imgDir, opts['ignore-https-errors']));
    visits += 1;
    flagged += flagsOf(result).length > 0 ? 1 : 0;
  }
  await context.close();
  console.log(`${persona.username}: ${visits} visits, ${flagged} flagged`);
}

async function sweepAnonymous(browser, opts, state) {
  const context = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: opts['ignore-https-errors'] });
  const page = await context.newPage();
  const holder = { current: newRecord() };
  attachRecorders(page, holder);
  const result = await visit(page, holder, opts.app, '/login', '/login', state.imgDir, 'anonymous');
  state.results.push(result);
  state.boards.set('/login', await artboardImage(browser, state.cache, opts.proto, 'Start', '/m/login', state.imgDir, opts['ignore-https-errors']));
  await context.close();
  console.log(`anonymous: 1 visits, ${flagsOf(result).length > 0 ? 1 : 0} flagged`);
}

async function waitForHealth(app) {
  const url = `${app}/health/live`;
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await fetchStatus(url);
    if (status === 200) {
      return;
    }
    await new Promise((done) => setTimeout(done, 2000));
  }
  throw new Error(`${url} did not return 200 within ${HEALTH_TIMEOUT_MS / 1000}s`);
}

async function fetchStatus(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return response.status;
  } catch {
    return 0;
  }
}

/** Records, per watched API path, the response status and whether the request carried an Authorization header. */
function watchLoginApis(page) {
  const seen = new Map();
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (LOGIN_APIS.includes(path)) {
      const hasAuth = 'authorization' in response.request().headers();
      seen.set(path, { status: response.status(), hasAuth });
    }
  });
  return seen;
}

async function serviceWorkerState(page) {
  return page
    .evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return 'none';
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const controller = navigator.serviceWorker.controller ? 'controlled' : 'uncontrolled';
      if (!registration) {
        return 'none';
      }
      const worker = registration.active ?? registration.waiting ?? registration.installing;
      return `${controller}, ${worker ? worker.state : 'no-worker'}`;
    })
    .catch(() => 'none');
}

function describeApi(path, seen) {
  const entry = seen.get(path);
  const name = path.replace('/api/v1/', '');
  return entry ? `${name}=${entry.status} auth=${entry.hasAuth ? 'yes' : 'no'}` : `${name}=- auth=-`;
}

async function loginOnlyPersona(browser, opts, persona, imgDir) {
  const context = await browser.newContext({ viewport: DESKTOP, ignoreHTTPSErrors: opts['ignore-https-errors'] });
  const page = await context.newPage();
  const seen = watchLoginApis(page);
  await signInOn(page, opts.app, persona);
  await settle(page);
  const sw = await serviceWorkerState(page);
  await page.screenshot({ path: join(imgDir, `login__${slug(persona.username)}.png`) });
  const apis = LOGIN_APIS.map((path) => describeApi(path, seen)).join(' ');
  console.log(`${persona.username} url=${page.url()} ${apis} sw=${sw}`);
  await context.close();
}

async function runLoginOnly(opts, personas, imgDir) {
  await waitForHealth(opts.app);
  const browser = await launchBrowser();
  try {
    for (const persona of personas) {
      await loginOnlyPersona(browser, opts, persona, imgDir);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts['ignore-https-errors']) {
    // Node fetch (reachability and health checks) must accept the same self-signed certificates as the browser.
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  }
  await assertReachable(`${opts.app}/login`, 'Web app');
  await assertReachable(`${KC_URL}/realms/iap`, 'Keycloak');
  const personas = PERSONAS.filter((p) => !opts.personas || opts.personas.includes(p.username));
  if (opts['login-only']) {
    const loginImgDir = join(resolve(opts.out), 'img');
    mkdirSync(loginImgDir, { recursive: true });
    await runLoginOnly(opts, personas, loginImgDir);
    return;
  }
  const routeList = ROUTES.filter(([route]) => !opts.routes || opts.routes.includes(route));
  const detailSpecs = opts.routes ? DETAILS.filter(([, , label]) => opts.routes.includes(label)) : DETAILS;
  const out = resolve(opts.out);
  const imgDir = join(out, 'img');
  mkdirSync(imgDir, { recursive: true });
  const browser = await launchBrowser();
  const state = { results: [], notes: new Set(), boards: new Map(), cache: new Map(), imgDir, detailSpecs };
  const started = Date.now();
  try {
    for (const persona of personas) {
      await sweepPersona(browser, opts, persona, routeList, state);
    }
    if (!opts.routes || opts.routes.includes('/login')) {
      await sweepAnonymous(browser, opts, state);
    }
  } finally {
    await browser.close();
  }
  const labels = [...new Set(state.results.map((r) => r.route))];
  const report = { date: new Date().toISOString(), app: opts.app, proto: opts.proto, notes: [...state.notes], results: state.results };
  writeFileSync(join(out, 'results.json'), JSON.stringify(report, null, 2));
  writeFileSync(join(out, 'index.html'), renderHtml(report, [...personas, { username: 'anonymous' }], labels, state.boards));
  console.log(`Done in ${Math.round((Date.now() - started) / 1000)}s. Report: ${join(out, 'index.html')}`);
}

main().catch((error) => {
  console.error(`ui-sweep failed: ${error.message}`);
  process.exit(1);
});
