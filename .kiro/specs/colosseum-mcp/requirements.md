# Requirements: The Colosseum — Sentient Honeypot MCP Server

## Overview

The Colosseum is a reactive chaos engineering training simulation built as a custom MCP server. When a developer executes a risky database command, Kiro intercepts it, spins up a shadow clone of the database, orchestrates parallel Gladiator sub-agents to attack the clone, and renders a gamified scoreboard — all without touching production.

## Requirements

### 1. Intercept Layer

1.1 The system MUST intercept risky database commands (DROP, DELETE without WHERE, TRUNCATE, ALTER) before execution via a Kiro `preToolUse` hook on shell and write tool types.

1.2 The intercepted command MUST never be executed on the production database.

1.3 The hook MUST invoke the colosseum-mcp server to run the shadow clone simulation when a risky command is detected.

### 2. Shadow Clone Management

2.1 The system MUST create an isolated Neon DB branch (shadow clone) from the production database using the Neon Branching API.

2.2 The shadow clone MUST be created before any command execution.

2.3 The intercepted command MUST be executed against the shadow clone only.

2.4 The shadow clone MUST be destroyed after the session completes, including all error exit paths.

### 3. Gladiator Sub-Agents

3.1 The system MUST run exactly 5 Gladiator sub-agents in parallel against the shadow clone.

3.2 Each Gladiator MUST produce a result containing: gladiator name, survived status, damage report, and severity level (low/medium/high/critical).

3.3 Gladiator 1 (The Stampede) MUST test high concurrency by firing 50–200 simultaneous identical queries.

3.4 Gladiator 2 (The Cascade) MUST trace and report all FK-dependent table cascade effects.

3.5 Gladiator 3 (The Injector) MUST probe SQL injection surface by wrapping the command with common injection payloads.

3.6 Gladiator 4 (The Load Breaker) MUST test connection pool exhaustion by opening max connections while executing the command.

3.7 Gladiator 5 (The Rollback Reaper) MUST test transaction rollback integrity by forcing a mid-execution failure.

### 4. MCP Server Tools

4.1 The MCP server MUST expose `create_shadow_clone(connection_string, branch_name)` returning `{ clone_url, branch_id, status }`.

4.2 The MCP server MUST expose `execute_on_clone(clone_url, sql_command)` returning `{ result, execution_time_ms, rows_affected }`.

4.3 The MCP server MUST expose `run_gladiator(gladiator_id, clone_url, original_command)` returning `{ gladiator_name, survived, damage_report, severity }`.

4.4 The MCP server MUST expose `generate_scoreboard(gladiator_results, original_command, developer_id)` returning `{ markdown_report, overall_severity, survivors, casualties }`.

4.5 The MCP server MUST expose `destroy_shadow_clone(branch_id)` returning `{ status }`.

4.6 The MCP server MUST use stdio transport.

### 5. Scoreboard

5.1 The system MUST render a gamified markdown scoreboard in Kiro chat after all Gladiators complete.

5.2 The scoreboard MUST display each Gladiator's name, survived/killed status, severity, and damage summary.

5.3 The scoreboard MUST display an overall threat level.

5.4 The scoreboard MUST confirm the shadow clone was destroyed.

5.5 The scoreboard MUST render even if all Gladiators survive.

5.6 Severity scores MUST NOT be downgraded — they must be honest.

### 6. Education Frame Guardrails

6.1 The system MUST NOT execute fixes or write corrective code for the developer.

6.2 The system MUST expose risk consequences without resolving them.

6.3 The system MUST call `destroy_shadow_clone()` in all exit paths, including error handlers.
