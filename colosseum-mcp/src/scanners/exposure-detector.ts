import type { Vulnerability } from '../types.js';

/**
 * Exposure Detector — detects sensitive data exposure in source files.
 * Pure function, no side effects.
 */

interface ExposurePattern {
  regex: RegExp;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

const PATTERNS: ExposurePattern[] = [
  {
    regex: /console\.log\s*\(.*\b(password|passwd|secret|token|api[_-]?key|auth|credential)\b/i,
    type: 'SENSITIVE_DATA_LOGGED',
    severity: 'high',
    description:
      'Sensitive data (password/secret/token/key) passed to console.log(). Log output is often stored in log aggregation systems accessible to ops teams and may be retained indefinitely. Never log credentials or secrets.',
  },
  {
    regex: /console\.log\s*\(.*process\.env/,
    type: 'ENV_VAR_LOGGED',
    severity: 'high',
    description:
      'Environment variable value passed to console.log(). Environment variables often contain secrets, API keys, and credentials. Logging them exposes sensitive configuration to log storage systems.',
  },
  {
    regex: /res\.(send|json)\s*\(\s*(err|error)\s*\)/,
    type: 'ERROR_DETAILS_EXPOSED',
    severity: 'medium',
    description:
      'Raw error object sent directly to the HTTP response. Error objects may contain stack traces, file paths, database connection strings, or internal implementation details that help attackers map your system.',
  },
  {
    regex: /console\.error\s*\(.*\.stack\b/,
    type: 'STACK_TRACE_LOGGED',
    severity: 'medium',
    description:
      'Stack trace logged via console.error(). Stack traces reveal internal file paths, function names, and code structure. In production, log stack traces to a secure log aggregator — never expose them to end users.',
  },
  {
    regex: /console\.(log|error|warn)\s*\(.*err(or)?\.message/,
    type: 'ERROR_MESSAGE_LOGGED',
    severity: 'medium',
    description:
      'Error message logged to console. Error messages from database drivers, HTTP clients, or file system operations may contain connection strings, file paths, or other sensitive details.',
  },
];

export function exposureDetector(_file_path: string, lines: string[]): Vulnerability[] {
  const vulnerabilities: Vulnerability[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Skip comment lines
    if (/^\s*(\/\/|#|\*)/.test(line)) {
      continue;
    }

    for (const pattern of PATTERNS) {
      if (pattern.regex.test(line)) {
        vulnerabilities.push({
          type: pattern.type,
          severity: pattern.severity,
          line: lineNumber,
          description: pattern.description,
          snippet: line.trim(),
        });
        // Report first matching pattern per line
        break;
      }
    }
  }

  return vulnerabilities;
}
