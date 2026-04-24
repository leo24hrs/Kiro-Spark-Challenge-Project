import pg from 'pg';
async function createBranch(projectId, branchName) {
    const apiKey = process.env['NEON_API_KEY'];
    const res = await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            branch: { name: branchName },
            endpoints: [{ type: 'read_write' }],
        }),
    });
    if (!res.ok)
        throw new Error(`Neon API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
        branch_id: data.branch.id,
        connection_string: data.connection_uris?.[0]?.connection_uri ?? '',
    };
}
async function deleteBranch(projectId, branchId) {
    const apiKey = process.env['NEON_API_KEY'];
    await fetch(`https://console.neon.tech/api/v2/projects/${projectId}/branches/${branchId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` },
    });
}
async function createShadowClone(branchName) {
    const projectId = process.env['NEON_PROJECT_ID'];
    if (!projectId)
        return { clone_url: '', branch_id: '', status: 'failed' };
    try {
        const { branch_id, connection_string } = await createBranch(projectId, branchName);
        return { clone_url: connection_string, branch_id, status: 'ready' };
    }
    catch (err) {
        console.error('[arena] clone creation failed:', err);
        return { clone_url: '', branch_id: '', status: 'failed' };
    }
}
async function destroyShadowClone(branchId) {
    const projectId = process.env['NEON_PROJECT_ID'];
    if (!projectId || !branchId)
        return;
    try {
        await deleteBranch(projectId, branchId);
    }
    catch { /* best effort */ }
}
// Gladiators
async function runStampede(cloneUrl, command) {
    const pool = new pg.Pool({ connectionString: cloneUrl, max: 10 });
    try {
        const queries = Array.from({ length: 50 }, () => pool.query(command).catch(() => null));
        const results = await Promise.allSettled(queries);
        const failures = results.filter(r => r.status === 'rejected').length;
        const severity = failures > 30 ? 'critical' : failures > 10 ? 'high' : failures > 0 ? 'medium' : 'low';
        return { gladiator_name: 'The Stampede', survived: failures === 0, damage_report: `50 concurrent queries. ${failures} failed under load.`, severity };
    }
    catch (err) {
        return { gladiator_name: 'The Stampede', survived: false, damage_report: String(err), severity: 'critical' };
    }
    finally {
        await pool.end();
    }
}
async function runCascade(cloneUrl, command) {
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
        const severity = count > 10 ? 'critical' : count > 3 ? 'high' : count > 0 ? 'medium' : 'low';
        return { gladiator_name: 'The Cascade', survived: count === 0, damage_report: `${count} FK-dependent tables detected.`, severity };
    }
    catch (err) {
        return { gladiator_name: 'The Cascade', survived: false, damage_report: String(err), severity: 'critical' };
    }
    finally {
        await client.end();
    }
}
async function runInjector(cloneUrl, command) {
    const client = new pg.Client({ connectionString: cloneUrl });
    const payloads = ["' OR '1'='1", "; SELECT 1--", "UNION SELECT NULL--", "/**/", "' --"];
    let hits = 0;
    try {
        await client.connect();
        for (const payload of payloads) {
            try {
                await client.query(command + payload);
                hits++;
            }
            catch { /* expected */ }
        }
        const severity = hits >= 3 ? 'critical' : hits >= 1 ? 'high' : 'low';
        return { gladiator_name: 'The Injector', survived: hits === 0, damage_report: `${hits}/${payloads.length} injection payloads succeeded.`, severity };
    }
    catch (err) {
        return { gladiator_name: 'The Injector', survived: false, damage_report: String(err), severity: 'critical' };
    }
    finally {
        await client.end();
    }
}
async function runLoadBreaker(cloneUrl, command) {
    const pool = new pg.Pool({ connectionString: cloneUrl, max: 10 });
    try {
        const start = Date.now();
        const conns = await Promise.allSettled(Array.from({ length: 10 }, () => pool.connect()));
        const exhaustionMs = Date.now() - start;
        for (const r of conns) {
            if (r.status === 'fulfilled')
                r.value.release();
        }
        await pool.query(command).catch(() => null);
        const severity = exhaustionMs < 100 ? 'critical' : exhaustionMs < 500 ? 'high' : 'medium';
        return { gladiator_name: 'The Load Breaker', survived: exhaustionMs > 1000, damage_report: `Pool exhausted in ${exhaustionMs}ms.`, severity };
    }
    catch (err) {
        return { gladiator_name: 'The Load Breaker', survived: false, damage_report: String(err), severity: 'critical' };
    }
    finally {
        await pool.end();
    }
}
async function runRollbackReaper(cloneUrl, command) {
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
    }
    catch (err) {
        return { gladiator_name: 'The Rollback Reaper', survived: false, damage_report: String(err), severity: 'critical' };
    }
    finally {
        await client.end();
    }
}
// Orchestrator
export async function runArena(databaseUrl, sqlCommand, developerId) {
    const branchName = `colosseum-cli-${Date.now()}`;
    const clone = await createShadowClone(branchName);
    if (clone.status === 'failed') {
        throw new Error('Failed to create shadow clone. Check NEON_API_KEY and NEON_PROJECT_ID.');
    }
    const { clone_url, branch_id } = clone;
    try {
        // Execute command on clone
        const execClient = new pg.Client({ connectionString: clone_url });
        try {
            await execClient.connect();
            await execClient.query(sqlCommand).catch(() => null);
        }
        finally {
            await execClient.end();
        }
        // Run all 5 gladiators in parallel
        const settled = await Promise.allSettled([
            runStampede(clone_url, sqlCommand),
            runCascade(clone_url, sqlCommand),
            runInjector(clone_url, sqlCommand),
            runLoadBreaker(clone_url, sqlCommand),
            runRollbackReaper(clone_url, sqlCommand),
        ]);
        const gladiatorResults = settled.map((outcome, idx) => outcome.status === 'fulfilled'
            ? outcome.value
            : { gladiator_name: `Gladiator ${idx + 1}`, survived: false, damage_report: String(outcome.reason), severity: 'critical' });
        const severityOrder = ['low', 'medium', 'high', 'critical'];
        const overallSeverity = gladiatorResults.reduce((acc, r) => severityOrder.indexOf(r.severity) > severityOrder.indexOf(acc) ? r.severity : acc, 'low');
        return {
            sql_command: sqlCommand,
            developer_id: developerId,
            branch_id,
            overall_severity: overallSeverity,
            gladiator_results: gladiatorResults,
            survivors: gladiatorResults.filter(r => r.survived).map(r => r.gladiator_name),
            casualties: gladiatorResults.filter(r => !r.survived).map(r => r.gladiator_name),
        };
    }
    finally {
        await destroyShadowClone(branch_id);
    }
}
//# sourceMappingURL=index.js.map