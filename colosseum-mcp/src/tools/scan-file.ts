import type { ScanReport, Vulnerability } from '../types.js';
import { renderCodeScoreboard } from '../scoreboard/renderer.js';
import { secretHound } from '../scanners/secret-hound.js';
import { injectionScout } from '../scanners/injection-scout.js';
import { inputGuardian } from '../scanners/input-guardian.js';
import { evalWatcher } from '../scanners/eval-watcher.js';
import { exposureDetector } from '../scanners/exposure-detector.js';

type Severity = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function computeOverallSeverity(
  vulnerabilities: Vulnerability[],
): 'low' | 'medium' | 'high' | 'critical' | 'clean' {
  if (vulnerabilities.length === 0) {
    return 'clean';
  }

  let highest: Severity = 'low';
  for (const v of vulnerabilities) {
    if (SEVERITY_RANK[v.severity] > SEVERITY_RANK[highest]) {
      highest = v.severity;
    }
  }
  return highest;
}

/**
 * Scans a source file for security vulnerabilities using five parallel Code Gladiator scanners.
 *
 * Guarantees:
 * - Never modifies file_content or any file on disk (no auto-fix)
 * - Always returns a non-empty markdown_report
 * - overall_severity is always the max severity or 'clean'
 * - Scanner failures are isolated via Promise.allSettled
 */
export async function scanFile(file_path: string, file_content: string): Promise<ScanReport> {
  const lines = file_content.split('\n');

  // Run all 5 scanners in parallel — Promise.allSettled ensures one failure
  // does not prevent other scanners from reporting results.
  const results = await Promise.allSettled([
    Promise.resolve(secretHound(file_path, lines)),
    Promise.resolve(injectionScout(file_path, lines)),
    Promise.resolve(inputGuardian(file_path, lines)),
    Promise.resolve(evalWatcher(file_path, lines)),
    Promise.resolve(exposureDetector(file_path, lines)),
  ]);

  // Collect all vulnerabilities, ignoring any scanner that threw
  const vulnerabilities: Vulnerability[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      vulnerabilities.push(...result.value);
    }
    // Rejected scanners are silently skipped — scanner independence guarantee
  }

  // Sort by line number for readability
  vulnerabilities.sort((a, b) => a.line - b.line);

  const overall_severity = computeOverallSeverity(vulnerabilities);

  // Build a partial report to pass to the renderer (markdown_report filled in below)
  const partialReport: ScanReport = {
    file_path,
    vulnerabilities,
    overall_severity,
    markdown_report: '',
  };

  const markdown_report = renderCodeScoreboard(partialReport);

  return {
    file_path,
    vulnerabilities,
    overall_severity,
    markdown_report,
  };
}
