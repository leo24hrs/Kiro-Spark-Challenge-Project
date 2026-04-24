import type { ArenaResult } from '../types.js';
/**
 * Starts a local Express server that:
 *  - Serves the arena HTML page on GET /
 *  - Streams the simulation result to the browser via SSE on GET /events
 *
 * Returns a push function to send the result and a close function to
 * shut the server down after the browser has received the data.
 */
export declare function startArenaServer(port?: number): {
    push: (result: ArenaResult) => void;
    pushError: (message: string) => void;
    close: () => Promise<void>;
};
//# sourceMappingURL=server.d.ts.map