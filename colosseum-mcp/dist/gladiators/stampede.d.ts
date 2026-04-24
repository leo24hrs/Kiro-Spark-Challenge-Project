import type { GladiatorResult } from '../types.js';
/**
 * The Stampede — High concurrency stress test.
 * Fires 50 simultaneous identical queries against the clone to detect
 * race conditions, lock contention, and deadlocks.
 */
export declare function stampede(clone_url: string, original_command: string): Promise<GladiatorResult>;
//# sourceMappingURL=stampede.d.ts.map