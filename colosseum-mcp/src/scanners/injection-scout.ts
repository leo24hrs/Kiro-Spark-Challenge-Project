import type { Vulnerability } from '../types.js';

/**
 * Injection Scout — detects SQL injection surface in source files.
 * Pure function, no side effects.
 */

// SQL keywords that indicate a string is being used as a query
const SQL_KEYWORDS = /\b(SELECT|INSERT|UPDATE|FROM|WHERE|JOIN|UNION|INTO|VALUES)\b/i;

// Detects string concatenation: "..." + variable or variable + "..."
const STRING_CONCAT_PATTERN = /["'`][^"'`]*["'`]\s*\+|\+\s*["'`][^"'`]*["'`]/;

// Detects template literals (backtick strings)
const TEMPLATE_LITERAL_PATTERN = /`[^`]*`/;

// Detects .query( call
const QUERY_CALL_PATTERN = /\.query\s*\(/;

export function injectionScout(_file_path: string, lines: string[]): Vulnerability[] {
  const vulnerabilities: Vulnerability[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    // Check for string concatenation with SQL keywords — highest risk
    if (SQL_KEYWORDS.test(line) && STRING_CONCAT_PATTERN.test(line)) {
      vulnerabilities.push({
        type: 'SQL_INJECTION',
        severity: 'critical',
        line: lineNumber,
        description:
          'String concatenation detected in a SQL query. Concatenating user input directly into SQL strings allows attackers to manipulate query logic, bypass authentication, or exfiltrate data.',
        snippet: line.trim(),
      });
      continue;
    }

    // Check for template literals containing SQL keywords
    if (SQL_KEYWORDS.test(line) && TEMPLATE_LITERAL_PATTERN.test(line)) {
      vulnerabilities.push({
        type: 'SQL_INJECTION',
        severity: 'high',
        line: lineNumber,
        description:
          'Template literal used in a SQL query. Template literals with interpolated variables are vulnerable to SQL injection if the interpolated values are not sanitized or parameterized.',
        snippet: line.trim(),
      });
      continue;
    }

    // Check for .query( without parameterized placeholder ($1, $2, ?, etc.)
    if (QUERY_CALL_PATTERN.test(line) && !line.includes('$') && !line.includes('?')) {
      // Only flag if the line looks like it has a string argument (not just a variable)
      if (/\.query\s*\(\s*["'`]/.test(line) || /\.query\s*\(\s*\w+\s*\+/.test(line)) {
        vulnerabilities.push({
          type: 'SQL_INJECTION',
          severity: 'high',
          line: lineNumber,
          description:
            '.query() called without parameterized placeholders. Use parameterized queries to prevent SQL injection — never build query strings by concatenation.',
          snippet: line.trim(),
        });
      }
    }
  }

  return vulnerabilities;
}
