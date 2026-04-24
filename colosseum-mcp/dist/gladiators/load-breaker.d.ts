import type { GladiatorResult } from '../types.js';
/**
 * The Load Breaker — Connection pool exhaustion test.
 * Acquires all 10 pool connections and holds them, then attempts an 11th
 * to detect pool starvation and connection leak risk.
 */
export declare function loadBreaker(clone_url: string, original_command: string): Promise<GladiatorResult>;
//# sourceMappingURL=load-breaker.d.ts.map