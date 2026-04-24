# Kiro — Colosseum

**You run a bad database command. Instead of a crash, you get an arena.**

Kiro intercepts risky SQL commands, clones your database in milliseconds, and unleashes five AI agents to attack the clone — showing you exactly what would have happened before it ever touches production.

---

## The Problem

Junior developers (and sometimes senior ones) run destructive commands — `DELETE FROM users` with no `WHERE`, `DROP TABLE`, `TRUNCATE` — and only find out what went wrong after production is already broken.

Kiro turns that moment into a learning experience.

---

## How It Works
↓  Kiro intercepts it

↓  Shadow clone of your DB spins up (Neon branch)

↓  Five AI gladiators attack the clone in parallel:
      G1 — SQL Injector       did it open injection vectors?
      G2 — Concurrency        what happens under load?
      G3 — Cascade Kill       which tables get destroyed downstream?
      G4 — Load Breaker       at what point does the DB fall over?
      G5 — Rollback Test      can you even recover from this?

↓  Game Over — a full threat report renders instead of a stack trace
Your production database is never touched.

---

## Built With

- **FastMCP** — MCP server that orchestrates the agents
- **Neon** — instant Postgres branch for the shadow clone
- **LangChain + Claude** — each gladiator is an independent AI sub-agent
- **Python / asyncio** — all five gladiators run in parallel

---

## Hackathon

Built at Kiro Spark Challenge under the Education track.

> *Teaching developers what their code actually does — without the production incident.*