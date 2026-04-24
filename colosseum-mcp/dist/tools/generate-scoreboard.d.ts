import type { GladiatorResult, ScoreboardOutput } from '../types.js';
/**
 * Aggregates Gladiator results into a ScoreboardOutput.
 * Pure function — no side effects, no fix suggestions.
 */
export declare function generateScoreboard(gladiator_results: GladiatorResult[], original_command: string, developer_id: string, branch_id?: string): ScoreboardOutput;
//# sourceMappingURL=generate-scoreboard.d.ts.map