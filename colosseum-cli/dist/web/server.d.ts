import type { ArenaResult, GladiatorResult, Vulnerability } from '../types.js';
export type ArenaPhase = 'opening' | 'scanning' | 'vulnerabilities_found' | 'clean' | 'clone_provisioning' | 'clone_ready' | 'executing' | 'gladiators_released' | 'verdict_ready' | 'no_arena';
export interface PhasePayload {
    phase: ArenaPhase;
    message: string;
}
export interface LogPayload {
    t: string;
    msg: string;
    cls: 'ok' | 'warn' | 'err' | 'dim';
}
export interface GladiatorEventPayload {
    id: number;
    name: string;
    status: 'fighting' | 'done';
    result?: GladiatorResult;
}
/**
 * Starts a local Express server that:
 *  - Serves the arena HTML page on GET /
 *  - Streams the live simulation to the browser via SSE on GET /events
 *  - Serves Learn-Why MCQs on POST /api/learn-why
 *
 * SSE connections are kept open for the lifetime of the run, and any events
 * pushed before the first client connects are buffered and flushed on
 * connection so the browser never misses the opening of the arena.
 */
export declare function startArenaServer(port?: number): {
    pushPhase: (p: PhasePayload) => void;
    pushLog: (l: LogPayload) => void;
    pushGladiator: (g: GladiatorEventPayload) => void;
    pushVulnerabilities: (vulns: Vulnerability[]) => void;
    pushResult: (r: ArenaResult) => void;
    pushError: (message: string) => void;
    close: () => Promise<void>;
};
//# sourceMappingURL=server.d.ts.map