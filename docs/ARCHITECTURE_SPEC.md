# ARCHITECTURE_SPEC.md
## The Colosseum — Sentient Honeypot MCP Server
### Kiro Spark Challenge | Education Frame | 13-Hour Build

---

## 1. Overview

The Colosseum is a **reactive chaos engineering training simulation** built as a custom MCP (Model Context Protocol) server. When a junior developer executes a risky database command, Kiro intercepts the semantic intent, spins up a shadow clone of the database, and orchestrates parallel sub-agents ("Gladiators") to attack the clone. The result is a gamified "Game Over" scoreboard that teaches the developer what would have happened — without touching production.

**Core Principle (Education Frame):** The system acts as scaffolding. It exposes consequences. It does not fix code for the developer.

---

## 2. System Constraints

| Constraint | Detail |
|---|---|
| Frame | Education — AI as reactive training scaffold |
| Deadline | 13 hours |
| Guardrail | AI must not execute fixes or write corrective code |
| Evaluation Signals | Build (ambition), Collaboration, Impact, Story |
| Tone | Enterprise security guardian — sleek, minimalistic, transparent grey UI |

---

## 3. High-Level Architecture

```
Developer executes risky DB command
            ↓
[INTERCEPT LAYER]
  Kiro hook detects semantic risk intent
  (preToolUse hook on shell/write tool types)
            ↓
[MCP SERVER — The Colosseum]
  Tool: create_shadow_clone()
  → Neon DB branching API spins up isolated clone
  → Original command is redirected to clone
            ↓
[ARENA — Parallel Gladiator Agents]
  ┌──────────────────────────────────────┐
  │  Gladiator 1: The Stampede           │
  │    → High concurrency stress test    │
  │                                      │
  │  Gladiator 2: The Cascade            │
  │    → Foreign key chain destruction   │
  │                                      │
  │  Gladiator 3: The Injector           │
  │    → SQL injection surface probe     │
  │                                      │
  │  Gladiator 4: The Load Breaker       │
  │    → Connection pool exhaustion      │
  │                                      │
  │  Gladiator 5: The Rollback Reaper    │
  │    → Transaction rollback failure    │
  └──────────────────────────────────────┘
            ↓
[AGGREGATOR]
  Results collected from all Gladiators
  Threat severity scored per vector
            ↓
[SCOREBOARD — Game Over UI]
  Rendered as gamified markdown report
  Delivered back to developer in Kiro chat
```

---

## 4. MCP Server Specification

### 4.1 Server Identity

```json
{
  "name": "colosseum-mcp",
  "version": "1.0.0",
  "description": "Sentient honeypot chaos engine for developer training",
  "transport": "stdio"
}
```

### 4.2 Exposed MCP Tools

#### `create_shadow_clone`
Spins up an isolated database branch using Neon's branching API.

| Field | Value |
|---|---|
| Input | `{ connection_string: string, branch_name: string }` |
| Output | `{ clone_url: string, branch_id: string, status: "ready" \| "failed" }` |
| Side Effects | Creates a Neon branch; must be cleaned up after session |

---

#### `execute_on_clone`
Executes the intercepted command against the shadow clone only.

| Field | Value |
|---|---|
| Input | `{ clone_url: string, sql_command: string }` |
| Output | `{ result: any, execution_time_ms: number, rows_affected: number }` |
| Side Effects | Mutates clone only — never touches production |

---

#### `run_gladiator`
Dispatches a single Gladiator sub-agent against the clone.

| Field | Value |
|---|---|
| Input | `{ gladiator_id: 1\|2\|3\|4\|5, clone_url: string, original_command: string }` |
| Output | `{ gladiator_name: string, survived: boolean, damage_report: string, severity: "low"\|"medium"\|"high"\|"critical" }` |
| Side Effects | Executes attack patterns against clone |

---

#### `generate_scoreboard`
Aggregates all Gladiator results into the Game Over UI.

| Field | Value |
|---|---|
| Input | `{ gladiator_results: GladiatorResult[], original_command: string, developer_id: string }` |
| Output | `{ markdown_report: string, overall_severity: string, survivors: string[], casualties: string[] }` |
| Side Effects | None — pure render function |

---

#### `destroy_shadow_clone`
Tears down the Neon branch after the session completes.

| Field | Value |
|---|---|
| Input | `{ branch_id: string }` |
| Output | `{ status: "destroyed" \| "failed" }` |
| Side Effects | Deletes Neon branch |

---

### 4.3 Tool Execution Flow

```
create_shadow_clone()
      ↓
execute_on_clone()
      ↓
run_gladiator() × 5  [parallel]
      ↓
generate_scoreboard()
      ↓
destroy_shadow_clone()
```

---

## 5. Gladiator Sub-Agent Specifications

Each Gladiator is a sub-agent with its own tool loop. They run in parallel against the shadow clone.

