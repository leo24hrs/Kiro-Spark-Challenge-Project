/**
 * MCP tool: execute_on_clone
 * Executes a SQL command against a Neon shadow clone (branch URL).
 * Includes a production URL guardrail that rejects any non-Neon-branch connection strings.
 */
import { CloneExecutionResult } from '../types.js';
/**
 * Executes a SQL command against a Neon shadow clone.
 *
 * @param clone_url   - PostgreSQL connection string for the shadow clone (must be a Neon branch URL)
 * @param sql_command - SQL command to execute
 * @returns CloneExecutionResult with result rows, execution time, and rows affected
 */
export declare function executeOnClone(clone_url: string, sql_command: string): Promise<CloneExecutionResult>;
//# sourceMappingURL=execute-on-clone.d.ts.map