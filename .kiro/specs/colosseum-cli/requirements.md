# Requirements: colosseum-cli

## Introduction

`colosseum-cli` is a standalone Node.js/TypeScript CLI tool that acts as a pre-push security gate for developer projects. When a developer runs `npx colosseum` (or installs it as a git pre-push hook), the CLI scans staged and changed files for security vulnerabilities using the same static scanner logic already present in `colosseum-mcp`. If risky code is detected and a database connection is configured, the CLI escalates to the full Colosseum arena: it spins up a Neon DB shadow clone, dispatches all five Gladiators in parallel, renders the ASCII-art scoreboard in the terminal, and exits with code 1 to block the push. The tool exposes risk — it does not fix code.

---

## Glossary

- **CLI**: The `colosseum` command-line tool, distributed via npm and runnable with `npx colosseum`.
- **Scanner**: The static analysis engine that detects vulnerabilities in source files (reuses `colosseum-mcp` scanner logic).
- **Vulnerability**: A single security finding produced by a Scanner, with type, severity, line, description, and snippet.
- **ScanReport**: The aggregated result of scanning one file, containing all Vulnerabilities and an overall severity.
- **Shadow_Clone**: An isolated Neon DB branch created for a single simulation session.
- **Gladiator**: One of five parallel sub-agents that attack the Shadow_Clone to expose runtime risk.
- **Scoreboard**: The ASCII-art terminal report rendered after Gladiators complete, matching the existing `renderScoreboard` and `renderCodeScoreboard` style.
- **Arena_Pipeline**: The full sequence: create Shadow_Clone → run Gladiators → render Scoreboard → destroy Shadow_Clone.
- **Staged_Files**: Files returned by `git diff --staged --name-only` (files added to the git index).
- **Changed_Files**: Files returned by `git diff --name-only HEAD` (all modified tracked files).
- **DATABASE_URL**: The environment variable containing the PostgreSQL connection string used to create the Shadow_Clone.
- **Exit_Code**: The numeric process exit code returned by the CLI (0 = clean, 1 = vulnerabilities found or arena triggered).
- **Pre_Push_Hook**: A git hook script installed at `.git/hooks/pre-push` that invokes the CLI automatically before every `git push`.
- **Secret_Hound**: Scanner that detects hardcoded secrets, API keys, and passwords.
- **Injection_Scout**: Scanner that detects SQL injection surface (string-concatenated queries, unparameterized input).
- **Input_Guardian**: Scanner that detects unvalidated user input passed to DB or shell commands.
- **Eval_Watcher**: Scanner that detects `eval()` or `exec()` with user-controlled input.
- **Exposure_Detector**: Scanner that detects `.env` values committed in source files and sensitive data exposure.
- **Auth_Heuristic**: Scanner that detects missing authentication checks on route handlers.

---

## Requirements

### Requirement 1: CLI Entry Point and Invocation

**User Story:** As a developer, I want to run `npx colosseum` in my project directory, so that I can scan my staged changes for security vulnerabilities before pushing.

#### Acceptance Criteria

1. THE CLI SHALL be packaged as an npm package with a `bin` entry named `colosseum` pointing to the compiled entry point in `dist/`.
2. THE CLI SHALL be runnable via `npx colosseum` without a global install.
3. WHEN the CLI is invoked with no arguments, THE CLI SHALL scan Staged_Files and Changed_Files in the current working directory.
4. WHEN the CLI is invoked with `--help`, THE CLI SHALL print usage instructions and exit with code 0.
5. WHEN the CLI is invoked with `--version`, THE CLI SHALL print the package version and exit with code 0.
6. WHEN the CLI is invoked outside a git repository, THE CLI SHALL print an error message and exit with code 1.

---

### Requirement 2: Git File Discovery

**User Story:** As a developer, I want the CLI to automatically find the files I have changed, so that I do not have to specify them manually.

#### Acceptance Criteria

