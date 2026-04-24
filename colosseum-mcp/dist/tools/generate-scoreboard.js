import { renderScoreboard } from '../scoreboard/renderer.js';
const SEVERITY_RANK = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
};
function computeOverallSeverity(results) {
    let highest = 'low';
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
export function generateScoreboard(gladiator_results, original_command, developer_id, branch_id) {
    const markdown_report = renderScoreboard(gladiator_results, original_command, developer_id, branch_id ?? 'unknown');
    const survivors = gladiator_results
        .filter((r) => r.survived)
        .map((r) => r.gladiator_name);
    const casualties = gladiator_results
        .filter((r) => !r.survived)
        .map((r) => r.gladiator_name);
    const overall_severity = computeOverallSeverity(gladiator_results);
    return {
        markdown_report,
        overall_severity,
        survivors,
        casualties,
    };
}
//# sourceMappingURL=generate-scoreboard.js.map