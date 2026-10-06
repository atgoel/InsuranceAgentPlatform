#!/usr/bin/env node
/**
 * Switch the dev stack between phone (HTTPS) and local mode. Never builds images. Quiet output: one line per step.
 *
 *   node scripts/stack-mode.mjs phone|local [--dry-run]
 *
 * phone needs IAP_PHONE_HOST in the environment (docs/dev/phone-https.md).
 */
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const mode = args.find((arg) => !arg.startsWith('--'));
const dryRun = args.includes('--dry-run');
const COMPOSE = ['compose', '-f', 'infra/dev/docker-compose.yml'];

function fail(message, detail) {
  console.log(`FAIL  ${message}`);
  if (detail) {
    console.log(detail);
  }
  process.exit(1);
}

function usage() {
  console.log('Usage: node scripts/stack-mode.mjs phone|local [--dry-run]');
  process.exit(1);
}

function phoneSteps(host) {
  return [
    {
      name: 'compose up (phone)',
      cmd: 'docker',
      args: [...COMPOSE, '--env-file', 'infra/dev/phone.env', '--profile', 'app', '--profile', 'phone', 'up', '-d', '--no-build', '--wait'],
    },
    {
      name: 'login sweep (phone)',
      cmd: 'node',
      args: ['scripts/ui-sweep.mjs', '--login-only', '--app', `https://${host}`, '--ignore-https-errors'],
    },
  ];
}

function localSteps() {
  return [
    {
      name: 'compose up (local)',
      cmd: 'docker',
      args: [...COMPOSE, '--profile', 'app', 'up', '-d', '--no-build', '--wait'],
    },
    {
      name: 'remove phone services',
      cmd: 'docker',
      args: [...COMPOSE, '--profile', 'app', '--profile', 'phone', 'rm', '-sf', 'caddy', 'keycloak-phone'],
    },
    { name: 'login sweep (local)', cmd: 'node', args: ['scripts/ui-sweep.mjs', '--login-only'] },
  ];
}

function runStep(step) {
  const line = `${step.cmd} ${step.args.join(' ')}`;
  if (dryRun) {
    console.log(`DRY   ${step.name}: ${line}`);
    return;
  }
  const env = { ...process.env, MSYS_NO_PATHCONV: '1' };
  const result = spawnSync(step.cmd, step.args, { cwd: root, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    const stderr = (result.stderr || String(result.error)).trim().split('\n').slice(-5).join('\n');
    fail(step.name, stderr);
  }
  console.log(`PASS  ${step.name}`);
}

if (mode !== 'phone' && mode !== 'local') {
  usage();
}
let steps = localSteps();
if (mode === 'phone') {
  const host = (process.env.IAP_PHONE_HOST || '').trim();
  if (!host) {
    fail('IAP_PHONE_HOST is not set');
  }
  steps = phoneSteps(host);
}
for (const step of steps) {
  runStep(step);
}
