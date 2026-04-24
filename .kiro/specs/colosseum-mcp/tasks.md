# Implementation Plan: The Colosseum — Sentient Honeypot MCP Server

## Overview

Build a Node.js/TypeScript MCP server that intercepts risky DB commands, spins up a Neon DB shadow clone, runs 5 parallel Gladiator sub-agents against it, renders a gamified scoreboard, and destroys the clone. All tasks are scoped for a 13-hour build.

## Tasks

- [x] 1. Project scaffold and TypeScript configuration
  - Initialize `colosseum-mcp/` directory with `npm init -y`
  - Install dependencies: `@modelcontextprotocol/sdk`, `pg`, `dotenv`, `zod`
  - Install dev dependencies: `typescript`, `@types/node`, `@types/pg`, `tsx`, `rimraf`
  - Create `tsconfig.json` targeting Node 20, `moduleResolution: bundler`, `strict: true`
  - Create `package.json` scripts: `build`, `start`, `dev`
  - Create `.env.example` with `NEON_API_KEY`, `NEON_PROJECT_ID`, `DATABASE_URL` placeholders
  - Create `src/types.ts` with all shared interfaces: `GladiatorResult`, `ShadowClone`, `GladiatorId`, `ScoreboardOutput`, `CloneExecutionResult`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 2. Neon API client
  - [x] 2.1 Implement `src/neon/api-client.ts`
    - Write `createBranch(projectId, branchName, parentBranchId?)` — calls `POST /projects/{id}/branches`, returns `{ branch_id, connection_string }`
    - Write `deleteBranch(projectId, branchId)` — calls `DELETE /projects/{id}/branches/{branch_id}`, returns `{ status }`
    - Use native `fetch` (Node 20), set `Authorization: Bearer ${NEON_API_KEY}` header
    - Throw typed errors on non-2xx responses
    - _Requirements: 2.1, 2.4_

  - [ ]* 2.2 Write unit tests for Neon API client
    - Mock `fetch` and test successful branch creation response parsing
    - Test error handling on non-2xx status codes
    - _Requirements: 2.1, 2.4_

- [x] 3. MCP tool: `create_shadow_clone`
  - [x] 3.1 Implement `src/tools/create-shadow-clone.ts`
    - Accept `{ connection_string: string, branch_name: string }`
    - Call `neon/api-client.createBranch()` with env-configured project ID
    - Return `{ clone_url: string, branch_id: string, status: "ready" | "failed" }`
    - Catch errors and return `status: "failed"` with safe error message
    - _Requirements: 2.1, 2.2, 4.1_

  - [ ]* 3.2 Write unit tests for `create_shadow_clone`
    - Test successful clone creation returns correct shape
    - Test failed API call returns `status: "failed"`
    - _Requirements: 4.1_

- [x] 4. MCP tool: `execute_on_clone`
  - [x] 4.1 Implement `src/tools/execute-on-clone.ts`
    - Accept `{ clone_url: string, sql_command: string }`
    - Validate `clone_url` contains a Neon branch identifier (guardrail: reject production-looking URLs)
    - Connect via `pg.Client`, execute the SQL command, record `execution_time_ms` and `rows_affected`
    - Return `{ result: any, execution_time_ms: number, rows_affected: number }`
    - Always close the `pg.Client` connection in a `finally` block
    - _Requirements: 2.3, 4.2, 6.1_

  - [ ]* 4.2 Write unit tests for `execute_on_clone`
    - Test that production-looking URLs are rejected
    - Test successful execution returns correct shape with timing
    - _Requirements: 2.3, 4.2_

