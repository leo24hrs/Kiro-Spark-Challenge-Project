// ─────────────────────────────────────────────────────────────────────────
// Example: a deliberately vulnerable route file for demoing `npx colosseum`.
//
// Stage this file with:
//   git add examples/vulnerable-routes.ts
// then run the CLI from the project root and watch all five gladiators
// light up in the arena.
//
// DO NOT EVER DEPLOY THIS PATTERN.
// ─────────────────────────────────────────────────────────────────────────

import express from 'express';
import { exec } from 'node:child_process';
import pg from 'pg';

const app = express();
const db = new pg.Client();

// HARDCODED_SECRET — high severity (use env vars in real code; placeholder below
// is intentionally non-vendor-shaped so it does not trip secret push protection.)
const password = "supersecret-prod-db-password-2026";
const apiKey = "HARDCODED_DEMO_PAYMENT_API_TOKEN_NOT_STRIPE_NOT_REAL";

// SQL_INJECTION — critical severity (string concatenation)
app.get('/users/:id', async (req, res) => {
  const result = await db.query("SELECT * FROM users WHERE id = " + req.params.id);
  res.json(result.rows);
});

// SQL_INJECTION — high severity (template literal interpolation)
app.get('/search', async (req, res) => {
  const q = req.query.q;
  const rows = await db.query(`SELECT * FROM products WHERE name LIKE '%${q}%'`);
  res.json(rows);
});

// UNVALIDATED_INPUT + DANGEROUS_EVAL — critical
app.post('/run', (req, res) => {
  exec(req.body.command, (err, stdout) => res.send(stdout));
});

// SENSITIVE_DATA_EXPOSURE — high (logging a secret)
app.post('/login', (req, res) => {
  console.log("user signed in", { password: req.body.password, token: apiKey });
  res.json({ ok: true });
});

// MISSING_AUTH_CHECK — medium (no middleware on a destructive route)
app.delete('/admin/users/:id', async (req, res) => {
  await db.query("DELETE FROM users WHERE id = " + req.params.id);
  res.json({ deleted: true });
});

export default app;
