import type { GladiatorResult } from '../types.js';
/**
 * The Cascade — Foreign key chain destruction detector.
 * Executes the command then traces all FK-dependent tables to detect
 * unintended cascade deletes across related tables.
 */
export declare function cascade(clone_url: string, original_command: string): Promise<GladiatorResult>;
//# sourceMappingURL=cascade.d.ts.map