1. WHEN the CLI runs, THE CLI SHALL execute `git diff --staged --name-only` to collect Staged_Files.
2. WHEN no Staged_Files are found, THE CLI SHALL execute `git diff --name-only HEAD` to collect Changed_Files as a fallback.
3. WHEN neither Staged_Files nor Changed_Files are found, THE CLI SHALL print a message indicating no changed files were detected and exit with code 0.
4. THE CLI SHALL filter discovered files to only include those with extensions `.ts`, `.js`, `.py`, `.env`, `.sql`, `.sh`, and `.rb`.
5. WHEN a discovered file does not exist on disk, THE CLI SHALL skip that file and continue scanning remaining files.

---

### Requirement 3: Static Vulnerability Scanning

**User Story:** As a developer, I want the CLI to scan my changed files for security vulnerabilities, so that I can see what risks I am about to push.

#### Acceptance Criteria

1. WHEN changed files are discovered, THE CLI SHALL scan each file using all six scanners: Secret_Hound, Injection_Scout, Input_Guardian, Eval_Watcher, Exposure_Detector, and Auth_Heuristic.
2. THE CLI SHALL run all scanners against each file in parallel using `Promise.allSettled`.
3. WHEN a scanner throws an unhandled error, THE CLI SHALL skip that scanner's results for the affected file and continue scanning.
4. THE CLI SHALL produce a ScanReport for each scanned file containing all Vulnerabilities sorted by line number.
5. WHEN a file contains no Vulnerabilities, THE CLI SHALL record its overall_severity as `clean`.
6. THE CLI SHALL compute the overall_severity of each ScanReport as the highest severity among all Vulnerabilities in that file.
7. THE CLI SHALL NOT auto-fix, modify, or rewrite any scanned file.

---

### Requirement 4: Auth Heuristic Scanner

**User Story:** As a developer, I want the CLI to flag routes that appear to have no authentication check, so that I can identify access control gaps before they reach production.

#### Acceptance Criteria

1. THE Auth_Heuristic SHALL scan JavaScript and TypeScript files for route handler patterns (e.g., `app.get`, `app.post`, `router.get`, `router.post`, `app.delete`, `app.put`).
2. WHEN a route handler is found without a preceding or inline middleware call matching common auth patterns (e.g., `authenticate`, `authorize`, `requireAuth`, `isAuthenticated`, `verifyToken`, `passport.authenticate`), THE Auth_Heuristic SHALL produce a Vulnerability with severity `medium`.
3. THE Auth_Heuristic SHALL set the Vulnerability type to `MISSING_AUTH_CHECK`.
4. THE Auth_Heuristic SHALL include the route method and path in the Vulnerability description.
5. THE Auth_Heuristic SHALL set the Vulnerability snippet to the offending route handler line.

---

### Requirement 5: Terminal Scan Report Rendering

**User Story:** As a developer, I want to see a clear, styled report in my terminal showing what vulnerabilities were found, so that I understand what risks exist in my code.

#### Acceptance Criteria

1. WHEN scanning completes, THE CLI SHALL render a ScanReport for each file that contains at least one Vulnerability using the existing `renderCodeScoreboard` function from `colosseum-mcp/src/scoreboard/renderer.ts`.
2. THE CLI SHALL print each rendered ScanReport to stdout.
3. WHEN all scanned files are clean, THE CLI SHALL print a single clean-pass message in the Colosseum ASCII-art style and exit with code 0.
4. THE CLI SHALL print a summary line after all per-file reports showing the total number of files scanned, total Vulnerabilities found, and the highest overall severity across all files.
5. THE CLI SHALL NOT suppress any report regardless of severity level.

---

### Requirement 6: Arena Pipeline Trigger Condition

**User Story:** As a developer, I want the full Gladiator arena to run only when my code has database-related vulnerabilities and a database is configured, so that the simulation is relevant to the actual risk.

#### Acceptance Criteria

