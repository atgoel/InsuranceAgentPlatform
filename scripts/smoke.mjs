#!/usr/bin/env node
/**
 * Boot smoke (WP-E1). Runs the built entry points for real, which unit tests never do.
 *
 *   node scripts/smoke.mjs core   build core, run dist/main.js on a free port, poll GET /health/live
 *   node scripts/smoke.mjs web    build web, serve it with vite preview, load /login in installed Chrome,
 *                 check manifest, sw.js precache and that the service worker activates
 *
 * Prints one summary line on success. On failure prints the reason and the last lines of the child output
 * and exits 1. Child processes are always killed (whole tree on Windows). Needs no database (memory persistence)
 * and no Keycloak. Environment: CHROME_PATH (optional), SMOKE_TIMEOUT_MS [30000].
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 30000);
const WINDOWS_CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BAD_TEXT = ['Something went wrong', 'Sign-in is not configured'];
const children = [];
const tailLines = [];

function remember(chunk) {
  const lines = String(chunk).split('\n').filter((l) => l.trim() !== '');
  tailLines.push(...lines);
  tailLines.splice(0, Math.max(0, tailLines.length - 25));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function killTree(child) {
  if (child.exitCode !== null || !child.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    return;
  }
  child.kill('SIGKILL');
}

function start(cwd, args, env) {
  const options = { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] };
  const child = spawn(process.execPath, args, options);
  child.stdout.on('data', remember);
  child.stderr.on('data', remember);
  children.push(child);
  return child;
}

function run(cwd, command, env = {}) {
  const options = { cwd, shell: true, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 };
  const r = spawnSync(command, options);
  if (r.status !== 0) {
    remember(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
    throw new Error(`build failed: ${command}`);
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(child, probe, what) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`process exited with code ${child.exitCode} before ${what}`);
    if (await probe()) return;
    await sleep(300);
  }
  throw new Error(`timed out after ${TIMEOUT_MS}ms waiting for ${what}`);
}

async function respondsOk(url) {
  try {
    const res = await fetch(url);
    return res.status === 200;
  } catch {
    return false;
  }
}

async function smokeCore() {
  const cwd = join(root, 'apps/core');
  run(cwd, 'npm run build --silent');
  const port = await freePort();
  const env = {
    NODE_ENV: 'test',
    PORT: String(port),
    PERSISTENCE: 'memory',
    AUTH_HS256_SECRET: 'smoke-secret-smoke-secret-smoke-secret',
    ACTOR_PEPPER: 'smoke-pepper',
    DEBUG_TOKEN_SECRET: 'smoke-debug-secret',
  };
  const child = start(cwd, ['dist/main.js'], env);
  const url = `http://127.0.0.1:${port}/health/live`;
  await waitFor(child, () => respondsOk(url), `GET ${url} to return 200`);
  return `core booted, GET /health/live 200 on port ${port}`;
}

async function launchBrowser() {
  const executable = process.env.CHROME_PATH;
  if (executable) return chromium.launch({ executablePath: executable, headless: true });
  try {
    return await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    return chromium.launch({ executablePath: WINDOWS_CHROME, headless: true });
  }
}

async function checkLoginPage(url) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT_MS });
    await page.getByRole('button', { name: 'Sign in' }).waitFor({ timeout: 10000 });
    const text = await page.locator('body').innerText();
    for (const bad of BAD_TEXT) {
      if (text.includes(bad)) throw new Error(`login page shows "${bad}"`);
    }
    if (errors.length > 0) throw new Error(`uncaught page error: ${errors[0]}`);
  } finally {
    await browser.close();
  }
}

async function fetchText(url) {
  const res = await fetch(url);
  if (res.status !== 200) throw new Error(`GET ${url} returned ${res.status}`);
  return res.text();
}

async function checkPwaFiles(base) {
  const manifest = JSON.parse(await fetchText(`${base}/manifest.webmanifest`));
  const sizes = (manifest.icons ?? []).map((i) => `${i.src}|${i.sizes}|${i.purpose ?? ''}`).sort();
  const wantIcons = ['icons/icon-192.png|192x192|', 'icons/icon-512.png|512x512|', 'icons/icon-maskable-512.png|512x512|maskable'];
  const fields = { name: 'Insurance Distribution Platform', start_url: '/m/today', display: 'standalone' };
  for (const [key, want] of Object.entries(fields)) {
    if (manifest[key] !== want) throw new Error(`manifest ${key} is ${JSON.stringify(manifest[key])}, expected "${want}"`);
  }
  if (JSON.stringify(sizes) !== JSON.stringify(wantIcons)) throw new Error(`manifest icons are ${sizes.join(', ')}`);
  const sw = await fetchText(`${base}/sw.js`);
  const urls = [...sw.matchAll(/url:\s*"([^"]+)"/g)].map((m) => m[1]);
  if (urls.length === 0) throw new Error('sw.js precache list is empty');
  const api = urls.find((u) => u.includes('/api/'));
  if (api) throw new Error(`sw.js precaches an API url: ${api}`);
}

async function checkServiceWorker(url) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: TIMEOUT_MS });
    // serviceWorker.ready never settles without a worker, so bound the wait.
    const scope = await page.evaluate(async (ms) => {
      const timeout = new Promise((resolve) => setTimeout(() => resolve(null), ms));
      const ready = await Promise.race([navigator.serviceWorker.ready, timeout]);
      return ready && ready.active ? ready.scope : '';
    }, TIMEOUT_MS);
    if (!scope.endsWith('/')) throw new Error('service worker did not become active on /login');
  } finally {
    await browser.close();
  }
}

async function smokeWeb() {
  const cwd = join(root, 'apps/web');
  const outDir = mkdtempSync(join(tmpdir(), 'iap-smoke-web-'));
  const viteBin = join(root, 'node_modules/vite/bin/vite.js');
  const buildEnv = {
    VITE_OIDC_AUTHORITY: 'http://127.0.0.1:1/realms/iap',
    VITE_OIDC_CLIENT_ID: 'iap-web',
    VITE_DEMO_LOGIN: '1',
  };
  try {
    run(cwd, `"${process.execPath}" "${viteBin}" build --outDir "${outDir}" --emptyOutDir --logLevel error`, buildEnv);
    const port = await freePort();
    const args = [viteBin, 'preview', '--outDir', outDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'];
    const child = start(cwd, args, {});
    const base = `http://127.0.0.1:${port}`;
    await waitFor(child, () => respondsOk(`${base}/login`), `${base}/login to return 200`);
    await checkLoginPage(`${base}/login`);
    await checkPwaFiles(base);
    await checkServiceWorker(`${base}/login`);
    return `web built, /login rendered sign-in UI, manifest + sw.js ok, service worker active on port ${port}`;
  } finally {
    children.forEach(killTree);
    rmSync(outDir, { recursive: true, force: true });
  }
}

const which = process.argv[2];
let exitCode = 0;
try {
  const summary = which === 'core' ? await smokeCore() : await smokeWeb();
  console.log(summary);
} catch (e) {
  exitCode = 1;
  console.log(`smoke ${which} failed: ${e.message}`);
  console.log(tailLines.map((l) => `  | ${l}`).join('\n'));
} finally {
  children.forEach(killTree);
}
process.exit(exitCode);
