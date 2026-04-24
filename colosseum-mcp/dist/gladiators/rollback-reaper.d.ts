import type { GladiatorResult } from '../types.js';
/**
 * The Rollback Reaper — Transaction rollback integrity test.
 * Begins a transaction, executes the command, forces a mid-execution error,
 * then verifies ROLLBACK integrity and data state.
 */
export declare function rollbackReaper(clone_url: string, original_command: string): Promise<GladiatorResult>;
//# sourceMappingURL=rollback-reaper.d.ts.map