1. WHEN scanning produces at least one Vulnerability with type `SQL_INJECTION` or `UNVALIDATED_INPUT` AND the `DATABASE_URL` environment variable is set, THE CLI SHALL trigger the Arena_Pipeline.
2. WHEN scanning produces no Vulnerabilities of type `SQL_INJECTION` or `UNVALIDATED_INPUT`, THE CLI SHALL skip the Arena_Pipeline regardless of other vulnerability types found.
3. WHEN the `DATABASE_URL` environment variable is not set and the Arena_Pipeline would otherwise be triggered, THE CLI SHALL skip the Arena_Pipeline, print a notice that the arena requires `DATABASE_URL` to be configured, and continue to exit with code 1 if Vulnerabilities were found.
4. WHEN the Arena_Pipeline is triggered, THE CLI SHALL print an announcement in the Colosseum ASCII-art style before the arena begins.

---

### Requirement 7: Shadow Clone Lifecycle

**User Story:** As a developer, I want the CLI to create and destroy an isolated database branch for each simulation, so that my production database is never touched.

#### Acceptance Criteria

1. WHEN the Arena_Pipeline is triggered, THE CLI SHALL call `createShadowClone(DATABASE_URL, branch_name)` using the logic from `colosseum-mcp/src/tools/create-shadow-clone.ts`.
2. THE CLI SHALL generate a unique `branch_name` for each session using the format `colosseum-cli-{timestamp}`.
3. WHEN `createShadowClone` returns status `failed`, THE CLI SHALL print an error message, skip the Gladiator phase, and exit with code 1.
4. WHEN the Arena_Pipeline completes (successfully or with errors), THE CLI SHALL call `destroyShadowClone(branch_id)` using the logic from `colosseum-mcp/src/tools/destroy-shadow-clone.ts`.
5. THE CLI SHALL call `destroyShadowClone` in all exit paths of the Arena_Pipeline, including error handlers and process interruption signals.
6. THE CLI SHALL NOT execute any SQL command against the original `DATABASE_URL` connection during the Arena_Pipeline.

---

### Requirement 8: Gladiator Execution

**User Story:** As a developer, I want all five Gladiators to attack the shadow clone in parallel, so that I get a complete picture of the runtime risks in my code.

#### Acceptance Criteria

1. WHEN the Shadow_Clone is ready, THE CLI SHALL dispatch all five Gladiators (IDs 1 through 5) in parallel using `Promise.allSettled`.
2. THE CLI SHALL use the highest-severity SQL Vulnerability's snippet as the `original_command` passed to each Gladiator.
3. WHEN a Gladiator throws an unhandled error, THE CLI SHALL record a GladiatorResult with `survived: false`, severity `critical`, and a damage_report describing the failure.
4. THE CLI SHALL collect all five GladiatorResults before proceeding to scoreboard rendering.
5. THE CLI SHALL NOT execute any Gladiator against the original production database.

---

### Requirement 9: Arena Scoreboard Rendering

**User Story:** As a developer, I want to see the Gladiator results rendered as the Colosseum scoreboard in my terminal, so that I understand the runtime consequences of my vulnerable code.

#### Acceptance Criteria

1. WHEN all Gladiators have completed, THE CLI SHALL render the scoreboard using the existing `renderScoreboard` function from `colosseum-mcp/src/scoreboard/renderer.ts`.
2. THE CLI SHALL pass all five GladiatorResults, the intercepted SQL snippet, a developer ID derived from the git user name, and the Shadow_Clone branch_id to `renderScoreboard`.
3. THE CLI SHALL print the rendered scoreboard to stdout.
4. THE CLI SHALL render the scoreboard even when all five Gladiators survive.
5. THE CLI SHALL NOT downgrade any Gladiator severity score in the rendered output.

---

### Requirement 10: Push Blocking via Exit Code

**User Story:** As a developer, I want the CLI to exit with code 1 when vulnerabilities are found, so that it can block a git push when used as a pre-push hook.

#### Acceptance Criteria

