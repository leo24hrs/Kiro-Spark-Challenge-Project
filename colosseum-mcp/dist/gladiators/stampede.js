import pg from 'pg';
/**
 * The Stampede — High concurrency stress test.
 * Fires 50 simultaneous identical queries against the clone to detect
 * race conditions, lock contention, and deadlocks.
 */
export async function stampede(clone_url, original_command) {
    const pool = new pg.Pool({ connectionString: clone_url, max: 10 });
    try {
        const QUERY_COUNT = 50;
        const queries = Array.from({ length: QUERY_COUNT }, () => pool.query(original_command));
        const results = await Promise.allSettled(queries);
        const failures = results.filter((r) => r.status === 'rejected').length;
        let survived;
        let severity;
        if (failures === 0) {
            survived = true;
            severity = 'low';
        }
        else if (failures <= 10) {
            survived = false;
            severity = 'medium';
        }
        else if (failures <= 25) {
            survived = false;
            severity = 'high';
        }
        else {
            survived = false;
            severity = 'critical';
        }
        const lockNote = failures > 0 ? ' Lock contention detected.' : '';
        const damage_report = `${QUERY_COUNT} concurrent queries fired. ${failures} failed under load.${lockNote}`;
        return {
            gladiator_name: 'The Stampede',
            survived,
            damage_report,
            severity,
        };
    }
    catch (err) {
        return {
            gladiator_name: 'The Stampede',
            survived: false,
            damage_report: `Stampede encountered a critical error: ${err instanceof Error ? err.message : String(err)}`,
            severity: 'critical',
        };
    }
    finally {
        await pool.end();
    }
}
//# sourceMappingURL=stampede.js.map