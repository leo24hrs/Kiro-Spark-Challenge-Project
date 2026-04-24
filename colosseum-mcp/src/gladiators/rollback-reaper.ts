import pg from 'pg';
import type { GladiatorResult } from '../types.js';

/**
 * Attempt to extract the main table name from a SQL command.
 * Returns null if no table can be reliably identified.
 */
function extractTableName(command: string): string | null {
  const normalized = command.trim().toUpperCase();

  // DELETE FROM <table>
  const deleteMatch = command.match(/DELETE\s+FROM\s+([a-zA-Z_][a-zA-Z0-9_.]*)/i);
  if (deleteMatch) return deleteMatch[1];

  // UPDATE <table>
  const updateMatch = command.match(/UPDATE\s+([a-zA-Z_][a-zA-Z0-9_.]*)/i);
  if (updateMatch) return updateMatch[1];

  // INSERT INTO <table>
  const insertMatch = command.match(/INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_.]*)/i);
  if (insertMatch) return insertMatch[1];

  // DROP TABLE <table>
  const dropMatch = command.match(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)/i);
  if (dropMatch) return dropMatch[1];

  // TRUNCATE <table>
  const truncateMatch = command.match(/TRUNCATE\s+(?:TABLE\s+)?([a-zA-Z_][a-zA-Z0-9_.]*)/i);
  if (truncateMatch) return truncateMatch[1];

  void normalized; // suppress unused warning
  return null;
}

/**
 * The Rollback Reaper — Transaction rollback integrity test.
 * Begins a transaction, executes the command, forces a mid-execution error,
 * then verifies ROLLBACK integrity and data state.
 */
export async function rollbackReaper(
  clone_url: string,
  original_command: string
): Promise<GladiatorResult> {
  const client = new pg.Client({ connectionString: clone_url });

  try {
    await client.connect();

    let rollbackSucceeded = false;
    let dataStateVerified = false;
    let dataStateUncertain = false;
    let transactionBroken = false;

    // Record pre-transaction row count if we can identify the table
    const tableName = extractTableName(original_command);
    let preCount: number | null = null;

    if (tableName) {
      try {
        const countResult = await client.query(
          `SELECT COUNT(*) AS cnt FROM ${tableName}`
        );
        preCount = parseInt(countResult.rows[0]?.cnt ?? '0', 10);
      } catch {
        // Table may not exist yet or name extraction was wrong — proceed anyway
      }
    }

    try {
      // Begin transaction
      await client.query('BEGIN');

      // Execute the original command
      await client.query(original_command);

      // Force a mid-execution error: division by zero
      await client.query('SELECT 1/0');
    } catch {
      // The division by zero (or command error) aborted the transaction in PostgreSQL.
      // Issue ROLLBACK to clean up the aborted transaction.
      try {
        await client.query('ROLLBACK');
        rollbackSucceeded = true;
      } catch {
        // ROLLBACK itself failed — transaction left in broken state
        transactionBroken = true;
      }
    }

    // Verify data state if ROLLBACK succeeded and we have a table to check
    if (rollbackSucceeded && tableName && preCount !== null) {
      try {
        const postCountResult = await client.query(
          `SELECT COUNT(*) AS cnt FROM ${tableName}`
        );
        const postCount = parseInt(postCountResult.rows[0]?.cnt ?? '0', 10);
        dataStateVerified = postCount === preCount;
        if (!dataStateVerified) {
          dataStateUncertain = true;
        }
      } catch {
        // Can't verify — table may have been dropped or is inaccessible
        dataStateUncertain = true;
      }
    } else if (rollbackSucceeded && !tableName) {
      // ROLLBACK succeeded but we couldn't identify a table to verify
      dataStateUncertain = true;
    }

    let survived: boolean;
    let severity: GladiatorResult['severity'];
    let damage_report: string;

    if (transactionBroken) {
      survived = false;
      severity = 'critical';
      damage_report =
        'Transaction forced to fail mid-execution. ROLLBACK failed. Transaction left in broken state. Data integrity at risk.';
    } else if (!rollbackSucceeded) {
      survived = false;
      severity = 'high';
      damage_report =
        'Transaction forced to fail mid-execution. ROLLBACK threw an unexpected error. Data state unknown.';
    } else if (dataStateVerified) {
      survived = true;
      severity = 'low';
      damage_report =
        'Transaction forced to fail mid-execution. ROLLBACK succeeded. Data integrity verified.';
    } else {
      // ROLLBACK succeeded but data state is uncertain
      survived = false;
      severity = 'medium';
      damage_report =
        'Transaction forced to fail mid-execution. ROLLBACK succeeded. Data state could not be fully verified.';
    }

    return {
      gladiator_name: 'The Rollback Reaper',
      survived,
      damage_report,
      severity,
    };
  } catch (err) {
    return {
      gladiator_name: 'The Rollback Reaper',
      survived: false,
      damage_report: `Rollback Reaper encountered a critical error: ${err instanceof Error ? err.message : String(err)}`,
      severity: 'critical',
    };
  } finally {
    await client.end();
  }
}