1. WHEN any Vulnerability is found across all scanned files, THE CLI SHALL exit with code 1.
2. WHEN no Vulnerabilities are found across all scanned files, THE CLI SHALL exit with code 0.
3. WHEN the Arena_Pipeline runs and any Gladiator produces severity `high` or `critical`, THE CLI SHALL exit with code 1.
4. WHEN the Arena_Pipeline runs and all Gladiators produce severity `low` or `medium`, THE CLI SHALL exit with code 1 if Vulnerabilities were found in the static scan.
5. WHEN the CLI exits with code 1, THE CLI SHALL print the message `Push blocked. Fix your code first.` as the final line of output.

---

### Requirement 11: Git Pre-Push Hook Installation

**User Story:** As a developer, I want to install the CLI as a git pre-push hook with a single command, so that every push is automatically scanned without manual intervention.

#### Acceptance Criteria

1. WHEN the CLI is invoked with `--install-hook`, THE CLI SHALL write a Pre_Push_Hook script to `.git/hooks/pre-push` in the current working directory.
2. THE CLI SHALL set the `.git/hooks/pre-push` file to be executable (mode `0755`).
3. WHEN a `.git/hooks/pre-push` file already exists, THE CLI SHALL prompt the user to confirm overwrite before replacing it.
4. WHEN the hook is successfully installed, THE CLI SHALL print a confirmation message and exit with code 0.
5. WHEN the current directory is not a git repository, THE CLI SHALL print an error and exit with code 1.
6. THE Pre_Push_Hook script SHALL invoke `npx colosseum` and pass through its exit code to git.

---

### Requirement 12: Configuration via Environment Variables

**User Story:** As a developer, I want to configure the CLI through environment variables, so that I can integrate it into different project environments without modifying the tool.

#### Acceptance Criteria

1. THE CLI SHALL read `DATABASE_URL` to determine the connection string for Shadow_Clone creation.
2. THE CLI SHALL read `NEON_API_KEY` to authenticate with the Neon Branching API.
3. THE CLI SHALL read `NEON_PROJECT_ID` to identify the Neon project for branch creation.
4. WHEN `NEON_API_KEY` is not set and the Arena_Pipeline is triggered, THE CLI SHALL skip the Arena_Pipeline, print a notice that `NEON_API_KEY` is required for arena mode, and continue with static scan results only.
5. THE CLI SHALL support loading environment variables from a `.env` file in the current working directory if one exists.
6. THE CLI SHALL NOT log or print the value of any environment variable to stdout or stderr.

---

### Requirement 13: Education Frame Guardrails

**User Story:** As a developer, I want the CLI to show me what I wrote and why it is dangerous, so that I learn from the experience rather than having the tool silently fix my code.

#### Acceptance Criteria

1. THE CLI SHALL NOT auto-fix, rewrite, or suggest replacement code for any detected Vulnerability.
2. THE CLI SHALL display the offending code snippet and a human-readable description of why it is dangerous for every Vulnerability.
3. THE CLI SHALL render the full Scoreboard even when all Gladiators survive.
4. THE CLI SHALL NOT suppress or downgrade any Vulnerability severity score.
5. WHEN the CLI exits with code 1, THE CLI SHALL display the count of Vulnerabilities found and their severity distribution before the exit message.

---

### Requirement 14: Project Structure and Build

**User Story:** As a developer maintaining the Colosseum project, I want the CLI to live in its own directory with its own build, so that it is independently deployable and does not couple to the MCP server build.

#### Acceptance Criteria

1. THE CLI SHALL reside in a `colosseum-cli/` directory at the workspace root.
2. THE CLI SHALL have its own `package.json` with `name: "colosseum"`, a `bin.colosseum` entry pointing to `dist/index.js`, and TypeScript build scripts.
3. THE CLI SHALL be written in TypeScript and compiled to `dist/` via `tsc`.
4. THE CLI SHALL import scanner logic and renderer functions from `colosseum-mcp/src/` using relative path imports or by declaring `colosseum-mcp` as a local workspace dependency.
5. THE CLI SHALL have a `tsconfig.json` targeting Node 20 with `module: NodeNext` and `moduleResolution: NodeNext`.
6. WHEN `npm run build` is executed in `colosseum-cli/`, THE CLI SHALL compile without TypeScript errors.
