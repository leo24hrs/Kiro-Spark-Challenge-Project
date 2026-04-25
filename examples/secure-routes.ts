// ─────────────────────────────────────────────────────────────────────────
// Example: the SECURE counterpart to examples/vulnerable-routes.ts.
//
// Demo workflow (Act 5):
//   git rm examples/vulnerable-routes.ts
//   git add examples/secure-routes.ts
//   npx --prefix colosseum-cli colosseum
//
// The arena should now run clean — no gladiators released, the panel
// renders STUDY THE TRIAL instead of POST MORTEM, and the push is allowed.
//
// Every line that follows is the corrected mirror of a vulnerability in
// vulnerable-routes.ts — read them side by side to learn the patterns.
// ─────────────────────────────────────────────────────────────────────────

import express, { type Request, type Response, type NextFunction } from 'express';
import { execFile } from 'node:child_process';
import pg from 'pg';

const app = express();
app.use(express.json());

// FIX (HARDCODED_SECRET) — load secrets from the environment, never the repo.
// Fail fast at boot if they're missing so you don't silently ship a broken
// service.
const DATABASE_URL = requireEnv('DATABASE_URL');
const API_KEY      = requireEnv('SERVICE_API_KEY');

const db = new pg.Client({ connectionString: DATABASE_URL });

// FIX (SQL_INJECTION) — parameterized query. The driver, not string concat,
// is responsible for safely binding `id`. Also: validate the shape before
// the DB call so a malformed id never reaches Postgres.
app.get('/users/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  const result = await db.query('SELECT id, email, created_at FROM users WHERE id = $1', [id]);
  res.json(result.rows);
});

// FIX (SQL_INJECTION via template literal) — parameterized LIKE. We do the
// wildcard wrapping in JS so the driver still owns escaping the value.
app.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query['q'] ?? '').slice(0, 100);
  if (!q) return res.json([]);

  const rows = await db.query(
    'SELECT id, name FROM products WHERE name ILIKE $1 LIMIT 50',
    [`%${q}%`],
  );
  res.json(rows.rows);
});

// FIX (UNVALIDATED_INPUT + DANGEROUS_EVAL) — never exec arbitrary user
// strings. Whitelist the operation, then hand structured args to execFile
// (which doesn't spawn a shell, so injection is structurally impossible).
const ALLOWED_COMMANDS = new Set(['status', 'uptime', 'whoami']);

app.post('/run', (req: Request, res: Response) => {
  const cmd = String(req.body?.command ?? '');
  if (!ALLOWED_COMMANDS.has(cmd)) return res.status(400).json({ error: 'command not allowed' });

  execFile(cmd, [], (err, stdout) => {
    if (err) return res.status(500).json({ error: 'execution failed' });
    res.send(stdout);
  });
});

// FIX (SENSITIVE_DATA_EXPOSURE) — log the event, not the secret. Use a
// stable redaction so dashboards still get useful signal.
app.post('/login', (req: Request, res: Response) => {
  console.log('user signed in', { user_id: redact(req.body?.email) });
  res.json({ ok: true });
});

// FIX (MISSING_AUTH_CHECK) — destructive routes go behind requireAdmin.
// The auth middleware runs BEFORE the handler, so unauthenticated callers
// never reach the DB at all.
app.delete('/admin/users/:id', requireAdmin, async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  await db.query('DELETE FROM users WHERE id = $1', [id]);
  res.json({ deleted: true });
});

// ─── Helpers ────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

function redact(value: unknown): string {
  if (typeof value !== 'string' || value.length < 4) return '***';
  return value.slice(0, 2) + '***' + value.slice(-2);
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = req.header('x-api-key');
  if (token !== API_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

export default app;