- [x] 5. Gladiator implementations
  - [x] 5.1 Implement `src/gladiators/stampede.ts` — The Stampede
    - Accept `{ clone_url: string, original_command: string }`
    - Fire 50 simultaneous identical queries using `Promise.allSettled` over a `pg.Pool`
    - Measure query timeout rate and lock wait time
    - Return `GladiatorResult` with `gladiator_name: "The Stampede"`, `survived`, `damage_report`, `severity`
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 5.2 Implement `src/gladiators/cascade.ts` — The Cascade
    - Accept `{ clone_url: string, original_command: string }`
    - Execute the command on the clone, then query `information_schema` to find FK-dependent tables
    - Count downstream rows that would be affected by cascade deletes
    - Return `GladiatorResult` with `gladiator_name: "The Cascade"`, severity scaled by downstream row count
    - _Requirements: 3.1, 3.2, 3.4_

  - [x] 5.3 Implement `src/gladiators/injector.ts` — The Injector
    - Accept `{ clone_url: string, original_command: string }`
    - Wrap the original command with 5 common injection payloads (e.g., `' OR '1'='1`, `; DROP TABLE`, `UNION SELECT`, `--`, `/**/`)
    - Attempt each variant against the clone, count successful injections
    - Return `GladiatorResult` with `gladiator_name: "The Injector"`, severity based on successful variants
    - _Requirements: 3.1, 3.2, 3.5_

  - [x] 5.4 Implement `src/gladiators/load-breaker.ts` — The Load Breaker
    - Accept `{ clone_url: string, original_command: string }`
    - Open connections up to `pg.Pool` max (default 10), hold them open, then execute the command
    - Measure time to pool exhaustion
    - Return `GladiatorResult` with `gladiator_name: "The Load Breaker"`, severity based on exhaustion time
    - _Requirements: 3.1, 3.2, 3.6_

  - [x] 5.5 Implement `src/gladiators/rollback-reaper.ts` — The Rollback Reaper
    - Accept `{ clone_url: string, original_command: string }`
    - Begin a transaction, execute the command, force a mid-execution error (e.g., divide by zero), check ROLLBACK integrity
    - Query affected tables to verify data state matches pre-transaction state
    - Return `GladiatorResult` with `gladiator_name: "The Rollback Reaper"`, severity based on data integrity outcome
    - _Requirements: 3.1, 3.2, 3.7_

  - [ ]* 5.6 Write unit tests for each Gladiator
    - Test each Gladiator returns a valid `GladiatorResult` shape
    - Test severity is never `undefined` or outside the allowed enum
    - _Requirements: 3.2_

- [x] 6. MCP tool: `run_gladiator`
  - [x] 6.1 Implement `src/tools/run-gladiator.ts`
    - Accept `{ gladiator_id: 1|2|3|4|5, clone_url: string, original_command: string }`
    - Dispatch to the correct Gladiator module based on `gladiator_id`
    - Return the `GladiatorResult` from the dispatched Gladiator
    - Catch unhandled errors and return `severity: "critical"`, `survived: false`, with error message in `damage_report`
    - _Requirements: 3.1, 3.2, 4.3_

  - [ ]* 6.2 Write unit tests for `run_gladiator` dispatch
    - Test each `gladiator_id` 1–5 routes to the correct Gladiator
    - Test unknown `gladiator_id` returns a safe error result
    - _Requirements: 4.3_

- [x] 7. Checkpoint — Core tools functional
  - Ensure all tools so far compile without TypeScript errors (`tsc --noEmit`)
  - Ensure all non-optional tests pass
  - Ask the user if questions arise before proceeding.

- [x] 8. Scoreboard renderer and `generate_scoreboard` tool
  - [x] 8.1 Implement `src/scoreboard/renderer.ts`
    - Write pure function `renderScoreboard(results: GladiatorResult[], command: string, developerId: string, branchId: string): string`
    - Render the ASCII-art bordered markdown template matching the spec (╔══╗ border, ☠ header, ━━━ dividers)
    - Display each Gladiator row: icon (⚔ survived / 💀 killed), name, status, severity, damage summary
    - Compute `overall_severity` as the highest severity among all results
    - Include "Shadow Clone: {branchId} | Destroyed ✓" line
    - Include "Your command was NOT executed on production." footer
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 8.2 Implement `src/tools/generate-scoreboard.ts`
    - Accept `{ gladiator_results: GladiatorResult[], original_command: string, developer_id: string }`
    - Call `renderScoreboard()` and return `{ markdown_report, overall_severity, survivors, casualties }`
    - `survivors` = names of Gladiators where `survived === true`
    - `casualties` = names of Gladiators where `survived === false`
    - This is a pure function — no side effects, no fix suggestions
    - _Requirements: 4.4, 5.1, 5.2, 5.3, 5.5, 6.2_

  - [ ]* 8.3 Write unit tests for scoreboard renderer
    - Test `overall_severity` is always the highest severity present
    - Test survivors/casualties lists are correctly partitioned
    - Test scoreboard renders even when all Gladiators survive
    - Test scoreboard renders even when all Gladiators report casualties
    - _Requirements: 5.3, 5.5, 5.6_

