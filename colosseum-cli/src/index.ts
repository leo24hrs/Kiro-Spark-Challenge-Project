#!/usr/bin/env node
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import open from 'open';

import { startArenaServer } from './web/server.js';
import { scanFiles } from './scanner/index.js';
import { runArena } from './arena/index.js';
import type { ArenaResult, Vulnerability } from './types.js';

const VERSION = '1.0.0';
const ARENA_PORT = 7471;
const SCANNABLE_EXTENSIONS = new Set(['.ts', '.js', '.py', '.env', '.sql', '.sh', '.rb']);

// ── Argument handling ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--version') || args.includes('-v')) {
  console.log(VERSION);
  process.exit(0);
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  colosseum v${VERSION}
  Sentient honeypot pre-push security gate.

  Usage:
    npx colosseum                  Scan staged/changed files and open the arena
    npx colosseum --install-hook   Install as a git pre-push hook
    npx colosseum --version        Print version
    npx colosseum --help           Show this help

  Environment variables:
    DATABASE_URL       PostgreSQL connection string (required for arena mode)
    NEON_API_KEY       Neon API key (required for shadow clone creation)
    NEON_PROJECT_ID    Neon project ID (required for shadow clone creation)
  `);
  process.exit(0);
}

if (args.includes('--install-hook')) {
  installHook();
  process.exit(0);
}

// ── Main ───────────────────────────────────────────────────────────────────

await main();

async function main() {
  if (!isGitRepo()) {
    console.error('colosseum: not a git repository.');
    process.exit(1);
  }

  const files = discoverFiles();

  if (files.length === 0) {
    console.log('colosseum: no changed files detected. Nothing to scan.');
    process.exit(0);
  }

  console.log(`\n  ☠  THE COLOSSEUM  ☠\n`);
  console.log(`  Scanning ${files.length} file(s)…\n`);

  const scanReports = await scanFiles(files);
  const allVulns: Vulnerability[] = scanReports.flatMap(r => r.vulnerabilities);

  if (allVulns.length === 0) {
    console.log('  ✅  All files clean. No vulnerabilities detected.\n');
    process.exit(0);
  }

  const highestSeverity = computeHighestSeverity(allVulns);
  console.log(`  Found ${allVulns.length} vulnerability(s) — highest: ${highestSeverity.toUpperCase()}\n`);
  for (const report of scanReports) {
    if (report.vulnerabilities.length > 0) {
      console.log(`  ${report.file_path}: ${report.vulnerabilities.length} issue(s)`);
    }
  }

  const sqlVulns = allVulns.filter(v =>
    v.type === 'SQL_INJECTION' || v.type === 'UNVALIDATED_INPUT'
  );

  const databaseUrl = process.env['DATABASE_URL'];
  const neonApiKey  = process.env['NEON_API_KEY'];
  const shouldRunArena = sqlVulns.length > 0 && !!databaseUrl && !!neonApiKey;

  if (sqlVulns.length > 0 && !databaseUrl) {
    console.log('\n  ⚠  Arena mode requires DATABASE_URL. Skipping arena.\n');
  }
  if (sqlVulns.length > 0 && !neonApiKey) {
    console.log('\n  ⚠  Arena mode requires NEON_API_KEY. Skipping arena.\n');
  }

  console.log(`\n  Opening arena at http://localhost:${ARENA_PORT} …\n`);
  const server = startArenaServer(ARENA_PORT);

  open(`http://localhost:${ARENA_PORT}`).catch(() => {
    console.log(`  Visit: http://localhost:${ARENA_PORT}`);
  });

  try {
    let result: ArenaResult;

    if (shouldRunArena) {
      console.log('\n  ⚔  THE ARENA IS OPEN — gladiators entering…\n');
      const topSnippet = sqlVulns
        .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0]!.snippet;

      result = await runArena(databaseUrl!, topSnippet, getDeveloperId());
    } else {
      result = {
        sql_command: allVulns[0]!.snippet,
        developer_id: getDeveloperId(),
        branch_id: 'static-scan-only',
        overall_severity: highestSeverity as ArenaResult['overall_severity'],
        gladiator_results: [],
        survivors: [],
        casualties: [],
      };
    }

    server.push(result);
    await sleep(3000);
  } catch (err) {
    server.pushError(err instanceof Error ? err.message : String(err));
    await sleep(3000);
  } finally {
    await server.close();
  }

  const dist = severityDistribution(allVulns);
  console.log('\n  Severity distribution:');
  for (const [sev, count] of Object.entries(dist)) {
    if (count > 0) console.log(`    ${sev.toUpperCase()}: ${count}`);
  }

  console.log('\n  Push blocked. Fix your code first.\n');
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isGitRepo(): boolean {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function discoverFiles(): string[] {
  let files: string[] = [];

  try {
    const staged = execSync('git diff --staged --name-only', { encoding: 'utf-8' })
      .trim().split('\n').filter(Boolean);
    files = staged;
  } catch { /* ignore */ }

  if (files.length === 0) {
    try {
      const changed = execSync('git diff --name-only HEAD', { encoding: 'utf-8' })
        .trim().split('\n').filter(Boolean);
      files = changed;
    } catch { /* ignore */ }
  }

  return files
    .filter(f => SCANNABLE_EXTENSIONS.has(extname(f)))
    .map(f => resolve(process.cwd(), f))
    .filter(f => existsSync(f));
}

function getDeveloperId(): string {
  try {
    return execSync('git config user.name', { encoding: 'utf-8' }).trim() || 'developer';
  } catch { return 'developer'; }
}

function computeHighestSeverity(vulns: Vulnerability[]): string {
  const order = ['low', 'medium', 'high', 'critical'];
  let highest = 0;
  for (const v of vulns) {
    const rank = order.indexOf(v.severity);
    if (rank > highest) highest = rank;
  }
  return order[highest] ?? 'low';
}

function severityRank(s: string): number {
  return ['low', 'medium', 'high', 'critical'].indexOf(s);
}

function severityDistribution(vulns: Vulnerability[]): Record<string, number> {
  const dist: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const v of vulns) dist[v.severity] = (dist[v.severity] ?? 0) + 1;
  return dist;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function installHook() {
  const hookPath = resolve(process.cwd(), '.git', 'hooks', 'pre-push');
  if (existsSync(hookPath)) {
    process.stdout.write('  .git/hooks/pre-push already exists. Overwrite? (y/N) ');
    const buf = Buffer.alloc(4);
    const n = require('fs').readSync(0, buf, 0, 4, null);
    const answer = buf.slice(0, n).toString().trim();
    if (answer.toLowerCase() !== 'y') {
      console.log('  Hook installation cancelled.');
      return;
    }
  }
  writeFileSync(hookPath, '#!/bin/sh\nnpx colosseum\nexit $?\n', 'utf-8');
  chmodSync(hookPath, 0o755);
  console.log(`  ✓ Hook installed at ${hookPath}`);
}
