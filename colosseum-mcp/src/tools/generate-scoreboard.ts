import type { GladiatorResult, ScoreboardOutput } from '../types.js';
import { renderScoreboard } from '../scoreboard/renderer.js';

type Severity = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
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
 * Aggregates Gladiator results into a ScoreboardOutput.
 * Pure function — no side effects, no fix suggestions.
 */
export function generateScoreboard(
  gladiator_results: GladiatorResult[],
  original_command: string,
  developer_id: string,
  branch_id?: string
): ScoreboardOutput {
  const markdown_report = renderScoreboard(
    gladiator_results,
    original_command,
    developer_id,
    branch_id ?? 'unknown'
  );

  const survivors = gladiator_results
    .filter((r) => r.survived)
    .map((r) => r.gladiator_name);

  const casualties = gladiator_results
    .filter((r) => !r.survived)
    .map((r) => r.gladiator_name);

  const overall_severity = computeOverallSeverity(gladiator_results);

  // Guardrail: severity honesty enforcement — overall_severity must never be
  // lower than any individual Gladiator result. This is a non-negotiable
  // education frame constraint: severity scores must not be downgraded.
  for (const r of gladiator_results) {
    if (SEVERITY_RANK[r.severity] > SEVERITY_RANK[overall_severity as Severity]) {
      throw new Error(
        `Severity honesty violation: overall_severity "${overall_severity}" is lower than Gladiator "${r.gladiator_name}" severity "${r.severity}". Severity scores must not be downgraded.`,
      );
    }
  }

  return {
    markdown_report,
    overall_severity,
    survivors,
    casualties,
  };
}
