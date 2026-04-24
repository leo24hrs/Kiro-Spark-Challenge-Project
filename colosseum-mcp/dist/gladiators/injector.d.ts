import type { GladiatorResult } from '../types.js';
/**
 * The Injector — SQL injection surface probe.
 * Wraps the original command with common injection payloads and counts
 * how many execute without a PostgreSQL error.
 */
export declare function injector(clone_url: string, original_command: string): Promise<GladiatorResult>;
//# sourceMappingURL=injector.d.ts.map