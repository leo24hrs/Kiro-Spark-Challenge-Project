# Design: Static Code Scanner

## Overview

The static code scanner extends the existing colosseum-mcp MCP server with a new scan_file tool and five parallel scanner modules. It reuses the existing scoreboard infrastructure and type system, adding new types and a new renderer function.

---

## Architecture

The fileEdited Kiro Hook fires when a source file is saved. It calls the scan_file MCP Tool in colosseum-mcp/src/tools/scan-file.ts. That tool runs five Code Gladiator scanners in parallel using Promise.allSettled, aggregates all Vulnerability results, computes overall_severity, calls renderCodeScoreboard, and returns a ScanReport.

---

## New Types (colosseum-mcp/src/types.ts)

Vulnerability interface: type (string), severity ('low'|'medium'|'high'|'critical'), line (number), description (string), snippet (string).

ScanReport interface: file_path (string), vulnerabilities (Vulnerability[]), overall_severity ('low'|'medium'|'high'|'critical'|'clean'), markdown_report (string).

---

## File Structure

New files under colosseum-mcp/src/:
- scanners/secret-hound.ts
- scanners/injection-scout.ts
- scanners/input-guardian.ts
- scanners/eval-watcher.ts
- scanners/exposure-detector.ts
- tools/scan-file.ts

Updated files:
- colosseum-mcp/src/types.ts (add Vulnerability, ScanReport)
- colosseum-mcp/src/scoreboard/renderer.ts (add renderCodeScoreboard)
- colosseum-mcp/src/index.ts (register scan_file tool)

---

## Scanner Design

Each scanner is a pure function with signature: (file_path: string, lines: string[]) => Vulnerability[]

Scanners use regex pattern matching against each line. Line numbers are 1-indexed.

### Secret Hound
Detects hardcoded secrets. Patterns:
- AWS key pattern AKIA followed by 16 uppercase alphanumeric chars: critical severity
- Bearer token pattern: critical severity
- Hardcoded password assignment: high severity
- Hardcoded secret assignment: high severity
- Hardcoded token assignment: high severity
- Hardcoded api_key assignment with 8+ chars: medium severity

### Injection Scout
Detects SQL injection surface. Patterns:
- String concatenation operator near SQL keywords (SELECT, INSERT, UPDATE): critical severity
- Template literal backtick strings containing SQL keywords: high severity
- .query( call without dollar-sign parameter placeholder on same line: high severity

### Input Guardian
Detects unvalidated user input. Patterns:
- req.body, req.query, or req.params used near database query or exec calls: high severity
- req.body, req.query, or req.params used directly in function calls without validation: medium severity

### Eval Watcher
Detects dangerous code execution. Patterns:
- eval( with a variable argument: critical severity
- new Function( with a variable: critical severity
- vm.runInNewContext( call: critical severity
- execSync( with a variable argument: high severity
- exec( with a variable argument: high severity

### Exposure Detector
Detects sensitive data exposure. Patterns:
- console.log containing password, secret, token, or key: high severity
- res.send(err) or res.json(err) patterns: medium severity
- console.log containing .env reference: high severity
- console.error containing stack trace: medium severity

---

## scan_file Tool

The scanFile function accepts file_path and file_content strings. It splits content into lines, runs all 5 scanners in parallel via Promise.allSettled, collects and flattens all Vulnerability arrays, computes overall_severity as the maximum severity or 'clean' if none found, calls renderCodeScoreboard, and returns the complete ScanReport.

---

## renderCodeScoreboard Function

Signature: renderCodeScoreboard(report: ScanReport): string

Renders an ASCII-art bordered report with:
- Header: THE COLOSSEUM CODE SCAN REPORT
- File path section
- Vulnerability list with severity, type, line number, description, and snippet for each finding
- Overall threat level with emoji
- Footer message about not blocking the file

If no vulnerabilities: shows clean message instead.

---

## Kiro Hook

File: .kiro/hooks/colosseum-code-scan.kiro.hook
Event type: fileEdited
File patterns: **/*.ts, **/*.js, **/*.py, **/*.env
Action: askAgent - reads file content and invokes scan_file MCP tool, displays markdown_report

---

## Correctness Properties

Property 1: Severity monotonicity - overall_severity is always the maximum severity across all vulnerabilities, or 'clean' if the list is empty. Never lower than any individual vulnerability severity.

Property 2: Scanner independence - A failure in one scanner does not prevent others from running or reporting results (Promise.allSettled guarantees this).

Property 3: Line number validity - Every Vulnerability.line is a positive integer >= 1 and <= total lines in the file.

Property 4: No auto-fix - The scan_file tool returns a report only. It never modifies file_content or any file on disk.

Property 5: Report always rendered - markdown_report is always a non-empty string, regardless of whether vulnerabilities were found.
