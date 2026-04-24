import type { Vulnerability } from '../types.js';

/**
 * Input Guardian — detects unvalidated user input usage in source files.
 * Pure function, no side effects.
 */

// Matches req.body, req.query, req.params
const USER_INPUT_PATTERN = /req\.(body|query|params)/;

// Sensitive operations: database queries, shell execution
const SENSITIVE_OP_PATTERN = /\.(query|execute|exec|run)\s*\(|execSync\s*\(|spawn\s*\(|child_process/;

// Validation indicators: .trim(), schema validation, sanitization
const VALIDATION_PATTERN = /\.trim\(\)|\.sanitize|\.validate|\.parse\(|Joi\.|yup\.|zod\.|schema\./;

export function inputGuardian(_file_path: string, lines: string[]): Vulnerability[] {
  const vulnerabilities: Vulnerability[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    if (!USER_INPUT_PATTERN.test(line)) {
      continue;
    }

    // Skip lines that already have validation
    if (VALIDATION_PATTERN.test(line)) {
      continue;
    }

    // High severity: user input passed directly to DB or shell operations on same line
    if (SENSITIVE_OP_PATTERN.test(line)) {
      vulnerabilities.push({
        type: 'UNVALIDATED_INPUT',
        severity: 'high',
        line: lineNumber,
        description:
          'Unvalidated user input (req.body/query/params) passed directly to a database or shell operation. Always validate and sanitize input before use in sensitive operations.',
        snippet: line.trim(),
      });
      continue;
    }

    // Check surrounding context (3 lines ahead) for sensitive operations
    const contextEnd = Math.min(i + 3, lines.length);
    const context = lines.slice(i, contextEnd).join('\n');

    if (SENSITIVE_OP_PATTERN.test(context)) {
      vulnerabilities.push({
        type: 'UNVALIDATED_INPUT',
        severity: 'high',
        line: lineNumber,
        description:
          'Unvalidated user input (req.body/query/params) used near a database or shell operation. Validate and sanitize all user input before passing it to sensitive operations.',
        snippet: line.trim(),
      });
      continue;
    }

    // Medium severity: user input used in function calls without validation
    if (/\w+\s*\(.*req\.(body|query|params)/.test(line)) {
      vulnerabilities.push({
        type: 'UNVALIDATED_INPUT',
        severity: 'medium',
        line: lineNumber,
        description:
          'Unvalidated user input (req.body/query/params) passed to a function without prior validation. Consider adding input validation using a schema library (zod, joi, yup) before processing user-supplied data.',
        snippet: line.trim(),
      });
    }
  }

  return vulnerabilities;
}
