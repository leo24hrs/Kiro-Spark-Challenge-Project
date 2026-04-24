# Requirements: Static Code Scanner

## Overview

Extend the existing `colosseum-mcp` MCP server with a static code vulnerability scanner. When a developer saves or edits a source file, a Kiro `fileEdited` hook fires and invokes a new `scan_file` MCP tool that analyzes the file content for security vulnerabilities using five parallel scanner agents ("Code Gladiators").

---

## Requirements

### 1. New MCP Tool: `scan_file`

1.1 The MCP server MUST expose a `scan_file(file_path: string, file_content: string) → ScanReport` tool.
1.2 The tool MUST run all five Code Gladiator scanners in parallel using `Promise.allSettled`.
1.3 The tool MUST aggregate all `Vulnerability[]` results from all scanners into a single `ScanReport`.
1.4 The tool MUST compute `overall_severity` as the highest severity among all found vulnerabilities; if no vulnerabilities are found, `overall_severity` MUST be `"clean"`.
1.5 The tool MUST render a `markdown_report` using `renderCodeScoreboard`.
1.6 The tool MUST NOT auto-fix any vulnerabilities.
1.7 The tool MUST render the report even when severity is low.

### 2. Vulnerability Type

2.1 A `Vulnerability` MUST have: `type: string`, `severity: 'low' | 'medium' | 'high' | 'critical'`, `line: number`, `description: string`, `snippet: string`.
2.2 A `ScanReport` MUST have: `file_path: string`, `vulnerabilities: Vulnerability[]`, `overall_severity: 'low' | 'medium' | 'high' | 'critical' | 'clean'`, `markdown_report: string`.

### 3. Code Gladiator Scanners

3.1 Each scanner MUST accept `(file_path: string, lines: string[])` and return `Vulnerability[]`.
3.2 All five scanners MUST run in parallel.

3.3 **Secret Hound** detects hardcoded secrets with critical severity for AWS/Bearer tokens, high for password/secret/token, medium for generic API keys.

3.4 **Injection Scout** detects SQL injection surface with critical severity for direct user input concatenation, high for template literals in queries.

3.5 **Input Guardian** detects unvalidated user input with high severity if passed to DB/shell, medium if passed to other functions.

3.6 **Eval Watcher** detects dangerous code execution with critical severity for eval/new Function with variables, high for exec with variables.

3.7 **Exposure Detector** detects sensitive data exposure with high severity for logging secrets, medium for exposing error details.

### 4. Code Scan Scoreboard

4.1 A new `renderCodeScoreboard(report: ScanReport): string` function MUST be added to `colosseum-mcp/src/scoreboard/renderer.ts`.
4.2 The scoreboard MUST display the file path, each vulnerability with severity/type/line/description/snippet, and the overall threat level.
4.3 If no vulnerabilities are found, the scoreboard MUST display a clean message.
4.4 Severity scores MUST be honest and never downgraded.

### 5. Kiro fileEdited Hook

5.1 A new `fileEdited` Kiro hook MUST be created that fires when `.ts`, `.js`, `.py`, or `.env` files are saved.
5.2 The hook MUST invoke the `scan_file` MCP tool with the file path and content.
5.3 The hook MUST display the returned `markdown_report` to the developer.

### 6. Education Frame Guardrails

6.1 The scanner MUST NOT auto-fix vulnerabilities.
6.2 The scanner MUST expose what was found and why it is dangerous.
6.3 The scanner MUST render the report even if severity is low.
6.4 Severity scores MUST be honest and never downgraded.
