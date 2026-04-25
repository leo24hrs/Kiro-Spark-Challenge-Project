#!/usr/bin/env node
import 'dotenv/config';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, chmodSync } from 'node:fs';
import { resolve, extname, relative } from 'node:path';
import open from 'open';
import { startArenaServer } from './web/server.js';
import { scanFiles } from './scanner/index.js';
import { runArena } from './arena/index.js';
import { runDemoArena } from './arena/demo.js';
import { generateMCQs } from './learn/mcq-generator.js';
import { detectProvider } from './learn/llm.js';
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
    npx colosseum                       Scan staged/changed files and open the arena
    npx colosseum --demo                Force demo arena even if Neon env vars are set
    npx colosseum --developer-id NAME   Override the persona shown in the arena UI
    npx colosseum --install-hook        Install as a git pre-push hook
    npx colosseum --version             Print version
    npx colosseum --help                Show this help

  Environment variables:
    DATABASE_URL       PostgreSQL connection string (required for live arena mode)
    NEON_API_KEY       Neon API key (required for shadow clone creation)
    NEON_PROJECT_ID    Neon project ID (required for shadow clone creation)

  When NEON_API_KEY / NEON_PROJECT_ID / DATABASE_URL are not all set, the
  arena automatically runs in DEMO MODE — gladiators play scripted attacks
  with realistic timings so the visual flow is preserved on any laptop.
  `);
    process.exit(0);
}
if (args.includes('--install-hook')) {
    installHook();
    process.exit(0);
}
const FORCE_DEMO = args.includes('--demo');
const DEVELOPER_ID_OVERRIDE = readArgValue('--developer-id');
function readArgValue(flag) {
    const idx = args.indexOf(flag);
    if (idx === -1)
        return null;
    const next = args[idx + 1];
    return next && !next.startsWith('--') ? next : null;
}
// ── Main ───────────────────────────────────────────────────────────────────
await main();
async function main() {
    if (!isGitRepo()) {
        console.error('colosseum: not a git repository.');
        process.exit(1);
    }
    const sessionId = String(Math.floor(1000 + Math.random() * 9000));
    const startedAt = Date.now();
    console.log(`\n  ☠  THE COLOSSEUM  ☠`);
    console.log(`  Opening arena at http://localhost:${ARENA_PORT}\n`);
    const server = startArenaServer(ARENA_PORT);
    // Open browser before any heavy work — the arena should appear instantly
    // and animate the work as it happens.
    open(`http://localhost:${ARENA_PORT}`).catch(() => {
        console.log(`  Visit: http://localhost:${ARENA_PORT}`);
    });
    // Tiny grace window so the SSE connection is open before we start pushing.
    await sleep(400);
    const timeline = [];
    server.pushPhase({ phase: 'opening', message: 'Arena opening — gladiators approaching the gate' });
    server.pushLog({ t: timestamp(startedAt), msg: 'Colosseum invoked', cls: 'ok' });
    const files = discoverFiles();
    if (files.length === 0) {
        server.pushLog({ t: timestamp(startedAt), msg: 'No changed files to scan — arena dismissed', cls: 'dim' });
        server.pushPhase({ phase: 'clean', message: 'No changed files. Arena dismissed.' });
        await sleep(1500);
        await server.close();
        console.log('  No changed files detected. Nothing to scan.\n');
        process.exit(0);
    }
    server.pushPhase({ phase: 'scanning', message: `Scanning ${files.length} file${files.length === 1 ? '' : 's'}…` });
    server.pushLog({ t: timestamp(startedAt), msg: `Discovered ${files.length} changed file(s)`, cls: 'ok' });
    for (const file of files) {
        server.pushLog({ t: timestamp(startedAt), msg: `→ ${shortPath(file)}`, cls: 'dim' });
    }
    const scanReports = await scanFiles(files);
    const allVulns = scanReports.flatMap(r => r.vulnerabilities.map(v => ({ ...v, file_path: shortPath(r.file_path) })));
    server.pushVulnerabilities(allVulns);
    timeline.push({
        icon: 'ok',
        title: 'Static scan complete',
        desc: `${files.length} file(s) scanned across 6 detectors`,
        t: tDelta(startedAt),
    });
    if (allVulns.length === 0) {
        server.pushLog({ t: timestamp(startedAt), msg: 'No vulnerabilities detected — code looks clean', cls: 'ok' });
        server.pushPhase({ phase: 'clean', message: 'All clear. The gladiators stand down.' });
        const cleanBundle = await forgeTrial(server, startedAt, [], [], true);
        const cleanResult = {
            sql_command: '',
            developer_id: DEVELOPER_ID_OVERRIDE || getDeveloperId(),
            branch_id: 'no-arena',
            overall_severity: 'low',
            gladiator_results: [],
            survivors: [],
            casualties: [],
            vulnerabilities: [],
            files_scanned: files.length,
            timeline,
            arena_ran: false,
            demo_mode: false,
            session_id: sessionId,
            elapsed_ms: Date.now() - startedAt,
            mcqs: cleanBundle.mcqs,
            mcq_source: cleanBundle.source,
        };
        server.pushResult(cleanResult);
        await sleep(3000);
        await server.close();
        console.log('  ✅  All files clean. No vulnerabilities detected.\n');
        process.exit(0);
    }
    const highestSeverity = computeHighestSeverity(allVulns);
    server.pushPhase({
        phase: 'vulnerabilities_found',
        message: `${allVulns.length} vulnerability(s) found — highest ${highestSeverity.toUpperCase()}`,
    });
    server.pushLog({
        t: timestamp(startedAt),
        msg: `Found ${allVulns.length} vulnerability(s) — highest ${highestSeverity.toUpperCase()}`,
        cls: highestSeverity === 'critical' || highestSeverity === 'high' ? 'err' : 'warn',
    });
    for (const report of scanReports) {
        if (report.vulnerabilities.length > 0) {
            server.pushLog({
                t: timestamp(startedAt),
                msg: `${shortPath(report.file_path)} — ${report.vulnerabilities.length} issue(s)`,
                cls: 'warn',
            });
        }
    }
    console.log(`  Found ${allVulns.length} vulnerability(s) — highest: ${highestSeverity.toUpperCase()}\n`);
    for (const report of scanReports) {
        if (report.vulnerabilities.length > 0) {
            console.log(`  ${report.file_path}: ${report.vulnerabilities.length} issue(s)`);
        }
    }
    const sqlVulns = allVulns.filter(v => v.type === 'SQL_INJECTION' || v.type === 'UNVALIDATED_INPUT');
    const databaseUrl = process.env['DATABASE_URL'];
    const neonApiKey = process.env['NEON_API_KEY'];
    const neonProject = process.env['NEON_PROJECT_ID'];
    const liveReady = !!databaseUrl && !!neonApiKey && !!neonProject;
    const useDemo = FORCE_DEMO || (sqlVulns.length > 0 && !liveReady);
    const shouldRunArena = sqlVulns.length > 0 && (liveReady || useDemo);
    if (sqlVulns.length > 0 && useDemo) {
        server.pushLog({
            t: timestamp(startedAt),
            msg: FORCE_DEMO
                ? 'DEMO MODE forced — gladiators will play scripted attacks'
                : 'Neon env vars not set — gladiators running in DEMO MODE (no real DB touched)',
            cls: 'warn',
        });
    }
    const developerId = DEVELOPER_ID_OVERRIDE || getDeveloperId();
    let result;
    try {
        if (shouldRunArena) {
            const topSnippet = sqlVulns
                .sort((a, b) => severityRank(b.severity) - severityRank(a.severity))[0].snippet;
            const arenaCallbacks = {
                onCloneReady: (branchId) => {
                    server.pushPhase({
                        phase: 'clone_ready',
                        message: `Shadow clone ready — ${branchId}`,
                    });
                    server.pushLog({
                        t: timestamp(startedAt),
                        msg: useDemo
                            ? `Shadow clone simulated — branch ${branchId}`
                            : `Shadow clone provisioned — branch ${branchId}`,
                        cls: 'ok',
                    });
                    timeline.push({
                        icon: 'ok',
                        title: 'Shadow branch provisioned',
                        desc: useDemo ? `Demo fork → ${branchId}` : `Forked prod via Neon → ${branchId}`,
                        t: tDelta(startedAt),
                    });
                    server.pushPhase({ phase: 'executing', message: 'Executing intercepted command on the clone…' });
                    server.pushLog({
                        t: timestamp(startedAt),
                        msg: '.env silently repointed — your session redirected to the clone',
                        cls: 'warn',
                    });
                    timeline.push({
                        icon: 'ok',
                        title: '.env silently repointed',
                        desc: 'Your session was redirected to the clone without notification',
                        t: tDelta(startedAt),
                    });
                    server.pushPhase({ phase: 'gladiators_released', message: 'Five gladiators released — the trial begins' });
                    server.pushLog({ t: timestamp(startedAt), msg: 'Releasing the five gladiators…', cls: 'err' });
                },
                onGladiatorStart: (id, name) => {
                    server.pushGladiator({ id, name, status: 'fighting' });
                    server.pushLog({ t: timestamp(startedAt), msg: `${name} enters the arena…`, cls: 'dim' });
                },
                onGladiatorDone: (id, name, gladResult) => {
                    server.pushGladiator({ id, name, status: 'done', result: gladResult });
                    server.pushLog({
                        t: timestamp(startedAt),
                        msg: `${name} → ${gladResult.survived ? 'YOU SURVIVED' : 'YOU FELL'} [${gladResult.severity.toUpperCase()}]`,
                        cls: gladResult.survived ? 'ok' : 'err',
                    });
                },
            };
            server.pushPhase({
                phase: 'clone_provisioning',
                message: useDemo
                    ? 'DEMO MODE — provisioning a simulated shadow branch…'
                    : 'Forking production via Neon — provisioning shadow clone…',
            });
            server.pushLog({
                t: timestamp(startedAt),
                msg: useDemo
                    ? 'Provisioning simulated shadow branch (demo mode)…'
                    : 'Provisioning shadow clone via Neon Branching API…',
                cls: 'ok',
            });
            const arenaResult = useDemo
                ? await runDemoArena(topSnippet, developerId, arenaCallbacks)
                : await runArena(databaseUrl, topSnippet, developerId, arenaCallbacks);
            timeline.push({
                icon: 'err',
                title: 'Shadow database destroyed',
                desc: useDemo
                    ? `Demo branch ${arenaResult.branch_id} wiped — production remained untouched`
                    : `Production remains untouched — ${arenaResult.branch_id} wiped`,
                t: tDelta(startedAt),
            });
            const arenaBundle = await forgeTrial(server, startedAt, allVulns, arenaResult.gladiator_results, arenaResult.casualties.length === 0);
            result = {
                ...arenaResult,
                vulnerabilities: allVulns,
                files_scanned: files.length,
                timeline,
                arena_ran: true,
                demo_mode: useDemo,
                session_id: sessionId,
                elapsed_ms: Date.now() - startedAt,
                mcqs: arenaBundle.mcqs,
                mcq_source: arenaBundle.source,
            };
        }
        else {
            // Static-scan-only path. Push synthetic gladiator cards so the page stays coherent.
            server.pushPhase({ phase: 'no_arena', message: 'Arena skipped — static findings only' });
            const staticBundle = await forgeTrial(server, startedAt, allVulns, [], false);
            result = {
                sql_command: allVulns[0].snippet,
                developer_id: developerId,
                branch_id: 'static-scan-only',
                overall_severity: highestSeverity,
                gladiator_results: [],
                survivors: [],
                casualties: [],
                vulnerabilities: allVulns,
                files_scanned: files.length,
                timeline,
                arena_ran: false,
                demo_mode: false,
                session_id: sessionId,
                elapsed_ms: Date.now() - startedAt,
                mcqs: staticBundle.mcqs,
                mcq_source: staticBundle.source,
            };
        }
        server.pushPhase({ phase: 'verdict_ready', message: 'The verdict is in.' });
        server.pushResult(result);
        // Hold the page open briefly so the modal animates in before the server shuts down.
        await sleep(4000);
    }
    catch (err) {
        server.pushError(err instanceof Error ? err.message : String(err));
        await sleep(3000);
    }
    finally {
        await server.close();
    }
    const dist = severityDistribution(allVulns);
    console.log('\n  Severity distribution:');
    for (const [sev, count] of Object.entries(dist)) {
        if (count > 0)
            console.log(`    ${sev.toUpperCase()}: ${count}`);
    }
    console.log('\n  Push blocked. Fix your code first.\n');
    process.exit(1);
}
// ── Helpers ────────────────────────────────────────────────────────────────
function isGitRepo() {
    try {
        execSync('git rev-parse --git-dir', { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
function discoverFiles() {
    let files = [];
    try {
        const staged = execSync('git diff --staged --name-only', { encoding: 'utf-8' })
            .trim().split('\n').filter(Boolean);
        files = staged;
    }
    catch { /* ignore */ }
    if (files.length === 0) {
        try {
            const changed = execSync('git diff --name-only HEAD', { encoding: 'utf-8' })
                .trim().split('\n').filter(Boolean);
            files = changed;
        }
        catch { /* ignore */ }
    }
    return files
        .filter(f => SCANNABLE_EXTENSIONS.has(extname(f)))
        .map(f => resolve(process.cwd(), f))
        .filter(f => existsSync(f));
}
function getDeveloperId() {
    try {
        return execSync('git config user.name', { encoding: 'utf-8' }).trim() || 'developer';
    }
    catch {
        return 'developer';
    }
}
function computeHighestSeverity(vulns) {
    const order = ['low', 'medium', 'high', 'critical'];
    let highest = 'low';
    for (const v of vulns) {
        if (order.indexOf(v.severity) > order.indexOf(highest)) {
            highest = v.severity;
        }
    }
    return highest;
}
function severityRank(s) {
    return ['low', 'medium', 'high', 'critical'].indexOf(s);
}
function severityDistribution(vulns) {
    const dist = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const v of vulns)
        dist[v.severity] = (dist[v.severity] ?? 0) + 1;
    return dist;
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
function timestamp(startedAt) {
    const d = new Date(startedAt);
    const s = (n) => String(n).padStart(2, '0');
    return `${s(d.getHours())}:${s(d.getMinutes())}:${s(d.getSeconds())}`;
}
function tDelta(startedAt) {
    return `T+${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}
function shortPath(p) {
    try {
        return relative(process.cwd(), p) || p;
    }
    catch {
        return p;
    }
}
/**
 * Generate the Learn Why MCQ trial. Tries the configured LLM (Anthropic or
 * OpenAI) first with a hard timeout; falls back to the template bank on any
 * failure. We pre-bake the questions into the result payload so the modal
 * still works after the CLI shuts the server down.
 */
async function forgeTrial(server, startedAt, vulnerabilities, gladiators, passed) {
    const provider = detectProvider();
    if (provider) {
        server.pushLog({
            t: timestamp(startedAt),
            msg: `Forging the trial — ${provider === 'claude' ? 'Claude' : 'GPT'} is studying your code…`,
            cls: 'ok',
        });
    }
    const bundle = await generateMCQs({ vulnerabilities, gladiators, passed });
    if (bundle.source !== 'templates') {
        server.pushLog({
            t: timestamp(startedAt),
            msg: `Trial forged by ${bundle.source === 'claude' ? 'Claude' : 'GPT'} — ${bundle.mcqs.length} question(s) ready`,
            cls: 'ok',
        });
    }
    else if (provider) {
        server.pushLog({
            t: timestamp(startedAt),
            msg: `LLM trial generation failed — falling back to the template bank`,
            cls: 'warn',
        });
    }
    return bundle;
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
//# sourceMappingURL=index.js.map