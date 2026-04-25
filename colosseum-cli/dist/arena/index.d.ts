import type { ArenaResult, GladiatorResult } from '../types.js';
export interface ArenaCallbacks {
    onCloneReady?: (branchId: string) => void;
    onGladiatorStart?: (id: number, name: string) => void;
    onGladiatorDone?: (id: number, name: string, result: GladiatorResult) => void;
}
/**
 * Internal arena result — omits the visualisation-only fields (vulnerabilities,
 * files_scanned, timeline, arena_ran, session_id, elapsed_ms) which the CLI
 * layer composes once the arena has completed.
 */
type CoreArenaResult = Omit<ArenaResult, 'vulnerabilities' | 'files_scanned' | 'timeline' | 'arena_ran' | 'demo_mode' | 'session_id' | 'elapsed_ms' | 'mcqs' | 'mcq_source'>;
export declare function runArena(databaseUrl: string, sqlCommand: string, developerId: string, callbacks?: ArenaCallbacks): Promise<CoreArenaResult>;
export {};
//# sourceMappingURL=index.d.ts.map