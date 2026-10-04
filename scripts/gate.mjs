#!/usr/bin/env node
/**
 * Quiet quality gate: runs typecheck, lint and tests and prints one line per step; on failure prints only
 * the failing tests/errors (trimmed). Keeps agent context small.
 *
 *   node scripts/gate.mjs core [jest paths…]     typecheck + eslint + jest (unit/HTTP)
 *   node scripts/gate.mjs int  [jest paths…]     Postgres integration tests (needs the dev DB, see CLAUDE.md)
 *   node scripts/gate.mjs web  [vitest paths…]   typecheck + eslint + vitest
 *   node scripts/gate.mjs smoke                  boot smoke: run built core (/health/live), load built web /login in Chrome
 *   node scripts/gate.mjs all                    core + web + int + smoke
 * Options: --tests-only (skip typecheck/lint), --max=N (failure lines shown, default 60)
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const target = args.shift() ?? 'all';
const testsOnly = args.includes('--tests-only');
const max = Number(args.find((a) => a.startsWith('--max='))?.slice(6) ?? 60);
const paths = args.filter((a) => !a.startsWith('--'));
const DB = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://iap_app:iap@localhost:5433/iap',
  MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL ?? 'postgres://iap_owner:iap@localhost:5433/iap',
};

const strip = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
let failed = false;

function step(label, cwd, cmd, summarise, failures, env = {}) {
  const started = Date.now();
  const r = spawnSync(cmd, { cwd: join(root, cwd), shell: true, encoding: 'utf8', env: { ...process.env, ...env, FORCE_COLOR: '0' }, maxBuffer: 64 * 1024 * 1024 });
  const out = strip(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  const ok = r.status === 0;
  failed ||= !ok;
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(16)} ${summarise(out, ok)} (${secs}s)`);
  if (!ok) {
    const lines = failures(out);
    console.log(lines.slice(0, max).map((l) => `      ${l}`).join('\n'));
    if (lines.length > max) console.log(`      … ${lines.length - max} more lines (raise --max)`);
  }
}

const tscSummary = (out, ok) => (ok ? 'no type errors' : `${(out.match(/error TS\d+/g) ?? []).length} type errors`);
const tscFailures = (out) => out.split('\n').filter((l) => /error TS\d+/.test(l));
const eslintSummary = (out) => out.match(/✖ \d+ problems? \(\d+ errors?, \d+ warnings?\)/)?.[0] ?? 'clean';
const eslintFailures = (out) => {
  const lines = out.split('\n');
  const keep = [];
  let file = '';
  for (const l of lines) {
    if (/^[A-Za-z]:\|^\//.test(l.trim())) file = l.trim();
    else if (/\berror\b/.test(l)) keep.push(`${file.replace(/.*[\/](src|test)[\/]/, '$1/')} ${l.trim()}`);
  }
  return keep;
};
const jestSummary = (out) => out.match(/^Tests:.*$/m)?.[0] ?? out.trim().split('\n').slice(-3).join(' | ');
const jestFailures = (out) => {
  const lines = out.split('\n');
  const keep = [];
  let inBlock = false;
  for (const l of lines) {
    if (/^\s*● /.test(l)) { inBlock = true; keep.push(l.trim()); continue; }
    if (/^(Test Suites:|Tests:|Snapshots:|Time:)/.test(l)) inBlock = false;
    if (inBlock && l.trim() && !/^\s+at /.test(l) && !/^\s*\d+ \|/.test(l) && !/^\s*\|/.test(l)) keep.push(`  ${l.trim()}`);
  }
  return keep.length ? keep : lines.filter((l) => /FAIL|Error/.test(l)).slice(0, 20);
};
const vitestSummary = (out) => out.match(/^\s*Tests\s+.*$/m)?.[0].trim() ?? out.trim().split('\n').slice(-3).join(' | ');
const vitestFailures = (out) => {
  const lines = out.split('\n');
  const keep = [];
  let inBlock = false;
  for (const l of lines) {
    if (/^\s*(FAIL|×)\s/.test(l)) { inBlock = true; keep.push(l.trim()); continue; }
    if (/^\s*(Test Files|Tests)\s/.test(l)) inBlock = false;
    if (inBlock && /(Error|Expected|Received|Unable to find|\+ |- )/.test(l)) keep.push(`  ${l.trim()}`);
  }
  return keep;
};
const quoted = paths.map((p) => `"${p}"`).join(' ');

if (target === 'core' || target === 'all') {
  if (!testsOnly) {
    step('core typecheck', 'apps/core', 'npx tsc --noEmit -p tsconfig.json', tscSummary, tscFailures);
    step('core lint', 'apps/core', 'npx eslint src test', eslintSummary, eslintFailures);
  }
  step('core tests', 'apps/core', `npx jest --silent ${quoted}`, jestSummary, jestFailures);
}
if (target === 'web' || target === 'all') {
  if (!testsOnly) {
    step('web typecheck', 'apps/web', 'npx tsc --noEmit -p tsconfig.json', tscSummary, tscFailures);
    step('web lint', 'apps/web', 'npx eslint src', eslintSummary, eslintFailures);
  }
  step('web tests', 'apps/web', `npx vitest run --reporter=default --silent ${quoted}`, vitestSummary, vitestFailures);
}
if (target === 'int' || target === 'all') {
  step('pg integration', 'apps/core', `npx jest --config jest.int.config.js --silent ${quoted}`, jestSummary, jestFailures, DB);
}
if (target === 'smoke' || target === 'all') {
  const smokeSummary = (out, ok) => {
    const lines = out.trim().split('\n');
    return ok ? (lines.pop() ?? '') : (lines.find((l) => /^smoke \w+ failed/.test(l)) ?? 'failed');
  };
  const smokeFailures = (out) => out.trim().split('\n').slice(1);
  step('smoke core', '.', 'node scripts/smoke.mjs core', smokeSummary, smokeFailures);
  step('smoke web', '.', 'node scripts/smoke.mjs web', smokeSummary, smokeFailures);
}
process.exit(failed ? 1 : 0);
