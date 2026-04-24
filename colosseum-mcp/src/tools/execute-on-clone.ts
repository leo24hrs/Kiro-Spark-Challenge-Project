/**
 * MCP tool: execute_on_clone
 * Executes a SQL command against a Neon shadow clone (branch URL).
 * Includes a production URL guardrail that rejects any non-Neon-branch connection strings.
 */

import pg from 'pg';
import { CloneExecutionResult } from '../types.js';

/**
 * Validates that the given URL is a Neon branch URL (contains `.neon.tech`).
 * Throws if the URL looks like a production or non-clone URL.
 */
function assertCloneUrl(clone_url: string): void {
  let hostname: string;
  try {
    hostname = new URL(clone_url).hostname;
  } catch {
    throw new Error(
      'Refusing to execute on non-clone URL: only Neon branch URLs are permitted',
    );
  }

  if (!hostname.includes('.neon.tech')) {
    throw new Error(
      'Refusing to execute on non-clone URL: only Neon branch URLs are permitted',
    );
  }
}

/**
 * Executes a SQL command against a Neon shadow clone.
 *
 * @param clone_url   - PostgreSQL connection string for the shadow clone (must be a Neon branch URL)
 * @param sql_command - SQL command to execute
 * @returns CloneExecutionResult with result rows, execution time, and rows affected
 */
export async function executeOnClone(
  clone_url: string,
  sql_command: string,
): Promise<CloneExecutionResult> {
  // Guardrail: reject non-clone URLs before opening any connection
  assertCloneUrl(clone_url);

  const client = new pg.Client({ connectionString: clone_url });

  try {
    await client.connect();

    const start = Date.now();
    const queryResult = await client.query(sql_command);
    const execution_time_ms = Date.now() - start;

    return {
      result: queryResult.rows,
      execution_time_ms,
      rows_affected: queryResult.rowCount ?? 0,
    };
  } finally {
    await client.end();
  }
}
