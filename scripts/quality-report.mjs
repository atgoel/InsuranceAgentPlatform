#!/usr/bin/env node
/**
 * Module quality gate: runs tests with coverage, lint and typecheck scoped to one
 * module, checks spec traceability (acceptance criteria IDs referenced by tests)
 * and merges the reviewer agent's score. Writes docs/quality/<module>.md and
 * refreshes docs/quality/README.md (the scoreboard).
 *
 * Usage: node scripts/quality-report.mjs M01
 * Module paths come from docs/quality/modules.json.
 * Scoring rubric: docs/spec/01-engineering-standards.md §7.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import istanbulCoverage from 'istanbul-lib-coverage';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CORE = join(ROOT, 'apps/core');
const WEB = join(ROOT, 'apps/web');
const QDIR = join(ROOT, 'docs/quality');

const id = process.argv[2];
const registry = JSON.parse(readFileSync(join(QDIR, 'modules.json'), 'utf8'));
const mod = registry.modules.find((m) => m.id === id);
if (!mod) {
  process.stderr.write(`Unknown module ${id}. Known: ${registry.modules.map((m) => m.id).join(', ')}\n`);
  process.exit(2);
}

function run(cmd, cwd, env = {}) {
  try {
    return { ok: true, out: execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

function walk(dir, pred, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist' || f === 'coverage') continue;
    if (statSync(p).isDirectory()) walk(p, pred, acc);
    else if (pred(p)) acc.push(p);
  }
  return acc;
}

const pct = (c) => (c && typeof c.pct === 'number' ? c.pct : 0);

// ---------- backend ----------
function backend() {
  if (!mod.core?.length) return null;
  const globs = mod.core.map((p) => `--collectCoverageFrom='${p}/**/*.ts'`).join(' ');
  const exclude = "--collectCoverageFrom='!**/*.module.ts' --collectCoverageFrom='!**/index.ts' --collectCoverageFrom='!**/*.spec.ts'";
  const testPaths = mod.coreTests.join(' ');
  const t = run(`npx jest ${testPaths} --coverage ${globs} ${exclude} --coverageReporters=json --coverageReporters=json-summary --coverageThreshold='{}' --json --outputFile=coverage/jest-results.json`, CORE);
  const results = existsSync(join(CORE, 'coverage/jest-results.json')) ? JSON.parse(readFileSync(join(CORE, 'coverage/jest-results.json'), 'utf8')) : {};
  let cov = existsSync(join(CORE, 'coverage/coverage-summary.json')) ? JSON.parse(readFileSync(join(CORE, 'coverage/coverage-summary.json'), 'utf8')).total : {};
  if (mod.integrationTests?.length) {
    const pgDir = `coverage/${id}-pg`;
    const pg = run(`npx jest --config jest.int.config.js ${mod.integrationTests.join(' ')} --coverage ${globs} ${exclude} --coverageReporters=json --coverageReporters=json-summary --coverageDirectory=${pgDir} --coverageThreshold='{}' --json --outputFile=${pgDir}/jest-results.json`, CORE, {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://iap_app:iap@localhost:5433/iap',
      MIGRATION_DATABASE_URL: process.env.MIGRATION_DATABASE_URL ?? 'postgres://iap_owner:iap@localhost:5433/iap',
    });
    t.ok &&= pg.ok;
    t.out += pg.out;
    const pgResultsPath = join(CORE, pgDir, 'jest-results.json');
    if (existsSync(pgResultsPath)) {
      const pgResults = JSON.parse(readFileSync(pgResultsPath, 'utf8'));
      for (const key of ['numTotalTests', 'numPassedTests', 'numFailedTests', 'numTotalTestSuites']) results[key] = (results[key] ?? 0) + (pgResults[key] ?? 0);
    }
    const merged = istanbulCoverage.createCoverageMap({});
    for (const directory of ['coverage', pgDir]) {
      const raw = join(CORE, directory, 'coverage-final.json');
      if (existsSync(raw)) merged.merge(JSON.parse(readFileSync(raw, 'utf8')));
    }
    cov = merged.getCoverageSummary().toJSON();
    writeFileSync(join(CORE, 'coverage/coverage-summary.json'), JSON.stringify({ total: cov, ...Object.fromEntries(merged.files().map((file) => [file, merged.fileCoverageFor(file).toSummary().toJSON()])) }));
  }
  const lint = run(`npx eslint ${mod.core.join(' ')} ${mod.coreTests.join(' ')} -f json`, CORE);
  const lintJson = safeJson(lint.out);
  const tc = run('npx tsc --noEmit -p tsconfig.json', CORE);
  return summarise('Backend (apps/core)', t, results, cov, lintJson, tc);
}

