import type { GladiatorResult, Severity } from '../types.js';
import type { ArenaCallbacks } from './index.js';

/**
 * Demo arena — runs the same five-gladiator pipeline as the real arena, but
 * without provisioning a Neon branch or executing any SQL. Used when the
 * required env vars (NEON_API_KEY, NEON_PROJECT_ID, DATABASE_URL) are absent
 * so the visual centerpiece of the project still plays during demos.
 *
 * Damage reports are derived from the intercepted SQL so the verdict feels
 * specific to the intern's actual code — not generic "the gladiator won".
 *
 * The honesty contract: the topbar and POST MORTEM badge surface a
 * "DEMO MODE" mark in the live arena UI so we never claim the gladiators
 * ran against a real database.
 */
export interface DemoArenaResult {
  sql_command: string;
  developer_id: string;
  branch_id: string;
  overall_severity: Severity;
  gladiator_results: GladiatorResult[];
  survivors: string[];
  casualties: string[];
}

/**
 * Sleep helper.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Returns scripted-but-plausible gladiator results for a given SQL command.
 * The choreography mirrors what a real Postgres+Neon run would surface:
 * SQL-injection-shaped commands trigger the Injector + Cascade harder than
 * benign DELETEs, etc.
 */
function scriptedGladiatorResults(sql: string): GladiatorResult[] {
  const lc = sql.toLowerCase();
  const isInjectable = /(\+|\$\{)/.test(sql) && /(req\.|user|input|params|body)/i.test(sql);
  const isDelete     = /\bdelete\b/.test(lc);
  const isDrop       = /\bdrop\s+(table|database)\b/.test(lc);
  const hasWhere     = /\bwhere\b/.test(lc);
  const isUnbounded  = (isDelete || isDrop) && !hasWhere;

  return [
    {
      gladiator_name: 'The Stampede',
      survived: !isUnbounded,
      damage_report: isUnbounded
        ? '50 concurrent calls — table-level lock contention spiked, 38 queries timed out (>2s)'
        : '50 concurrent calls — held under load, longest wait 184ms',
      severity: isUnbounded ? 'high' : 'low',
    },
    {
      gladiator_name: 'The Cascade',
      survived: false,
      damage_report: isDrop
        ? 'DROP triggered cascade across 11 FK-dependent tables — orders, sessions, audit_log all destroyed'
        : isDelete
          ? '7 FK-dependent tables traced — DELETE would have nulled or removed 14,203 dependent rows'
          : 'Detected 4 FK chains downstream — write would have rippled through orders + sessions',
      severity: isDrop ? 'critical' : isDelete ? 'high' : 'medium',
    },
    {
      gladiator_name: 'The Injector',
      survived: !isInjectable,
      damage_report: isInjectable
        ? '3/5 injection payloads succeeded — `\' OR \'1\'=\'1` returned full table, `; --` collapsed the WHERE clause'
        : '0/5 injection payloads succeeded — query is structurally safe',
      severity: isInjectable ? 'critical' : 'low',
    },
    {
      gladiator_name: 'The Load Breaker',
      survived: false,
      damage_report: 'Pool exhausted in 412ms under 10 concurrent connections — every queued request would have 503\'d',
      severity: 'high',
    },
    {
      gladiator_name: 'The Rollback Reaper',
      survived: !isDrop,
      damage_report: isDrop
        ? 'DDL is implicit-commit in Postgres — ROLLBACK had no effect, schema change was permanent'
        : 'Transaction rolled back cleanly — pre-state restored, no orphaned rows',
      severity: isDrop ? 'critical' : 'low',
    },
  ];
}

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

function maxSeverity(results: GladiatorResult[]): Severity {
  let highest: Severity = 'low';
  for (const r of results) {
    if (SEVERITY_ORDER.indexOf(r.severity) > SEVERITY_ORDER.indexOf(highest)) {
      highest = r.severity;
    }
  }
  return highest;
}

/**
 * Runs the demo arena pipeline. Same callback shape as the real `runArena`
 * so the CLI orchestrator doesn't need to branch.
 */
export async function runDemoArena(
  sqlCommand: string,
  developerId: string,
  callbacks: ArenaCallbacks = {},
): Promise<DemoArenaResult> {
  const branchId = `demo-shadow-${Math.floor(1000 + Math.random() * 9000)}`;

  // Provisioning beat — long enough to feel real, short enough not to bore.
  await sleep(900);
  callbacks.onCloneReady?.(branchId);

  await sleep(700);

  const results = scriptedGladiatorResults(sqlCommand);

  // Stagger the gladiators so the strip lights up sequentially rather than
  // all at once — this is the visual centerpiece of the demo.
  const fightDurations = [1200, 1500, 1100, 1800, 1300];

  const settled: GladiatorResult[] = [];
  await Promise.all(
    results.map(async (r, idx) => {
      const id = idx + 1;
      callbacks.onGladiatorStart?.(id, r.gladiator_name);
      await sleep(fightDurations[idx] ?? 1300);
      callbacks.onGladiatorDone?.(id, r.gladiator_name, r);
      settled[idx] = r;
    }),
  );

  return {
    sql_command: sqlCommand,
    developer_id: developerId,
    branch_id: branchId,
    overall_severity: maxSeverity(settled),
    gladiator_results: settled,
    survivors: settled.filter((g) => g.survived).map((g) => g.gladiator_name),
    casualties: settled.filter((g) => !g.survived).map((g) => g.gladiator_name),
  };
}
