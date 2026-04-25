/**
 * Shared types for the colosseum-cli package.
 */

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface GladiatorResult {
  gladiator_name: string;
  survived: boolean;
  damage_report: string;
  severity: Severity;
}

export interface Vulnerability {
  type: string;
  severity: Severity;
  line: number;
  description: string;
  snippet: string;
  file_path?: string;
}

export interface ScanReport {
  file_path: string;
  vulnerabilities: Vulnerability[];
  overall_severity: Severity | 'clean';
  markdown_report: string;
}

export interface ShadowClone {
  clone_url: string;
  branch_id: string;
  status: 'ready' | 'failed';
}

/** A single timeline entry shown inside the POST MORTEM modal. */
export interface TimelineEntry {
  icon: 'ok' | 'warn' | 'err';
  title: string;
  desc: string;
  t: string;
}

/** The full result payload sent to the arena HTML page. */
export interface ArenaResult {
  sql_command: string;
  developer_id: string;
  branch_id: string;
  overall_severity: Severity;
  gladiator_results: GladiatorResult[];
  survivors: string[];
  casualties: string[];
  vulnerabilities: Vulnerability[];
  files_scanned: number;
  timeline: TimelineEntry[];
  arena_ran: boolean;
  /** True when the arena ran in scripted demo mode (no real Neon branch). */
  demo_mode: boolean;
  session_id: string;
  elapsed_ms: number;
  /** Pre-baked Learn-Why questions, sent inline so the modal works even
   *  after the CLI has shut its server down. */
  mcqs: MCQ[];
  /** Where the MCQs came from: 'claude', 'gpt', or 'templates'. */
  mcq_source: 'claude' | 'gpt' | 'templates';
}

/** A single multiple-choice question rendered in the Learn Why flow. */
export interface MCQ {
  id: string;
  question: string;
  context?: string;
  options: MCQOption[];
}

export interface MCQOption {
  id: string;
  label: string;
  correct: boolean;
  explanation: string;
}