- [x] 9. MCP tool: `destroy_shadow_clone`
  - [x] 9.1 Implement `src/tools/destroy-shadow-clone.ts`
    - Accept `{ branch_id: string }`
    - Call `neon/api-client.deleteBranch()` with env-configured project ID and the given `branch_id`
    - Return `{ status: "destroyed" | "failed" }`
    - Log destruction to stderr (visible in MCP server logs) for audit trail
    - _Requirements: 2.4, 4.5, 6.3_

  - [ ]* 9.2 Write unit tests for `destroy_shadow_clone`
    - Test successful deletion returns `status: "destroyed"`
    - Test API failure returns `status: "failed"` without throwing
    - _Requirements: 4.5, 6.3_

- [x] 10. MCP server entry point and tool registration
  - [x] 10.1 Implement `src/index.ts` — MCP server bootstrap
    - Instantiate `McpServer` from `@modelcontextprotocol/sdk/server/mcp.js`
    - Register all five tools with their Zod input schemas: `create_shadow_clone`, `execute_on_clone`, `run_gladiator`, `generate_scoreboard`, `destroy_shadow_clone`
    - Connect server to `StdioServerTransport`
    - Load `.env` via `dotenv/config`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 10.2 Wire the full orchestration flow inside `run_gladiator` or a dedicated orchestrator
    - When `run_gladiator` is called with all 5 IDs, dispatch all 5 in parallel via `Promise.allSettled`
    - Alternatively, expose an `orchestrate` internal helper that: creates clone → executes command → runs all 5 gladiators in parallel → generates scoreboard → destroys clone in `finally`
    - Ensure `destroy_shadow_clone` is always called regardless of Gladiator errors
    - _Requirements: 2.4, 3.1, 6.3_

  - [ ]* 10.3 Write integration smoke test
    - Mock Neon API and `pg` client
    - Run the full orchestration flow end-to-end
    - Assert scoreboard is returned and destroy is always called
    - _Requirements: 2.4, 3.1, 4.1–4.5, 6.3_

- [x] 11. Kiro preToolUse intercept hook
  - Create `.kiro/hooks/colosseum-intercept.json` (or register via Kiro hook API)
  - Set `eventType: "preToolUse"`, `toolTypes: "shell,write"`
  - Set `hookAction: "askAgent"` with prompt: analyze the command for destructive SQL (DROP, DELETE without WHERE, TRUNCATE, ALTER); if risky, invoke `colosseum-mcp` tools to run the shadow clone simulation before allowing execution
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 12. Checkpoint — Full pipeline integration
  - Build the project: `npm run build` — zero TypeScript errors
  - Verify MCP server starts and lists all 5 tools via stdio
  - Ensure all non-optional tests pass
  - Ask the user if questions arise before proceeding.

- [x] 13. Guardrail hardening and error resilience
  - [x] 13.1 Add production URL guardrail to `execute_on_clone`
    - Reject any `clone_url` that does not contain a Neon branch-specific hostname pattern
    - Return a clear error message: "Refusing to execute on non-clone URL"
    - _Requirements: 1.2, 6.1_

  - [x] 13.2 Ensure `destroy_shadow_clone` is called in all exit paths
    - Audit `src/index.ts` and any orchestration code for try/finally coverage
    - Add `finally` blocks wherever `create_shadow_clone` is called
    - _Requirements: 2.4, 6.3_

  - [x] 13.3 Add severity honesty enforcement to `generate_scoreboard`
    - Assert `overall_severity` is never downgraded below the max Gladiator severity
    - Add a runtime check that throws if the computed severity is lower than any individual result
    - _Requirements: 5.6_

- [x] 14. Final checkpoint — Ready to demo
  - Run full build: `npm run build`
  - Run all tests: `npm test`
  - Verify `.env.example` documents all required environment variables
  - Verify the hook file exists and is correctly configured
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster build under the 13-hour deadline
- Each task references specific requirements for traceability
- Checkpoints (tasks 7, 12, 14) are gates — do not proceed past them with failing builds
- The orchestration `finally` block (task 10.2 / 13.2) is non-negotiable per the education frame guardrails
- All Gladiator attacks target the shadow clone only — never production
- The scoreboard renderer (task 8.1) is a pure function with no side effects and no fix suggestions
