import type { GladiatorResult, ScanReport, Vulnerability } from '../types.js';

type Severity = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

const THREAT_MESSAGE: Record<Severity, string> = {
  critical: 'Fix the critical vulnerabilities before proceeding.',
  high: 'High-risk vulnerabilities detected. Review before proceeding.',
  medium: 'Medium-risk issues detected. Consider reviewing.',
  low: 'No critical issues detected. Proceed with caution.',
};

function computeOverallSeverity(results: GladiatorResult[]): Severity {
  let highest: Severity = 'low';
  for (const r of results) {
    if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[highest]) {
      highest = r.severity;
    }
  }
  return highest;
}

/**
 * Renders the Game Over ASCII-art markdown scoreboard.
 * Pure function — no side effects, no async, no fix suggestions.
 */
export function renderScoreboard(
  results: GladiatorResult[],
  command: string,
  developerId: string,
  branchId: string
): string {
  const overallSeverity = computeOverallSeverity(results);
  const severityEmoji = SEVERITY_EMOJI[overallSeverity];
  const threatMessage = THREAT_MESSAGE[overallSeverity];

  const gladiatorRows = results
    .map((r) => {
      if (r.survived) {
        return `  ⚔  ${r.gladiator_name}    → SURVIVED    [${r.severity.toUpperCase()}]`;
      } else {
        return `  💀  ${r.gladiator_name}    → KILLED YOU  [${r.severity.toUpperCase()}]  ← ${r.damage_report}`;
      }
    })
    .join('\n');

  return [
    '╔══════════════════════════════════════════════════════╗',
    '║           ☠  THE COLOSSEUM — GAME OVER  ☠            ║',
    '╚══════════════════════════════════════════════════════╝',
    '',
    '  Command Intercepted:',
    `  > ${command}`,
    '',
    `  Shadow Clone: ${branchId} | Destroyed ✓`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '  GLADIATOR RESULTS',
    '',
    gladiatorRows,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `  OVERALL THREAT LEVEL: ${severityEmoji} ${overallSeverity.toUpperCase()}`,
    '',
    '  Your command was NOT executed on production.',
    `  ${threatMessage}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Code Scan Scoreboard
// ---------------------------------------------------------------------------

const SCAN_SEVERITY_EMOJI: Record<string, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
  clean: '✅',
};

function renderVulnerabilityRow(v: Vulnerability): string {
  return [
    `  💀  [${v.severity.toUpperCase()}] ${v.type} — Line ${v.line}`,
    `      ${v.description}`,
    `      > ${v.snippet}`,
  ].join('\n');
}

/**
 * Renders the Code Scan ASCII-art markdown report.
 * Pure function — no side effects, no async, no fix suggestions.
 */
export function renderCodeScoreboard(report: ScanReport): string {
  const { file_path, vulnerabilities, overall_severity } = report;
  const severityEmoji = SCAN_SEVERITY_EMOJI[overall_severity] ?? '⚪';

  if (vulnerabilities.length === 0) {
    return [
      '╔══════════════════════════════════════════════════════╗',
      '║        🔍  THE COLOSSEUM — CODE SCAN REPORT  🔍       ║',
      '╚══════════════════════════════════════════════════════╝',
      '',
      '  File Scanned:',
      `  > ${file_path}`,
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '',
      '  ✅  No vulnerabilities detected. Code looks clean.',
      '',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    ].join('\n');
  }

  const vulnRows = vulnerabilities.map(renderVulnerabilityRow).join('\n\n');

  return [
    '╔══════════════════════════════════════════════════════╗',
    '║        🔍  THE COLOSSEUM — CODE SCAN REPORT  🔍       ║',
    '╚══════════════════════════════════════════════════════╝',
    '',
    '  File Scanned:',
    `  > ${file_path}`,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    '  VULNERABILITY REPORT',
    '',
    vulnRows,
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
    '',
    `  OVERALL THREAT LEVEL: ${severityEmoji} ${overall_severity.toUpperCase()}`,
    '',
    '  This file has NOT been blocked. Fix vulnerabilities before deploying.',
    '',
    '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
  ].join('\n');
}
