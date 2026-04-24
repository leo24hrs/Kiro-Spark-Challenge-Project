# Implementation Plan: Static Code Scanner

## Overview

Extend the colosseum-mcp MCP server with a static code vulnerability scanner. Five parallel Code Gladiator scanners analyze source files for security vulnerabilities and render a gamified report using the existing scoreboard infrastructure.

## Tasks

- [x] 1. Add new types to colosseum-mcp/src/types.ts
  - Add Vulnerability interface with type, severity, line, description, snippet fields
  - Add ScanReport interface with file_path, vulnerabilities, overall_severity, markdown_report fields
  - _Requirements: 2.1, 2.2_

- [x] 2. Implement Code Gladiator scanners
  - [x] 2.1 Implement colosseum-mcp/src/scanners/secret-hound.ts
    - Write secretHound(file_path: string, lines: string[]): Vulnerability[]
    - Detect AWS key pattern as critical severity
    - Detect Bearer token pattern as critical severity
    - Detect hardcoded password/secret/token assignments as high severity
    - Detect hardcoded api_key assignments as medium severity
    - _Requirements: 3.1, 3.3_

  - [x] 2.2 Implement colosseum-mcp/src/scanners/injection-scout.ts
    - Write injectionScout(file_path: string, lines: string[]): Vulnerability[]
    - Detect string concatenation with SQL keywords as critical severity
    - Detect template literals with SQL keywords as high severity
    - Detect .query( without parameterization as high severity
    - _Requirements: 3.1, 3.4_

  - [x] 2.3 Implement colosseum-mcp/src/scanners/input-guardian.ts
    - Write inputGuardian(file_path: string, lines: string[]): Vulnerability[]
    - Detect req.body/query/params near database or shell calls as high severity
    - Detect req.body/query/params used without validation as medium severity
    - _Requirements: 3.1, 3.5_

  - [x] 2.4 Implement colosseum-mcp/src/scanners/eval-watcher.ts
    - Write evalWatcher(file_path: string, lines: string[]): Vulnerability[]
    - Detect eval( and new Function( with variables as critical severity
    - Detect vm.runInNewContext( as critical severity
    - Detect execSync( and exec( with variables as high severity
    - _Requirements: 3.1, 3.6_

  - [x] 2.5 Implement colosseum-mcp/src/scanners/exposure-detector.ts
    - Write exposureDetector(file_path: string, lines: string[]): Vulnerability[]
    - Detect console.log with password/secret/token/key as high severity
    - Detect res.send(err) and res.json(err) patterns as medium severity
    - Detect console.log with .env reference as high severity
    - Detect console.error with stack trace as medium severity
    - _Requirements: 3.1, 3.7_

- [x] 3. Add renderCodeScoreboard to colosseum-mcp/src/scoreboard/renderer.ts
  - Write renderCodeScoreboard(report: ScanReport): string
  - Render ASCII-art bordered header for CODE SCAN REPORT
  - Display file path section
  - Display each vulnerability with severity emoji, type, line, description, snippet
  - Display overall threat level with severity emoji
  - Display clean message when no vulnerabilities found
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Implement colosseum-mcp/src/tools/scan-file.ts
  - Write scanFile(file_path: string, file_content: string): Promise<ScanReport>
  - Split file_content into lines array
  - Run all 5 scanners in parallel via Promise.allSettled
  - Flatten all Vulnerability[] results into single array
  - Compute overall_severity as max severity or 'clean' if no vulnerabilities
  - Call renderCodeScoreboard to produce markdown_report
  - Return complete ScanReport without modifying file_content
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.1, 6.4_

- [x] 5. Register scan_file tool in colosseum-mcp/src/index.ts
  - Import scanFile from ./tools/scan-file.js
  - Register scan_file tool with Zod schema: file_path (string), file_content (string)
  - Return ScanReport as JSON text content
  - _Requirements: 1.1_

- [x] 6. Create fileEdited Kiro hook
  - Create .kiro/hooks/colosseum-code-scan.kiro.hook
  - Set eventType: fileEdited, filePatterns for ts, js, py, env files
  - Set hookAction: askAgent with prompt to read file and invoke scan_file tool
  - _Requirements: 5.1, 5.2, 5.3_

- [-] 7. Checkpoint - Verify TypeScript compilation
  - Run tsc --noEmit in colosseum-mcp/ directory
  - Ensure zero TypeScript errors across all new and modified files
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All scanners are pure functions with no side effects
- Promise.allSettled ensures scanner independence (Property 2)
- overall_severity is never downgraded below max individual severity (Property 1)
- The scan_file tool never modifies files (Property 4)
- markdown_report is always rendered (Property 5)
