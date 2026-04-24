import { readFileSync } from 'node:fs';
import type { ScanReport, Vulnerability } from '../types.js';

type Severity = 'low' | 'medium' | 'high' | 'critical';

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function highest(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function secretHound(_filePath: string, lines: string[]): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const awsPattern     = /AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9\-._~+/]+=*/;
  const highPattern    = /\b(password|secret|token)\s*[:=]\s*['"][^'"]{4,}/i;
  const genericPattern = /api[_-]?key\s*[:=]\s*['"][^'"]{4,}/i;

  lines.forEach((line, i) => {
    let severity: Severity | null = null;
    if (awsPattern.test(line)) severity = 'critical';
    else if (highPattern.test(line)) severity = 'high';
    else if (genericPattern.test(line)) severity = 'medium';

    if (severity) {
      vulns.push({
        type: 'HARDCODED_SECRET',
        severity,
        line: i + 1,
        description: 'Hardcoded secret detected. Rotate this credential immediately.',
        snippet: line.trim().slice(0, 120),
      });
    }
  });
  return vulns;
}

function injectionScout(_filePath: string, lines: string[]): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const directConcat    = /query\s*\+\s*(req\.|user|input|params|body)/i;
  const templateLiteral = /`[^`]*(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE)[^`]*\$\{/i;

  lines.forEach((line, i) => {
    if (directConcat.test(line)) {
      vulns.push({
        type: 'SQL_INJECTION',
        severity: 'critical',
        line: i + 1,
        description: 'Direct user input concatenated into SQL query. Use parameterized queries.',
        snippet: line.trim().slice(0, 120),
      });
    } else if (templateLiteral.test(line)) {
      vulns.push({
        type: 'SQL_INJECTION',
        severity: 'high',
        line: i + 1,
        description: 'Template literal used in SQL query. Use parameterized queries instead.',
        snippet: line.trim().slice(0, 120),
      });
    }
  });
  return vulns;
}

function inputGuardian(_filePath: string, lines: string[]): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const dbOrShell = /\b(query|exec|execute|spawn|shell)\s*\([^)]*\b(req\.|user|input|params|body)/i;
  const otherFunc = /\b\w+\s*\([^)]*\b(req\.|user|input|params|body)[^)]*\)/i;

  lines.forEach((line, i) => {
    if (dbOrShell.test(line)) {
      vulns.push({
        type: 'UNVALIDATED_INPUT',
        severity: 'high',
        line: i + 1,
        description: 'Unvalidated user input passed directly to DB or shell command.',
        snippet: line.trim().slice(0, 120),
      });
    } else if (otherFunc.test(line)) {
      vulns.push({
        type: 'UNVALIDATED_INPUT',
        severity: 'medium',
        line: i + 1,
        description: 'Unvalidated user input passed to a function without sanitization.',
        snippet: line.trim().slice(0, 120),
      });
    }
  });
  return vulns;
}

function evalWatcher(_filePath: string, lines: string[]): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const evalWithVar = /\beval\s*\([^)]*[a-zA-Z_$][a-zA-Z0-9_$]*[^)]*\)/;
  const newFunction = /new\s+Function\s*\([^)]*[a-zA-Z_$]/;
  const execWithVar = /\bexec\s*\([^)]*[a-zA-Z_$][a-zA-Z0-9_$]*[^)]*\)/;

  lines.forEach((line, i) => {
    if (evalWithVar.test(line) || newFunction.test(line)) {
      vulns.push({
        type: 'DANGEROUS_EVAL',
        severity: 'critical',
        line: i + 1,
        description: 'eval() or new Function() with variable input enables arbitrary code execution.',
        snippet: line.trim().slice(0, 120),
      });
    } else if (execWithVar.test(line)) {
      vulns.push({
        type: 'DANGEROUS_EVAL',
        severity: 'high',
        line: i + 1,
        description: 'exec() with variable input can execute arbitrary shell commands.',
        snippet: line.trim().slice(0, 120),
      });
    }
  });
  return vulns;
}

function exposureDetector(_filePath: string, lines: string[]): Vulnerability[] {
  const vulns: Vulnerability[] = [];
  const logSecret   = /console\.(log|error|warn)\s*\([^)]*\b(password|secret|token|key|api)/i;
  const errorExpose = /res\.(json|send)\s*\([^)]*err(or)?\b/i;

  lines.forEach((line, i) => {
    if (logSecret.test(line)) {
      vulns.push({
        type: 'SENSITIVE_DATA_EXPOSURE',
        severity: 'high',
        line: i + 1,
        description: 'Sensitive value being logged. Remove before deploying.',
        snippet: line.trim().slice(0, 120),
      });
    } else if (errorExpose.test(line)) {
      vulns.push({
        type: 'SENSITIVE_DATA_EXPOSURE',
        severity: 'medium',
        line: i + 1,
        description: 'Raw error object sent to client. May expose stack traces or internals.',
        snippet: line.trim().slice(0, 120),
      });
    }
  });
  return vulns;
}

function authHeuristic(filePath: string, lines: string[]): Vulnerability[] {
  const ext = filePath.slice(filePath.lastIndexOf('.'));
  if (ext !== '.ts' && ext !== '.js') return [];

  const vulns: Vulnerability[] = [];
  const routePattern = /\b(app|router)\.(get|post|put|delete|patch)\s*\(\s*['"`]/;
  const authPattern  = /\b(authenticate|authorize|requireAuth|isAuthenticated|verifyToken|passport\.authenticate)\b/;

  lines.forEach((line, i) => {
    if (routePattern.test(line)) {
      const window = lines.slice(Math.max(0, i - 2), i + 5).join('\n');
      if (!authPattern.test(window)) {
        const match  = line.match(/\.(get|post|put|delete|patch)\s*\(\s*(['"`])([^'"` ]+)/);
        const method = match?.[1]?.toUpperCase() ?? 'ROUTE';
        const path   = match?.[3] ?? '(unknown)';
        vulns.push({
          type: 'MISSING_AUTH_CHECK',
          severity: 'medium',
          line: i + 1,
          description: `${method} ${path} has no authentication middleware.`,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  });
  return vulns;
}

const SCANNERS = [
  secretHound,
  injectionScout,
  inputGuardian,
  evalWatcher,
  exposureDetector,
  authHeuristic,
];

export async function scanFiles(filePaths: string[]): Promise<ScanReport[]> {
  return Promise.all(filePaths.map(scanSingleFile));
}

async function scanSingleFile(filePath: string): Promise<ScanReport> {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return { file_path: filePath, vulnerabilities: [], overall_severity: 'clean', markdown_report: '' };
  }

  const lines = content.split('\n');

  const results = await Promise.allSettled(
    SCANNERS.map(scanner => Promise.resolve(scanner(filePath, lines)))
  );

  const vulns: Vulnerability[] = results
    .flatMap(r => r.status === 'fulfilled' ? r.value : [])
    .sort((a, b) => a.line - b.line);

  let overallSeverity: ScanReport['overall_severity'] = 'clean';
  for (const v of vulns) {
    overallSeverity = overallSeverity === 'clean'
      ? v.severity
      : highest(overallSeverity as Severity, v.severity);
  }

  return { file_path: filePath, vulnerabilities: vulns, overall_severity: overallSeverity, markdown_report: '' };
}