// ---------- frontend ----------
function frontend() {
  if (!mod.web?.length) return null;
  const inc = mod.web.map((p) => `--coverage.include='${p}/**/*.{ts,tsx}'`).join(' ');
  const t = run(`npx vitest run ${mod.webTests.join(' ')} --coverage ${inc} --coverage.thresholds.lines=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.statements=0 --reporter=json --outputFile=coverage/vitest-results.json`, WEB);
  const results = existsSync(join(WEB, 'coverage/vitest-results.json')) ? JSON.parse(readFileSync(join(WEB, 'coverage/vitest-results.json'), 'utf8')) : {};
  const cov = existsSync(join(WEB, 'coverage/coverage-summary.json')) ? JSON.parse(readFileSync(join(WEB, 'coverage/coverage-summary.json'), 'utf8')).total : {};
  const lint = run(`npx eslint ${mod.web.join(' ')} -f json`, WEB);
  const tc = run('npx tsc --noEmit -p tsconfig.json', WEB);
  return summarise('Frontend (apps/web)', t, results, cov, safeJson(lint.out), tc);
}

function safeJson(s) {
  const i = s.indexOf('[');
  try { return JSON.parse(s.slice(i)); } catch { return []; }
}

function summarise(name, t, results, cov, lintJson, tc) {
  const errors = lintJson.reduce((a, f) => a + (f.errorCount ?? 0), 0);
  const warnings = lintJson.reduce((a, f) => a + (f.warningCount ?? 0), 0);
  const ruleHits = {};
  for (const f of lintJson) for (const m of f.messages ?? []) ruleHits[m.ruleId ?? 'parse'] = (ruleHits[m.ruleId ?? 'parse'] ?? 0) + 1;
  return {
    name,
    testsOk: t.ok,
    total: results.numTotalTests ?? 0,
    passed: results.numPassedTests ?? 0,
    failed: results.numFailedTests ?? 0,
    suites: results.numTotalTestSuites ?? 0,
    lines: pct(cov.lines), branches: pct(cov.branches), functions: pct(cov.functions), statements: pct(cov.statements),
    lintErrors: errors, lintWarnings: warnings, ruleHits,
    typecheckOk: tc.ok, typecheckOut: tc.ok ? '' : tc.out.split('\n').slice(0, 15).join('\n'),
  };
}

// ---------- spec traceability ----------
function traceability() {
  const spec = readFileSync(join(ROOT, mod.spec), 'utf8');
  const acIds = [...new Set(spec.match(new RegExp(`AC-${mod.id}-\\d+`, 'g')) ?? [])];
  const testFiles = [
    ...mod.coreTests.flatMap((p) => walk(join(CORE, p), (f) => /\.spec\.ts$/.test(f))),
    ...(mod.webTests ?? []).flatMap((p) => walk(join(WEB, p), (f) => /\.test\.tsx?$/.test(f))),
  ];
  const corpus = testFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
  const covered = acIds.filter((a) => new RegExp(`${a}\\b`).test(corpus));
  return { acIds, covered, missing: acIds.filter((a) => !covered.includes(a)), testFiles: testFiles.map((f) => relative(ROOT, f)) };
}

