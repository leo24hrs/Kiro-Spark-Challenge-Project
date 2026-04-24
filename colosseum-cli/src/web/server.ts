import express from 'express';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Response } from 'express';
import type { ArenaResult } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Starts a local Express server that:
 *  - Serves the arena HTML page on GET /
 *  - Streams the simulation result to the browser via SSE on GET /events
 *
 * Returns a push function to send the result and a close function to
 * shut the server down after the browser has received the data.
 */
export function startArenaServer(port = 7471): {
  push: (result: ArenaResult) => void;
  pushError: (message: string) => void;
  close: () => Promise<void>;
} {
  const app = express();
  const httpServer = createServer(app);

  const clients: Response[] = [];
  let bufferedEvent: { type: string; data: string } | null = null;

  // Serve the arena HTML
  app.get('/', (_req, res) => {
    const htmlPath = join(__dirname, 'arena.html');
    const html = readFileSync(htmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  // SSE endpoint
  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    if (bufferedEvent) {
      res.write(`event: ${bufferedEvent.type}\ndata: ${bufferedEvent.data}\n\n`);
      res.end();
      return;
    }

    clients.push(res);
    req.on('close', () => {
      const idx = clients.indexOf(res);
      if (idx !== -1) clients.splice(idx, 1);
    });
  });

  function broadcast(eventType: string, data: string) {
    const payload = `event: ${eventType}\ndata: ${data}\n\n`;
    if (clients.length === 0) {
      bufferedEvent = { type: eventType, data };
    } else {
      for (const client of clients) {
        client.write(payload);
        client.end();
      }
      clients.length = 0;
    }
  }

  function push(result: ArenaResult) {
    broadcast('result', JSON.stringify(result));
  }

  function pushError(message: string) {
    broadcast('error_event', JSON.stringify({ message }));
  }

  function close(): Promise<void> {
    return new Promise((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  httpServer.listen(port);
  return { push, pushError, close };
}
