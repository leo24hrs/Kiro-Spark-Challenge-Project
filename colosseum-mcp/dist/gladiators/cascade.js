import pg from 'pg';
/**
 * The Cascade — Foreign key chain destruction detector.
 * Executes the command then traces all FK-dependent tables to detect
 * unintended cascade deletes across related tables.
 */
export async function cascade(clone_url, original_command) {
    const client = new pg.Client({ connectionString: clone_url });
    try {
        await client.connect();
        // Execute the original command on the clone
        await client.query(original_command);
        // Query information_schema to find all FK-dependent tables
        const fkQuery = `
      SELECT DISTINCT
        kcu.table_name AS dependent_table
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = rc.constraint_name
        AND kcu.constraint_schema = rc.constraint_schema
      WHERE rc.unique_constraint_schema = 'public'
        OR rc.constraint_schema = 'public'
    `;
        const fkResult = await client.query(fkQuery);
        const fkTableCount = fkResult.rowCount ?? 0;
        let survived;
        let severity;
        if (fkTableCount === 0) {
            survived = true;
            severity = 'low';
        }
        else if (fkTableCount <= 3) {
            survived = false;
            severity = 'medium';
        }
        else if (fkTableCount <= 10) {
            survived = false;
            severity = 'high';
        }
        else {
            survived = false;
            severity = 'critical';
        }
        const riskNote = fkTableCount > 0 ? ' Cascade destruction risk identified.' : '';
        const damage_report = `Command executed. ${fkTableCount} FK-dependent tables detected.${riskNote}`;
        return {
            gladiator_name: 'The Cascade',
            survived,
            damage_report,
            severity,
        };
    }
    catch (err) {
        return {
            gladiator_name: 'The Cascade',
            survived: false,
            damage_report: `Cascade encountered a critical error: ${err instanceof Error ? err.message : String(err)}`,
            severity: 'critical',
        };
    }
    finally {
        await client.end();
    }
}
//# sourceMappingURL=cascade.js.map