### Gladiator 1 — The Stampede
- **Attack Vector:** High concurrency
- **Method:** Fires 50–200 simultaneous identical queries against the clone
- **Detects:** Race conditions, lock contention, deadlocks
- **Severity Signal:** Query timeout rate, lock wait time

### Gladiator 2 — The Cascade
- **Attack Vector:** Foreign key chain destruction
- **Method:** Executes the command then traces all FK-dependent tables for cascade deletes
- **Detects:** Unintended data destruction across related tables
- **Severity Signal:** Number of downstream rows affected

### Gladiator 3 — The Injector
- **Attack Vector:** SQL injection surface
- **Method:** Wraps the original command with common injection payloads
- **Detects:** Unsanitized input vectors, parameterization gaps
- **Severity Signal:** Successful injection variants

### Gladiator 4 — The Load Breaker
- **Attack Vector:** Connection pool exhaustion
- **Method:** Opens max connections and holds them while executing the command
- **Detects:** Connection leak risk, pool starvation
- **Severity Signal:** Time to pool exhaustion

### Gladiator 5 — The Rollback Reaper
- **Attack Vector:** Transaction rollback failure
- **Method:** Wraps command in a transaction, forces a mid-execution failure, checks rollback integrity
- **Detects:** Partial write risk, non-atomic operations
- **Severity Signal:** Data state after forced rollback

---

## 6. Intercept Layer (Kiro Hook)

The intercept is implemented as a Kiro `preToolUse` hook that fires before shell or write tool executions.

```json
{
  "name": "Colosseum Intercept",
  "version": "1.0.0",
  "description": "Intercepts risky DB commands and routes them to the Colosseum MCP server",
  "when": {
    "type": "preToolUse",
    "toolTypes": ["shell", "write"]
  },
  "then": {
    "type": "askAgent",
    "prompt": "Analyze this command for database risk. If it contains destructive SQL (DROP, DELETE without WHERE, TRUNCATE, ALTER), intercept it and invoke the colosseum-mcp server to run the shadow clone simulation before allowing execution."
  }
}
```

---

## 7. Game Over UI — Scoreboard Spec

The scoreboard is rendered as a markdown report delivered in Kiro chat. Design tone: sleek, minimalistic, transparent grey.

```markdown
╔══════════════════════════════════════════════════════╗
║           ☠  THE COLOSSEUM — GAME OVER  ☠            ║
╚══════════════════════════════════════════════════════╝

  Command Intercepted:
  > DELETE FROM users WHERE status = 'inactive'

  Shadow Clone: branch_abc123 | Destroyed ✓

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  GLADIATOR RESULTS

  ⚔  The Stampede       → SURVIVED    [LOW]
  💀  The Cascade        → KILLED YOU  [CRITICAL]  ← 84,291 rows destroyed
  ⚔  The Injector       → SURVIVED    [LOW]
  💀  The Load Breaker   → KILLED YOU  [HIGH]      ← Pool exhausted in 2.3s
  ⚔  The Rollback Reaper → SURVIVED   [MEDIUM]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  OVERALL THREAT LEVEL: 🔴 CRITICAL

  Your command was NOT executed on production.
  Fix the cascade risk before proceeding.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 8. Data Flow & State Management

| State | Owner | Lifecycle |
|---|---|---|
| Shadow clone URL | MCP Server | Created on intercept, destroyed after scoreboard |
| Branch ID | MCP Server | Passed through tool chain, used for cleanup |
| Gladiator results | Aggregator | In-memory, passed to scoreboard generator |
| Scoreboard markdown | Kiro chat | Rendered once, not persisted |
| Original command | Hook context | Passed through entire flow, never executed on prod |

---

## 9. External Dependencies

| Dependency | Purpose | Notes |
|---|---|---|
| Neon DB Branching API | Shadow clone creation/destruction | Requires `NEON_API_KEY` env var |
| Kiro MCP Protocol | Tool registration and invocation | stdio transport |
| Node.js / TypeScript | MCP server runtime | Target: Node 20+ |
| `@modelcontextprotocol/sdk` | MCP server SDK | Official SDK |

---

## 10. Education Frame Guardrails

These rules are non-negotiable and must be enforced at every layer:

1. **Never execute on production.** All commands are redirected to the shadow clone only.
2. **Never write corrective code.** The system exposes risk — it does not fix it.
3. **Never suppress the scoreboard.** Even if all Gladiators survive, the report must render.
4. **Always destroy the clone.** `destroy_shadow_clone()` must be called in all exit paths, including errors.
5. **Severity must be honest.** Do not downgrade severity scores to reduce developer anxiety.

---

## 11. Out of Scope (13-Hour Deadline)

- Persistent session history / developer progress tracking
- Multi-database support (PostgreSQL only for this build)
- Authentication / multi-user isolation
- Gladiator customization UI
- CI/CD pipeline integration

---

*Generated under Kiro Spark Challenge constraints. Spec-Driven Development — no implementation code written before this document.*
