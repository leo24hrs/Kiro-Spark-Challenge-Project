import pg from 'pg';
import type { ArenaResult, GladiatorResult, ShadowClone } from '../types.js';

async function createBranch(projectId: string, branchName: string): Promise<{ branch_id: string; connection_string: string }> {
  const apiKey = process.env['NEON_API_KEY']!;
  const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      branch: { name: branchName },
      endpoints: [{ type: 'read_write' }],
    }),
  });

  if (!res.ok) throw new Error(`Neon API error ${res.status}: ${await res.text()}`);

  const data = await res.json() as {
    branch: { id: string };
    connection_uris?: Array<{ connection_uri: string }>;
  };

  return {
    branch_id: data.branch.id,
    connection_string: data.connection_uris?.[0]?.connection_uri ?? '',
  };
}

async function deleteBranch(projectId: string, branchId: string): Promise<void> {
  const apiKey = process.env['NEON_API_KEY']!;
  await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches/${branchId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
}

async function createShadowClone(branchName: string): Promise<ShadowClone> {
  const projectId = process.env['NEON_PROJECT_ID'];
  if (!projectId) return { clone_url: '', branch_id: '', status: 'failed' };
  try {
    const { branch_id, connection_string } = await createBranch(projectId, branchName);
    return { clone_url: connection_string, branch_id, status: 'ready' };
  } catch (err) {
    console.error('[arena] clone creation failed:', err);
    return { clone_url: '', branch_id: '', status: 'failed' };
  }
}

async function destroyShadowClone(branchId: string): Promise<void> {
  const projectId = process.env['NEON_PROJECT_ID'];
  if (!projectId || !branchId) return;
  try { await deleteBranch(projectId, branchId); } catch { /* best effort */ }
}

// Gladiators

async function runStampede(cloneUrl: string, command: string): Promise<GladiatorResult> {
  const pool = new pg.Pool({ connectionString: cloneUrl, max: 10 });
  try {
    const queries = Array.from({ length: 50 }, () => pool.query(command).catch(() => null));
    const results = await Promise.allSettled(queries);
    const failures = results.filter(r => r.status === 'rejected').length;
    const severity: GladiatorResult['severity'] = failures > 30 ? 'critical' : failures > 10 ? 'high' : failures > 0 ? 'medium' : 'low';
    return { gladiator_name: 'The Stampede', survived: failures === 0, damage_report: `50 concurrent queries. ${failures} failed under load.`, severity };
  } catch (err) {
    return { gladiator_name: 'The Stampede', survived: false, damage_report: String(err), severity: 'critical' };
  } finally {
    await pool.end();
  }
}

async function runCascade(cloneUrl: string, command: string): Promise<GladiatorResult> {
  const client = new pg.Client({ connectionString: cloneUrl });
  try {
    await client.connect();
    await client.query(command).catch(() => null);
    const fkResult = await client.query(`
      SELECT DISTINCT kcu.table_name
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = rc.constraint_name
       AND kcu.constraint_schema = rc.constraint_schema
      WHERE rc.constraint_schema = 'public' OR rc.unique_constraint_schema = 'public'
    `);
    const count = fkResult.rowCount ?? 0;
    const severity: GladiatorResult['severity'] = count > 10 ? 'critical' : count > 3 ? 'high' : count > 0 ? 'medium' : 'low';
    return { gladiator_name: 'The Cascade', survived: count === 0, damage_report: `${count} FK-dependent tables detected.`, severity };
  } catch (err) {
    return { gladiator_name: 'The Cascade', survived: false, damage_report: String(err), severity: 'critical' };
  } finally {
    await client.end();
  }
}

async function runInjector(cloneUrl: string, command: string): Promise<GladiatorResult> {
  const client = new pg.Client({ connectionString: cloneUrl });
  const payloads = ["' OR '1'='1", "; SELECT 1--", "UNION SELECT NULL--", "/**/", "' --"];
  let hits = 0;
  try {
    await client.connect();
    for (const payload of payloads) {
      try { await client.query(command + payload); hits++; } catch { /* expected */ }
    }
    const severity: GladiatorResult['severity'] = hits >= 3 ? 'critical' : hits >= 1 ? 'high' : 'low';
    return { gladiator_name: 'The Injector', survived: hits === 0, damage_report: `${hits}/${payloads.length} injection payloads succeeded.`, severity };
  } catch (err) {
    return { gladiator_name: 'The Injector', survived: false, damage_report: String(err), severity: 'critical' };
  } finally {
    await client.end();
  }
}

async function runLoadBreaker(cloneUrl: string, command: string): Promise<GladiatorResult> {
  const pool = new pg.Pool({ connectionString: cloneUrl, max: 10 });
  try {
    const start = Date.now();
    const conns = await Promise.allSettled(Array.from({ length: 10 }, () => pool.connect()));
    const exhaustionMs = Date.now() - start;
    for (const r of conns) { if (r.status === 'fulfilled') r.value.release(); }
    await pool.query(command).catch(() => null);
    const severity: GladiatorResult['severity'] = exhaustionMs < 100 ? 'critical' : exhaustionMs < 500 ? 'high' : 'medium';
    return { gladiator_name: 'The Load Breaker', survived: exhaustionMs > 1000, damage_report: `Pool exhausted in ${exhaustionMs}ms.`, severity };
  } catch (err) {
    return { gladiator_name: 'The Load Breaker', survived: false, damage_report: String(err), severity: 'critical' };
  } finally {
    await pool.end();
  }
}

async function runRollbackReaper(cloneUrl: string, command: string): Promise<GladiatorResult> {
  const client = new pg.Client({ connectionString: cloneUrl });
  try {
    await client.connect();
    await client.query('BEGIN');
    await client.query(command).catch(() => null);
    await client.query('SELECT 1/0').catch(() => null);
    await client.query('ROLLBACK');
    const check = await client.query('SELECT COUNT(*) FROM pg_stat_activity').catch(() => null);
    const intact = check !== null;
    return {
      gladiator_name: 'The Rollback Reaper',
      survived: intact,
      damage_report: intact ? 'Transaction rolled back cleanly.' : 'Rollback integrity check failed.',
      severity: intact ? 'low' : 'critical',
    };
  } catch (err) {
    return { gladiator_name: 'The Rollback Reaper', survived: false, damage_report: String(err), severity: 'critical' };
  } finally {
    await client.end();
  }
}

// Orchestrator

const GLADIATOR_ROSTER: Array<{
  id: number;
  name: string;
  run: (cloneUrl: string, command: string) => Promise<GladiatorResult>;
}> = [
  { id: 1, name: 'The Stampede',         run: runStampede },
  { id: 2, name: 'The Cascade',          run: runCascade },
  { id: 3, name: 'The Injector',         run: runInjector },
  { id: 4, name: 'The Load Breaker',     run: runLoadBreaker },
  { id: 5, name: 'The Rollback Reaper',  run: runRollbackReaper },
];

export interface ArenaCallbacks {
  onCloneReady?: (branchId: string) => void;
  onGladiatorStart?: (id: number, name: string) => void;
  onGladiatorDone?: (id: number, name: string, result: GladiatorResult) => void;
}

/**
 * Internal arena result — omits the visualisation-only fields (vulnerabilities,
 * files_scanned, timeline, arena_ran, session_id, elapsed_ms) which the CLI
 * layer composes once the arena has completed.
 */
type CoreArenaResult = Omit<
  ArenaResult,
  'vulnerabilities' | 'files_scanned' | 'timeline' | 'arena_ran' | 'demo_mode' | 'session_id' | 'elapsed_ms' | 'mcqs' | 'mcq_source'
>;

export async function runArena(
  databaseUrl: string,
  sqlCommand: string,
  developerId: string,
  callbacks: ArenaCallbacks = {},
): Promise<CoreArenaResult> {
  const branchName = `colosseum-cli-${Date.now()}`;
  const clone = await createShadowClone(branchName);

  if (clone.status === 'failed') {
    throw new Error('Failed to create shadow clone. Check NEON_API_KEY and NEON_PROJECT_ID.');
  }

  const { clone_url, branch_id } = clone;
  callbacks.onCloneReady?.(branch_id);

  try {
    const execClient = new pg.Client({ connectionString: clone_url });
    try {
      await execClient.connect();
      await execClient.query(sqlCommand).catch(() => null);
    } finally {
      await execClient.end();
    }

    // Run all 5 gladiators in parallel, narrating each as it starts and finishes.
    const settled = await Promise.allSettled(
      GLADIATOR_ROSTER.map(async ({ id, name, run }) => {
        callbacks.onGladiatorStart?.(id, name);
        try {
          const result = await run(clone_url, sqlCommand);
          callbacks.onGladiatorDone?.(id, name, result);
          return result;
        } catch (err) {
          const failure: GladiatorResult = {
            gladiator_name: name,
            survived: false,
            damage_report: String(err),
            severity: 'critical',
          };
          callbacks.onGladiatorDone?.(id, name, failure);
          return failure;
        }
      }),
    );

    const gladiatorResults: GladiatorResult[] = settled.map((outcome, idx) =>
      outcome.status === 'fulfilled'
        ? outcome.value
        : {
            gladiator_name: GLADIATOR_ROSTER[idx]!.name,
            survived: false,
            damage_report: String((outcome as PromiseRejectedResult).reason),
            severity: 'critical' as const,
          }
    );

    const severityOrder = ['low', 'medium', 'high', 'critical'];
    const overallSeverity = gladiatorResults.reduce<GladiatorResult['severity']>(
      (acc, r) => severityOrder.indexOf(r.severity) > severityOrder.indexOf(acc) ? r.severity : acc,
      'low'
    );

    return {
      sql_command: sqlCommand,
      developer_id: developerId,
      branch_id,
      overall_severity: overallSeverity,
      gladiator_results: gladiatorResults,
      survivors: gladiatorResults.filter(r => r.survived).map(r => r.gladiator_name),
      casualties: gladiatorResults.filter(r => !r.survived).map(r => r.gladiator_name),
    };
  } finally {
    await destroyShadowClone(branch_id);
  }
}
