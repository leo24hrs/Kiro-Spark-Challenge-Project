import type { Vulnerability } from '../types.js';

/**
 * Eval Watcher — detects dangerous dynamic code execution in source files.
 * Pure function, no side effects.
 */

interface EvalPattern {
  regex: RegExp;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

const PATTERNS: EvalPattern[] = [
  {
    regex: /\beval\s*\(\s*(?!["'`][^"'`]*["'`]\s*\))/,
    type: 'DANGEROUS_EVAL',
    severity: 'critical',
    description:
      'eval() called with a dynamic argument. eval() executes arbitrary JavaScript code, making it a critical attack vector for code injection. An attacker who controls the argument can execute any code in your application context.',
  },
  {
    regex: /new\s+Function\s*\(\s*(?!["'`][^"'`]*["'`]\s*\))/,
    type: 'DANGEROUS_NEW_FUNCTION',
    severity: 'critical',
    description:
      'new Function() called with a dynamic argument. Like eval(), new Function() compiles and executes arbitrary code at runtime. If the argument is user-controlled, this is a critical remote code execution vulnerability.',
  },
  {
    regex: /\bvm\.runInNewContext\s*\(/,
    type: 'DANGEROUS_VM_EXEC',
    severity: 'critical',
    description:
      'vm.runInNewContext() detected. While vm sandboxes are intended for isolation, they are not a security boundary in Node.js. Attackers can escape the sandbox and execute arbitrary code on the host.',
  },
  {
    regex: /\bexecSync\s*\(\s*(?!["'`][^"'`]*["'`]\s*[,)])/,
    type: 'DANGEROUS_EXEC_SYNC',
    severity: 'high',
    description:
      'execSync() called with a dynamic argument. If the argument includes user-controlled input, this is a command injection vulnerability. An attacker can append shell metacharacters to execute arbitrary system commands.',
  },
  {
    regex: /\bexec\s*\(\s*(?!["'`][^"'`]*["'`]\s*[,)])/,
    type: 'DANGEROUS_EXEC',
    severity: 'high',
    description:
      'exec() called with a dynamic argument. If the argument includes user-controlled input, this is a command injection vulnerability. Use execFile() with an argument array instead to prevent shell injection.',
  },
];

export function evalWatcher(_file_path: string, lines: string[]): Vulnerability[] {
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