// ---------- review ----------
function review() {
  const p = join(QDIR, `${mod.id}.review.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

// ---------- score (rubric §7) ----------
function score(parts, trace, rev) {
  const present = parts.filter(Boolean);
  const avg = (k) => present.reduce((a, p) => a + p[k], 0) / Math.max(present.length, 1);
  const covAvg = (avg('lines') + avg('branches') + avg('functions')) / 3;
  const coverage = Math.min(35, (covAvg / 90) * 35);
  const lintErr = present.reduce((a, p) => a + p.lintErrors, 0);
  const lintWarn = present.reduce((a, p) => a + p.lintWarnings, 0);
  const lint = Math.max(0, 15 - 3 * lintErr - 0.5 * lintWarn);
  const types = present.every((p) => p.typecheckOk) ? 10 : 0;
  const traceScore = trace.acIds.length ? (trace.covered.length / trace.acIds.length) * 15 : 0;
  const reviewScore = rev ? (rev.score / 10) * 25 : 0;
  let total = coverage + lint + types + traceScore + reviewScore;
  const allPass = present.every((p) => p.testsOk && p.failed === 0);
  if (!allPass) total = Math.min(total, 50);
  const r = (n) => Math.round(n * 10) / 10;
  return { total: r(total), coverage: r(coverage), lint: r(lint), types, trace: r(traceScore), review: r(reviewScore), covAvg: r(covAvg), allPass };
}

function grade(t) {
  if (t >= 90) return 'A';
  if (t >= 80) return 'B';
  if (t >= 70) return 'C';
  return 'D';
}

function render(parts, trace, rev, s) {
  const now = new Date().toISOString().slice(0, 10);
  const rows = parts.filter(Boolean).map((p) =>
    `| ${p.name} | ${p.passed}/${p.total} ${p.failed ? '❌' : '✅'} | ${p.lines}% | ${p.branches}% | ${p.functions}% | ${p.statements}% | ${p.lintErrors} / ${p.lintWarnings} | ${p.typecheckOk ? '✅' : '❌'} |`).join('\n');
  const rules = parts.filter(Boolean).map((p) => Object.entries(p.ruleHits).map(([k, v]) => `${p.name}: \`${k}\` × ${v}`).join(', ')).filter(Boolean).join('; ') || 'none';
  const tcFail = parts.filter((p) => p && !p.typecheckOk).map((p) => `\n**${p.name} typecheck output**\n\`\`\`\n${p.typecheckOut}\n\`\`\``).join('\n');
  const findings = rev?.findings?.length
    ? rev.findings.map((f) => `| ${f.severity} | ${f.area} | ${f.summary} | ${f.status} |`).join('\n')
    : '| — | — | No findings recorded | — |';
  return `# ${mod.id} · ${mod.name} — quality report

Generated ${now} by \`scripts/quality-report.mjs ${mod.id}\`. Spec: [\`${mod.spec}\`](../../${mod.spec}).

## Score: **${s.total} / 100 (${grade(s.total)})** ${s.allPass ? '' : '— capped at 50 because tests are failing'}

| Component | Weight | Score | Basis |
|---|---|---|---|
| Coverage | 35 | ${s.coverage} | mean of line/branch/function coverage ${s.covAvg}% (full marks at 90%) |
| Lint & clean-code rules | 15 | ${s.lint} | −3 per error, −0.5 per warning |
| Type safety | 10 | ${s.types} | \`tsc --noEmit\` strict |
| Spec traceability | 15 | ${s.trace} | ${trace.covered.length}/${trace.acIds.length} acceptance criteria referenced by tests |
| Independent review | 25 | ${s.review} | reviewer agent score ${rev ? rev.score : 'n/a'}/10 |

## Tests and coverage

| Scope | Tests | Lines | Branches | Functions | Statements | Lint err / warn | Types |
|---|---|---|---|---|---|---|---|
${rows}

Lint rule hits: ${rules}
${tcFail}

## Spec traceability

${trace.missing.length ? `Acceptance criteria without a test: ${trace.missing.join(', ')}` : 'Every acceptance criterion in the spec is referenced by at least one test.'}

## Review findings

${rev ? `Reviewer summary: ${rev.summary}\n` : ''}
| Severity | Area | Finding | Status |
|---|---|---|---|
${findings}
`;
}

function updateBoard(s) {
  const boardPath = join(QDIR, 'scoreboard.json');
  const board = existsSync(boardPath) ? JSON.parse(readFileSync(boardPath, 'utf8')) : {};
  board[mod.id] = { name: mod.name, ...s, date: new Date().toISOString().slice(0, 10) };
  writeFileSync(boardPath, JSON.stringify(board, null, 2) + '\n');
  const rows = registry.modules.map((m) => {
    const b = board[m.id];
    return b
      ? `| [${m.id}](${m.id}.md) | ${m.name} | **${b.total}** (${grade(b.total)}) | ${b.covAvg}% | ${b.trace}/15 | ${b.review}/25 | ${b.allPass ? '✅' : '❌'} | ${b.date} |`
      : `| ${m.id} | ${m.name} | — | — | — | — | — | not started |`;
  }).join('\n');
  writeFileSync(join(QDIR, 'README.md'), `# Quality scoreboard

One row per module, refreshed by \`npm run quality -- <module>\` at the end of each module cycle. Rubric: [engineering standards §7](../spec/01-engineering-standards.md#7-quality-score).

| Module | Name | Score | Coverage (mean) | Traceability | Review | Tests | Date |
|---|---|---|---|---|---|---|---|
${rows}
`);
}

mkdirSync(QDIR, { recursive: true });
const parts = [backend(), frontend()];
const trace = traceability();
const rev = review();
const s = score(parts, trace, rev);
writeFileSync(join(QDIR, `${mod.id}.md`), render(parts, trace, rev, s));
updateBoard(s);
process.stdout.write(`${mod.id} score ${s.total} (${grade(s.total)}) · coverage ${s.covAvg}% · trace ${trace.covered.length}/${trace.acIds.length} · tests ${s.allPass ? 'pass' : 'FAIL'}\n`);
