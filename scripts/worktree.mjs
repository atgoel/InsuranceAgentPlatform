#!/usr/bin/env node
/**
 * One git worktree per session (WP-E2, BUG-17). Quiet output: one line per step.
 *
 *   node scripts/worktree.mjs new <task> [--base <ref>] [--dry-run]   worktree ../IMF-<task> on branch ui/<task>, npm ci, deps check
 *   node scripts/worktree.mjs check [path]                            deps check only (default: current repo root)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const command = args.shift();
const dryRun = args.includes('--dry-run');
const DEPS = ['vitest', 'jest'];

function fail(message) {
  console.log(`FAIL  ${message}`);
  process.exit(1);
}

function run(cmd, cmdArgs, cwd, shell = false) {
  return spawnSync(cmd, cmdArgs, { cwd, shell, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function optionValue(name) {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }
  return args[index + 1];
}

function positional() {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--base') {
      i += 1;
    } else if (!args[i].startsWith('--')) {
      values.push(args[i]);
    }
  }
  return values;
}

function missingDeps(folder) {
  return DEPS.filter((dep) => !existsSync(join(folder, 'node_modules', dep)));
}

function checkDeps(folder) {
  const missing = missingDeps(folder);
  if (missing.length > 0) {
    console.log(`FAIL  deps ${DEPS.join(',')} missing: ${missing.join(',')} - run npm ci in ${folder}`);
    return false;
  }
  console.log(`PASS  deps ${DEPS.join(',')}`);
  return true;
}

function lastLines(result) {
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
  return text.split('\n').slice(-5).join('\n      ');
}

function newWorktree() {
  const task = positional()[0];
  if (!task || !/^[a-z0-9-]+$/.test(task)) {
    fail('task must match /^[a-z0-9-]+$/ (usage: worktree.mjs new <task> [--base <ref>])');
  }
  const base = optionValue('--base') ?? 'HEAD';
  const folder = resolve(root, '..', `IMF-${task}`);
  const branch = `ui/${task}`;
  const addArgs = ['worktree', 'add', folder, '-b', branch, base];
  if (dryRun) {
    console.log(`DRY   git ${addArgs.join(' ')}`);
    console.log(`DRY   npm ci (in ${folder})`);
    console.log(`DRY   check node_modules/{${DEPS.join(',')}} in ${folder}`);
    return;
  }
  if (existsSync(folder)) {
    fail(`worktree folder already exists: ${folder}`);
  }
  const branchCheck = run('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], root);
  if (branchCheck.status === 0) {
    fail(`branch already exists: ${branch}`);
  }
  const add = run('git', addArgs, root);
  if (add.status !== 0) {
    console.log('FAIL  worktree add');
    fail(lastLines(add));
  }
  console.log(`PASS  worktree ${branch} from ${base}`);
  const started = Date.now();
  const install = run('npm ci', [], folder, true);
  const secs = ((Date.now() - started) / 1000).toFixed(0);
  if (install.status !== 0) {
    console.log(`FAIL  npm ci (${secs}s)`);
    console.log(`      ${lastLines(install)}`);
    process.exit(1);
  }
  console.log(`PASS  npm ci (${secs}s)`);
  if (!checkDeps(folder)) {
    process.exit(1);
  }
  console.log(folder);
}

function checkWorktree() {
  const folder = resolve(positional()[0] ?? root);
  if (!existsSync(folder)) {
    fail(`folder not found: ${folder}`);
  }
  if (!checkDeps(folder)) {
    process.exit(1);
  }
  console.log(`${basename(folder)} ready`);
}

if (command === 'new') {
  newWorktree();
} else if (command === 'check') {
  checkWorktree();
} else {
  fail('usage: worktree.mjs new <task> [--base <ref>] [--dry-run] | check [path]');
}
