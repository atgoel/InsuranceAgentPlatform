#!/usr/bin/env node
/**
 * Build the dev Docker images from a CLEAN checkout of a committed ref, never the working tree (WP-E2, BUG-17).
 *
 *   node scripts/build-images.mjs [ref] [--dry-run]     ref defaults to HEAD
 *
 * Produces iap-core:<sha12> and iap-web:<sha12> (plus the moving :dev tags that compose uses).
 */
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ref = args.find((a) => !a.startsWith('--')) ?? 'HEAD';

function run(cmd, cmdArgs, options = {}) {
  return spawnSync(cmd, cmdArgs, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}

function fail(message) {
  console.log(`FAIL  ${message}`);
  process.exit(1);
}

function tail(result) {
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  return text.split('\n').slice(-15).join('\n      ');
}

function resolveSha() {
  const result = run('git', ['rev-parse', '--verify', `${ref}^{commit}`]);
  if (result.status !== 0) {
    fail(`cannot resolve ref ${ref}`);
  }
  return result.stdout.trim();
}

function warnDirty() {
  const status = run('git', ['status', '--porcelain']);
  const count = status.stdout.split('\n').filter((line) => line.trim() !== '').length;
  if (count > 0) {
    console.log(`WARN  excluded: ${count} uncommitted paths`);
  }
}

function step(label, cmd, cmdArgs) {
  const started = Date.now();
  const result = run(cmd, cmdArgs);
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (result.status !== 0) {
    console.log(`FAIL  ${label} (${secs}s)`);
    console.log(`      ${tail(result)}`);
    return false;
  }
  console.log(`PASS  ${label} (${secs}s)`);
  return true;
}

function printNext() {
  console.log('next  docker compose -f infra/dev/docker-compose.yml --profile app up -d --no-build core web');
  console.log('warn  do not use "up --build": it would rebuild from the working tree, including uncommitted files');
}

function main() {
  const sha = resolveSha();
  const short = sha.slice(0, 12);
  const tmp = join(tmpdir(), `iap-build-${short}`);
  const compose = join(tmp, 'infra', 'dev', 'docker-compose.yml');
  const commands = [
    ['worktree', 'git', ['worktree', 'add', '--detach', tmp, sha]],
    ['compose build', 'docker', ['compose', '-f', compose, '--profile', 'app', 'build', 'migrate', 'web']],
    ['tag core', 'docker', ['tag', 'iap-core:dev', `iap-core:${short}`]],
    ['tag web', 'docker', ['tag', 'iap-web:dev', `iap-web:${short}`]],
  ];
  warnDirty();
  if (dryRun) {
    for (const [label, cmd, cmdArgs] of commands) {
      console.log(`DRY   ${label}: ${cmd} ${cmdArgs.join(' ')}`);
    }
    console.log(`DRY   cleanup: git worktree remove --force ${tmp}`);
    console.log(`sha   ${sha}`);
    printNext();
    return;
  }
  let ok = true;
  try {
    for (const [label, cmd, cmdArgs] of commands) {
      if (ok) {
        ok = step(label, cmd, cmdArgs);
      }
    }
  } finally {
    const removed = run('git', ['worktree', 'remove', '--force', tmp]);
    console.log(`${removed.status === 0 ? 'PASS' : 'FAIL'}  remove temp worktree ${tmp}`);
  }
  if (!ok) {
    process.exit(1);
  }
  console.log(`sha   ${sha}`);
  console.log(`built iap-core:${short} iap-web:${short}`);
  printNext();
}

main();
