import type { Vulnerability } from '../types.js';

/**
 * Secret Hound — detects hardcoded secrets in source files.
 * Pure function, no side effects.
 */

interface SecretPattern {
  regex: RegExp;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

const PATTERNS: SecretPattern[] = [
  {
    regex: /AKIA[0-9A-Z]{16}/,
    type: 'HARDCODED_AWS_KEY',
    severity: 'critical',
    description:
      'AWS Access Key ID detected. Hardcoded AWS credentials can be exploited to access cloud resources, incur costs, or exfiltrate data.',
  },
  {
    regex: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/,
    type: 'HARDCODED_BEARER_TOKEN',
    severity: 'critical',
    description:
      'Bearer token detected in source code. Hardcoded auth tokens can be stolen from version control and used to impersonate users or services.',
  },
  {
    regex: /password\s*[=:]\s*["'][^"']+["']/i,
    type: 'HARDCODED_PASSWORD',
    severity: 'high',
    description:
      'Hardcoded password detected. Passwords in source code are visible to anyone with repository access and cannot be rotated without a code change.',
  },
  {
    regex: /secret\s*[=:]\s*["'][^"']+["']/i,
    type: 'HARDCODED_SECRET',
    severity: 'high',
    description:
      'Hardcoded secret detected. Secrets embedded in code are exposed in version history and build artifacts.',
  },
  {
    regex: /\btoken\s*[=:]\s*["'][^"']+["']/i,
    type: 'HARDCODED_TOKEN',
    severity: 'high',
    description:
      'Hardcoded token detected. Tokens in source code can be extracted from compiled binaries or version control history.',
  },
  {
    regex: /api[_-]?key\s*[=:]\s*["'][^"']{8,}["']/i,
    type: 'HARDCODED_API_KEY',
    severity: 'medium',
    description:
      'Hardcoded API key detected. API keys should be stored in environment variables or a secrets manager, not in source code.',
  },
];

export function secretHound(_file_path: string, lines: string[]): Vulnerability[] {
  const vulnerabilities: Vulnerability[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1; // 1-indexed

    for (const pattern of PATTERNS) {
      const match = pattern.regex.exec(line);
      if (match) {
        vulnerabilities.push({
          type: pattern.type,
          severity: pattern.severity,
          line: lineNumber,
          description: pattern.description,
          snippet: line.trim(),
        });
        // Only report the first matching pattern per line to avoid duplicate noise
        break;
      }
    }
  }

  return vulnerabilities;
}
