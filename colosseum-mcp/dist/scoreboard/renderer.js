const SEVERITY_RANK = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
};
const SEVERITY_EMOJI = {
    low: '🟢',
    medium: '🟡',
    high: '🟠',
    critical: '🔴',
};
const THREAT_MESSAGE = {
    critical: 'Fix the critical vulnerabilities before proceeding.',
    high: 'High-risk vulnerabilities detected. Review before proceeding.',
    medium: 'Medium-risk issues detected. Consider reviewing.',
    low: 'No critical issues detected. Proceed with caution.',
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
 * Renders the Game Over ASCII-art markdown scoreboard.
 * Pure function — no side effects, no async, no fix suggestions.
 */
export function renderScoreboard(results, command, developerId, branchId) {
    const overallSeverity = computeOverallSeverity(results);
    const severityEmoji = SEVERITY_EMOJI[overallSeverity];
    const threatMessage = THREAT_MESSAGE[overallSeverity];
    const gladiatorRows = results
        .map((r) => {
        if (r.survived) {
            return `  ⚔  ${r.gladiator_name}    → SURVIVED    [${r.severity.toUpperCase()}]`;
        }
        else {
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
//# sourceMappingURL=renderer.js.map