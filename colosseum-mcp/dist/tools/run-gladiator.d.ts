import type { GladiatorId, GladiatorResult } from '../types.js';
/**
 * Dispatches to the correct Gladiator sub-agent based on `gladiator_id`.
 * Returns the `GladiatorResult` from the dispatched Gladiator.
 * Catches unhandled errors and returns a critical failure result.
 */
export declare function runGladiator(gladiator_id: GladiatorId, clone_url: string, original_command: string): Promise<GladiatorResult>;
//# sourceMappingURL=run-gladiator.d.ts.map