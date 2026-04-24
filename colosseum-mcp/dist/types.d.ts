/**
 * Shared TypeScript interfaces for the Colosseum MCP server.
 * All types are used across tools, gladiators, and the scoreboard renderer.
 */
/**
 * The result returned by each Gladiator sub-agent after attacking the shadow clone.
 */
export interface GladiatorResult {
    /** Display name of the Gladiator (e.g. "The Stampede") */
    gladiator_name: string;
    /** Whether the Gladiator survived (i.e. the command passed this attack vector) */
    survived: boolean;
    /** Human-readable description of what the Gladiator found */
    damage_report: string;
    /** Threat severity level detected by this Gladiator */
    severity: 'low' | 'medium' | 'high' | 'critical';
}
/**
 * Represents an isolated Neon DB shadow clone created for a simulation session.
 */
export interface ShadowClone {
    /** PostgreSQL connection string for the shadow clone */
    clone_url: string;
    /** Neon branch ID used to identify and destroy the clone after the session */
    branch_id: string;
    /** Whether the clone was successfully created */
    status: 'ready' | 'failed';
}
/**
 * Valid Gladiator IDs — one for each of the five Gladiator sub-agents.
 * 1 = The Stampede
 * 2 = The Cascade
 * 3 = The Injector
 * 4 = The Load Breaker
 * 5 = The Rollback Reaper
 */
export type GladiatorId = 1 | 2 | 3 | 4 | 5;
/**
 * The aggregated output from the scoreboard renderer.
 */
export interface ScoreboardOutput {
    /** Full ASCII-art markdown scoreboard report */
    markdown_report: string;
    /** Highest severity level across all Gladiator results */
    overall_severity: string;
    /** Names of Gladiators where survived === true */
    survivors: string[];
    /** Names of Gladiators where survived === false */
    casualties: string[];
}
/**
 * The result of executing a SQL command against the shadow clone.
 */
export interface CloneExecutionResult {
    /** Raw query result rows or other return value */
    result: unknown;
    /** Wall-clock time in milliseconds for the query to complete */
    execution_time_ms: number;
    /** Number of rows affected by the command (rowCount from pg) */
    rows_affected: number;
}
//# sourceMappingURL=types.d.ts.map