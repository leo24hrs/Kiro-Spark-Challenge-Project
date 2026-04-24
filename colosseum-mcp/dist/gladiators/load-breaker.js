import pg from 'pg';
/**
 * The Load Breaker — Connection pool exhaustion test.
 * Acquires all 10 pool connections and holds them, then attempts an 11th
 * to detect pool starvation and connection leak risk.
 */
export async function loadBreaker(clone_url, original_command) {
    const MAX_CONNECTIONS = 10;
    const pool = new pg.Pool({ connectionString: clone_url, max: MAX_CONNECTIONS });
    const heldClients = [];
    try {
        // Acquire all 10 connections and hold them
        const acquireStart = Date.now();
        for (let i = 0; i < MAX_CONNECTIONS; i++) {
            const client = await pool.connect();
            heldClients.push(client);
        }
        const exhaustion_time_ms = Date.now() - acquireStart;
        // Attempt an 11th connection — should fail or timeout due to pool exhaustion
        let eleventhSucceeded = false;
        const eleventhStart = Date.now();
        let eleventhDuration = 0;
        try {
            // Use a short timeout to avoid hanging indefinitely
            const timeoutMs = 6000;
            const eleventhClient = await Promise.race([
                pool.connect(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), timeoutMs)),
            ]);
            eleventhDuration = Date.now() - eleventhStart;
            // If we got here, the 11th connection succeeded (pool not exhausted)
            eleventhSucceeded = true;
            // Execute the command and release
            await eleventhClient.query(original_command);
            eleventhClient.release();
        }
        catch {
            eleventhDuration = Date.now() - eleventhStart;
            // Expected — pool exhausted
        }
        let survived;
        let severity;
        if (eleventhSucceeded) {
            survived = true;
            severity = 'low';
        }
        else if (eleventhDuration > 5000) {
            survived = false;
            severity = 'medium';
        }
        else if (eleventhDuration >= 1000) {
            survived = false;
            severity = 'high';
        }
        else {
            survived = false;
            severity = 'critical';
        }
        const damage_report = eleventhSucceeded
            ? `Connection pool not exhausted. 11th connection succeeded after ${eleventhDuration}ms. Pool resilient.`
            : `Connection pool exhausted in ${exhaustion_time_ms}ms. ${MAX_CONNECTIONS}/${MAX_CONNECTIONS} connections held. New connections blocked.`;
        return {
            gladiator_name: 'The Load Breaker',
            survived,
            damage_report,
            severity,
        };
    }
    catch (err) {
        return {
            gladiator_name: 'The Load Breaker',
            survived: false,
            damage_report: `Load Breaker encountered a critical error: ${err instanceof Error ? err.message : String(err)}`,
            severity: 'critical',
        };
    }
    finally {
        // Release all held clients before ending the pool
        for (const client of heldClients) {
            try {
                client.release();
            }
            catch {
                // Ignore release errors
            }
        }
        await pool.end();
    }
}
//# sourceMappingURL=load-breaker.js.map