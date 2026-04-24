# Design: The Colosseum — Sentient Honeypot MCP Server

## Overview

TypeScript/Node.js MCP server using `@modelcontextprotocol/sdk` with stdio transport. The server exposes five tools that orchestrate a full shadow-clone chaos simulation. A Kiro `preToolUse` hook triggers the flow. All Gladiator attacks run in parallel via `Promise.allSettled`. Cleanup is guaranteed via try/finally.

## Technology Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **Database:** Neon DB (PostgreSQL) — Branching API for shadow clones
- **Transport:** stdio
- **HTTP Client:** `node-fetch` or native `fetch` (Node 20) for Neon API calls
- **DB Client:** `pg` (node-postgres) for clone query execution

## Project Structure

```
colosseum-mcp/
├── src/
│   ├── index.ts                  # MCP server entry point, tool registration
│   ├── tools/
│   │   ├── create-shadow-clone.ts
│   │   ├── execute-on-clone.ts
│   │   ├── run-gladiator.ts
│   │   ├── generate-scoreboard.ts
│   │   └── destroy-shadow-clone.ts
│   ├── gladiators/
│   │   ├── stampede.ts           # Gladiator 1 — high concurrency
│   │   ├── cascade.ts            # Gladiator 2 — FK chain destruction
│   │   ├── injector.ts           # Gladiator 3 — SQL injection probe
│   │   ├── load-breaker.ts       # Gladiator 4 — connection pool exhaustion
│   │   └── rollback-reaper.ts    # Gladiator 5 — transaction rollback failure
│   ├── neon/
│   │   └── api-client.ts         # Neon Branching API wrapper
│   ├── scoreboard/
│   │   └── renderer.ts           # Markdown scoreboard renderer
│   └── types.ts                  # Shared TypeScript interfaces
├── package.json
├── tsconfig.json
└── .env.example
```

## Core Types

```typescript
interface GladiatorResult {
  gladiator_name: string;
  survived: boolean;
  damage_report: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

interface ShadowClone {
  clone_url: string;
  branch_id: string;
  status: 'ready' | 'failed';
}

type GladiatorId = 1 | 2 | 3 | 4 | 5;
```

## Tool Execution Flow

```
create_shadow_clone()
      ↓
execute_on_clone()
      ↓
Promise.allSettled([
  run_gladiator(1), run_gladiator(2), run_gladiator(3),
  run_gladiator(4), run_gladiator(5)
])
      ↓
generate_scoreboard()
      ↓
destroy_shadow_clone()  ← always called in finally block
```

## Neon API Integration

- `POST /projects/{project_id}/branches` — create branch
- `DELETE /projects/{project_id}/branches/{branch_id}` — destroy branch
- Auth: `Authorization: Bearer ${NEON_API_KEY}`
- Branch connection string constructed from Neon API response

## Intercept Hook

Registered as a Kiro `preToolUse` hook targeting `shell` and `write` tool types. The hook prompt instructs the agent to analyze the command for destructive SQL patterns and invoke the MCP server if risk is detected.

## Scoreboard Renderer

Pure function: `renderScoreboard(results, command, developerId) → string`

Severity aggregation: highest severity among all Gladiator results becomes `overall_severity`. Renders the ASCII-art bordered markdown template from the spec.

## Guardrail Enforcement

- `execute_on_clone` validates the `clone_url` is not a production connection string (rejects strings not containing `neon.tech` branch identifiers)
- `destroy_shadow_clone` is always called in a `finally` block in the orchestration flow
- `generate_scoreboard` is a pure render function — it never suggests fixes
