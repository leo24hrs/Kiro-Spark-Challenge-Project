import express from 'express';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Response } from 'express';
import type { ArenaResult, GladiatorResult, Vulnerability } from '../types.js';
import { generateMCQs } from '../learn/mcq-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type ArenaPhase =
  | 'opening'
  | 'scanning'
  | 'vulnerabilities_found'
  | 'clean'
  | 'clone_provisioning'
  | 'clone_ready'
  | 'executing'
  | 'gladiators_released'
  | 'verdict_ready'
  | 'no_arena';

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

interface SseEvent {
  type: string;
  data: string;
}

/**
 * Local copy of the SQL vulnerabilities provided by the CLI runner so the
 * /api/learn-why endpoint can synthesise context-aware MCQs.
 */
let lastVulnerabilities: Vulnerability[] = [];
let lastResult: ArenaResult | null = null;

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
export function startArenaServer(port = 7471): {
  pushPhase: (p: PhasePayload) => void;
  pushLog: (l: LogPayload) => void;
  pushGladiator: (g: GladiatorEventPayload) => void;
  pushVulnerabilities: (vulns: Vulnerability[]) => void;
  pushResult: (r: ArenaResult) => void;
  pushError: (message: string) => void;
  close: () => Promise<void>;
} {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);

  const clients: Response[] = [];
  const buffer: SseEvent[] = [];

  app.get('/', (_req, res) => {
    const htmlPath = join(__dirname, 'arena.html');
    const html = readFileSync(htmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    res.write(': connected\n\n');
    for (const ev of buffer) {
      res.write(`event: ${ev.type}\ndata: ${ev.data}\n\n`);
    }

    clients.push(res);
    req.on('close', () => {
      const idx = clients.indexOf(res);
      if (idx !== -1) clients.splice(idx, 1);
    });
  });

  app.post('/api/learn-why', async (req, res) => {
    // If the result already shipped pre-baked MCQs, just return them — no
    // need to re-call the LLM or templates.
    if (lastResult?.mcqs && lastResult.mcqs.length > 0) {
      res.json({
        mcqs: lastResult.mcqs,
        source: lastResult.mcq_source,
        passed: lastResult.casualties.length === 0,
      });
      return;
    }

    const vulns: Vulnerability[] =
      Array.isArray(req.body?.vulnerabilities) && req.body.vulnerabilities.length > 0
        ? req.body.vulnerabilities
        : lastVulnerabilities;

    const gladiators: GladiatorResult[] =
      Array.isArray(req.body?.gladiator_results) && req.body.gladiator_results.length > 0
        ? req.body.gladiator_results
        : lastResult?.gladiator_results ?? [];

    const passed = lastResult ? lastResult.casualties.length === 0 : false;

    const bundle = await generateMCQs({ vulnerabilities: vulns, gladiators, passed });
    res.json({ mcqs: bundle.mcqs, source: bundle.source, passed });
  });

  function broadcast(type: string, data: string) {
    const event: SseEvent = { type, data };
    buffer.push(event);
    const payload = `event: ${type}\ndata: ${data}\n\n`;
    for (const client of clients) client.write(payload);
  }

  httpServer.listen(port);

  return {
    pushPhase(p) {
      broadcast('phase', JSON.stringify(p));
    },
    pushLog(l) {
      broadcast('log', JSON.stringify(l));
    },
    pushGladiator(g) {
      broadcast('gladiator', JSON.stringify(g));
    },
    pushVulnerabilities(vulns) {
      lastVulnerabilities = vulns;
    },
    pushResult(r) {
      lastResult = r;
      broadcast('result', JSON.stringify(r));
    },
    pushError(message) {
      broadcast('error_event', JSON.stringify({ message }));
    },
    close() {
      return new Promise((resolve) => {
        for (const client of clients) {
          try { client.end(); } catch { /* ignore */ }
        }
        clients.length = 0;
        httpServer.close(() => resolve());
      });
    },
  };
}
