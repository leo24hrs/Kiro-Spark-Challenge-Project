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

// ---------------------------------------------------------------------------
// Static Code Scanner types
// ---------------------------------------------------------------------------

/**
 * A single security vulnerability found in a source file.
 */
export interface Vulnerability {
  /** Vulnerability category, e.g. "HARDCODED_SECRET", "SQL_INJECTION" */
  type: string;
  /** Threat severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** 1-indexed line number where the vulnerability was found */
  line: number;
  /** Human-readable description of what was found and why it is dangerous */
  description: string;
  /** The offending code snippet from that line */
  snippet: string;
}

/**
 * The aggregated result of scanning a single source file.
 */
export interface ScanReport {
  /** Path of the file that was scanned */
  file_path: string;
  /** All vulnerabilities found across all scanners */
  vulnerabilities: Vulnerability[];
  /** Highest severity across all vulnerabilities, or 'clean' if none found */
  overall_severity: 'low' | 'medium' | 'high' | 'critical' | 'clean';
  /** Full ASCII-art markdown code scan report */
  markdown_report: string;
}
