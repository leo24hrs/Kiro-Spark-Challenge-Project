import type { GladiatorResult, MCQ, MCQOption, Vulnerability } from '../types.js';
import { generateMCQsWithLLM, type MCQSource } from './llm.js';

interface GenerateInput {
  vulnerabilities: Vulnerability[];
  gladiators: GladiatorResult[];
  passed: boolean;
}

export interface MCQBundle {
  mcqs: MCQ[];
  source: MCQSource;
}

/**
 * Try to generate Learn-Why MCQs via an LLM (Claude or GPT, whichever has a
 * key set in env). Falls back to the hand-written template bank if no LLM is
 * available, the call times out, or the response can't be validated.
 *
 * Returns both the questions and the source so the UI can attribute them
 * honestly ("CRAFTED BY CLAUDE" vs "TEMPLATE TRIAL").
 */
export async function generateMCQs(input: GenerateInput): Promise<MCQBundle> {
  const llm = await generateMCQsWithLLM(input);
  if (llm) return llm;
  return { mcqs: generateMCQsFromTemplates(input), source: 'templates' };
}

/**
 * Returns three Learn-Why MCQs sourced from the vulnerabilities the intern
 * actually wrote. The questions reference real snippets and the gladiator
 * that struck them, so the lesson lands as personal feedback — not textbook
 * trivia.
 *
 * Pure function. No fixes, no rewrites — just exposure and recall.
 */
export function generateMCQsFromTemplates(input: GenerateInput): MCQ[] {
  const { vulnerabilities, gladiators, passed } = input;

  if (vulnerabilities.length === 0) {
    return cleanRunMCQs(gladiators);
  }

  const grouped = groupByType(vulnerabilities);
  const types = Object.keys(grouped);

  const builders: Array<(vulns: Vulnerability[], glads: GladiatorResult[]) => MCQ> = [
    buildRecognitionMCQ,
    buildConceptMCQ,
    buildApplicationMCQ,
  ];

  const out: MCQ[] = [];
  for (let i = 0; i < 3; i++) {
    const type = types[i % types.length] ?? types[0]!;
    const builder = builders[i]!;
    const mcq = builder(grouped[type]!, gladiators);
    if (mcq) out.push(withId(mcq, `q${i + 1}`));
  }

  if (passed && out.length > 0) {
    out[0]!.context = 'You survived the arena — but the trial isn\'t over until you understand why your code didn\'t fall.';
  }

  return out;
}

function withId(mcq: MCQ, id: string): MCQ {
  return { ...mcq, id };
}

function groupByType(vulns: Vulnerability[]): Record<string, Vulnerability[]> {
  const out: Record<string, Vulnerability[]> = {};
  for (const v of vulns) {
    if (!out[v.type]) out[v.type] = [];
    out[v.type]!.push(v);
  }
  return out;
}

function pickWorst(vulns: Vulnerability[]): Vulnerability {
  const order = ['low', 'medium', 'high', 'critical'];
  return [...vulns].sort((a, b) => order.indexOf(b.severity) - order.indexOf(a.severity))[0]!;
}

function snippetOf(v: Vulnerability): string {
  return v.snippet.length > 80 ? v.snippet.slice(0, 77) + '…' : v.snippet;
}

// ─────────────────────────────────────────────────────────────────────────────
// Recognition MCQ — "Spot the dangerous pattern"
// ─────────────────────────────────────────────────────────────────────────────

function buildRecognitionMCQ(vulns: Vulnerability[], glads: GladiatorResult[]): MCQ {
  const v = pickWorst(vulns);
  const killer = glads.find(g => !g.survived);
  const killerName = killer?.gladiator_name ?? 'The Injector';

  switch (v.type) {
    case 'SQL_INJECTION':
      return {
        id: '',
        question: `${killerName} broke through your defences. Which of these patterns is the dangerous one — the one that lets an attacker rewrite your query?`,
        context: `Found at ${v.file_path ?? 'your code'}:${v.line}`,
        options: [
          opt('a', '`db.query("SELECT * FROM users WHERE id = " + req.params.id)`', true,
            'Correct. String concatenation hands the attacker a writable surface — they control part of the SQL the database parses. This is exactly the line that fell in your file.'),
          opt('b', '`db.query("SELECT * FROM users WHERE id = $1", [req.params.id])`', false,
            'This is a parameterised query. The driver sends the value separately from the SQL, so the database never confuses input with code. This is the safe shape.'),
          opt('c', '`db.query("SELECT * FROM users WHERE id = 1")`', false,
            'A static query with no user input has no injection surface — there\'s nothing for an attacker to control.'),
          opt('d', '`db.query("SELECT NOW()")`', false,
            'No user input, no injection vector. The attacker has nothing to hold onto.'),
        ],
      };

    case 'HARDCODED_SECRET':
      return {
        id: '',
        question: `Your scan flagged a secret on line ${v.line}. Which of these is the actual problem — not just a stylistic gripe?`,
        context: snippetOf(v),
        options: [
          opt('a', 'A literal credential committed to source.', true,
            'Correct. Once it\'s in git history, rotating the key is the only fix — even if you delete the line in the next commit, the old commit still leaks.'),
          opt('b', 'A constant that should have been an enum.', false,
            'Style preference, not a security finding. The danger is that the value is real, not how it was named.'),
          opt('c', 'A typo in a variable name.', false,
            'Wouldn\'t produce a secret-detection finding. The scanner matched on the value pattern, not the variable name.'),
          opt('d', 'An unused import.', false,
            'Linters care about that. The secret scanner only fires on credential-shaped strings.'),
        ],
      };

    case 'UNVALIDATED_INPUT':
      return {
        id: '',
        question: 'You\'re passing untrusted user input directly into a sensitive call. Which of these is the textbook example of the same mistake?',
        context: snippetOf(v),
        options: [
          opt('a', '`exec(req.body.command)`', true,
            'Correct. The user gets to choose what your shell runs. This is RCE on a silver platter — the same shape as the line that flagged in your file.'),
          opt('b', '`exec("ls -la")`', false,
            'No user input. The shell only runs what you wrote.'),
          opt('c', '`exec(allowedCommands[req.body.choice])`', false,
            'This validates by lookup — the user picks an index, you decide what runs. Safer pattern.'),
          opt('d', '`exec("git status")`', false,
            'Static command, no attacker control.'),
        ],
      };

    case 'DANGEROUS_EVAL':
      return {
        id: '',
        question: 'eval() with user input is the most dangerous primitive in the language. Why?',
        context: snippetOf(v),
        options: [
          opt('a', 'It runs whatever string the attacker provides as if you wrote it yourself.', true,
            'Correct. eval() compiles and executes arbitrary code at runtime — the attacker effectively becomes the author of your program.'),
          opt('b', 'It\'s slower than JSON.parse.', false,
            'True but irrelevant to security. The danger isn\'t performance.'),
          opt('c', 'It throws on invalid syntax.', false,
            'Throwing is the *least* dangerous outcome. The dangerous outcome is when the syntax is valid.'),
          opt('d', 'It bypasses your linter.', false,
            'The linter would flag it; the runtime would still execute it.'),
        ],
      };

    case 'SENSITIVE_DATA_EXPOSURE':
      return {
        id: '',
        question: 'You logged a value that shouldn\'t leave the process. Which of these is the most realistic blast radius?',
        context: snippetOf(v),
        options: [
          opt('a', 'The secret is now in every log aggregator, on disk, in backups, and in any third-party log forwarder.', true,
            'Correct. Logs fan out fast. Once a credential lands in stdout, assume it\'s in five external systems within the hour.'),
          opt('b', 'Only your local terminal sees it.', false,
            'In production, stdout goes to log infrastructure — Datadog, CloudWatch, Loki, etc. It doesn\'t stay local.'),
          opt('c', 'Nothing — console.log is automatically redacted.', false,
            'No standard logger redacts by default. You have to opt in to redaction; it doesn\'t come free.'),
          opt('d', 'It only affects users with debug mode enabled.', false,
            'Most production loggers don\'t distinguish — once it\'s logged, it\'s persisted.'),
        ],
      };

    case 'MISSING_AUTH_CHECK':
      return {
        id: '',
        question: `Your route at line ${v.line} has no authentication middleware. What\'s the realistic worst case?`,
        context: snippetOf(v),
        options: [
          opt('a', 'Anyone on the internet can call it and trigger whatever it does.', true,
            'Correct. Unauthenticated routes are public APIs. If it mutates data, anyone can mutate. If it reads data, anyone can read.'),
          opt('b', 'Only logged-in users can hit it.', false,
            'Without an auth check, the framework has no way to enforce that. Login state is irrelevant if nothing checks it.'),
          opt('c', 'CORS will block it.', false,
            'CORS protects browsers from cross-origin reads. It doesn\'t protect your server from direct HTTP calls.'),
          opt('d', 'Rate limiting will stop the worst abuse.', false,
            'Rate limiting slows abuse; it doesn\'t prevent unauthorised access.'),
        ],
      };

    default:
      return genericRecognition(v);
  }
}

function genericRecognition(v: Vulnerability): MCQ {
  return {
    id: '',
    question: `Your scan found a ${v.severity}-severity issue. What\'s the responsible first move?`,
    context: snippetOf(v),
    options: [
      opt('a', 'Understand the failure mode before changing the line.', true,
        'Correct. Patching without understanding is how the same bug ships again under a different name.'),
      opt('b', 'Suppress the scanner.', false,
        'Suppressing the symptom keeps the disease.'),
      opt('c', 'Wrap the line in try/catch.', false,
        'Try/catch hides errors — it does not address security findings.'),
      opt('d', 'Delete the file and start over.', false,
            'Drastic and unnecessary. The point is to learn the pattern.'),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Concept MCQ — "Why is this dangerous in principle?"
// ─────────────────────────────────────────────────────────────────────────────

function buildConceptMCQ(vulns: Vulnerability[], _glads: GladiatorResult[]): MCQ {
  const v = pickWorst(vulns);

  switch (v.type) {
    case 'SQL_INJECTION':
      return {
        id: '',
        question: 'Why does a parameterised query (`$1`, `?`, `%s`) actually prevent SQL injection — beyond just "escaping quotes"?',
        options: [
          opt('a', 'The driver sends the SQL and the values over separate channels — the database parses the SQL once, then binds the values as data.', true,
            'Correct. The values never touch the parser. There is literally no string for an attacker to break out of, because the SQL was finalised before the values arrived.'),
          opt('b', 'It HTML-escapes the input.', false,
            'HTML escaping is for browsers. SQL parameterisation is structural — it changes how the database receives the query.'),
          opt('c', 'It uses regex to strip dangerous characters.', false,
            'Blacklist approaches are why injection still happens in 2026 — there\'s always a character you forgot.'),
          opt('d', 'It runs the query inside a transaction.', false,
            'Transactions give you rollback, not protection from injection.'),
        ],
      };

    case 'HARDCODED_SECRET':
      return {
        id: '',
        question: 'A secret committed to git can\'t simply be "deleted in the next commit." Why not?',
        options: [
          opt('a', 'Git keeps every prior commit. Anyone with repo access can `git log -p` and walk back to the leaked value.', true,
            'Correct. The secret lives forever in history unless you rewrite it — and once it\'s pushed, you must assume it\'s compromised regardless. Rotate immediately.'),
          opt('b', 'Modern git auto-redacts secrets.', false,
            'It does not. Some hosts scan after the fact and notify you, but the value is still readable until you rotate.'),
          opt('c', '.gitignore retroactively removes files.', false,
            '.gitignore only stops *future* tracking. It can\'t un-commit history.'),
          opt('d', 'Force-push to main always works.', false,
            'Even if you rewrite history, every clone of the repo still has the old commit. You must rotate.'),
        ],
      };

    case 'UNVALIDATED_INPUT':
      return {
        id: '',
        question: 'What\'s the principle behind "validate at the boundary" — the rule you broke here?',
        options: [
          opt('a', 'Untrusted data should be parsed into a known shape the moment it enters your system, never carried forward as raw input.', true,
            'Correct. Once input is validated and typed at the edge, the rest of your code can safely trust it. Without that boundary, every internal function has to re-validate or risk an attack.'),
          opt('b', 'You should validate input as late as possible.', false,
            'The opposite. Late validation means many internal functions handle untrusted data, multiplying your attack surface.'),
          opt('c', 'Validation is the database\'s job.', false,
            'Constraints help, but by the time the database sees malformed input it\'s already inside your system.'),
          opt('d', 'TypeScript types prevent runtime injection.', false,
            'Types are erased at runtime. They help correctness, not security.'),
        ],
      };

    case 'DANGEROUS_EVAL':
      return {
        id: '',
        question: 'Why is "user-controlled eval" considered the equivalent of giving away your server?',
        options: [
          opt('a', 'The attacker gains the same execution privileges as your application — file system, network, environment variables, all of it.', true,
            'Correct. eval() runs in your process. Whatever your process can do, the attacker can do — read DB credentials, exfil data, drop a reverse shell.'),
          opt('b', 'It uses 100% CPU.', false,
            'Performance is not the issue. A single tiny eval can compromise the entire host.'),
          opt('c', 'It bypasses CORS.', false,
            'CORS is a browser concept; eval() is a server concern here.'),
          opt('d', 'It logs to stderr.', false,
            'Logging behaviour is irrelevant to the actual danger.'),
        ],
      };

    case 'SENSITIVE_DATA_EXPOSURE':
      return {
        id: '',
        question: 'Why is "log everything in dev, log carefully in prod" a flawed mental model?',
        options: [
          opt('a', 'The same code runs in both — if you forget to gate the log, the secret leaks in production exactly as it did in dev.', true,
            'Correct. The safer model is: never log raw secrets, ever. Treat redaction as a code-time concern, not a runtime concern.'),
          opt('b', 'Production has more disk space.', false,
            'Capacity isn\'t the issue. Sensitive logs leaking is.'),
          opt('c', 'Dev and prod use different loggers.', false,
            'Usually they don\'t. The same logger flows everywhere.'),
          opt('d', 'Prod is air-gapped.', false,
            'Almost no production system is. Logs leave the host immediately.'),
        ],
      };

    case 'MISSING_AUTH_CHECK':
      return {
        id: '',
        question: 'Why is "I added auth at the load balancer / gateway" not a substitute for an in-route check?',
        options: [
          opt('a', 'Defence-in-depth: anyone who reaches the route directly (internal call, mis-routed traffic, leaked URL) bypasses the perimeter.', true,
            'Correct. Perimeter-only auth is fragile. Routes should authoritatively check identity even when the gateway already did.'),
          opt('b', 'Gateways are deprecated.', false,
            'They aren\'t — they\'re useful, just not sufficient.'),
          opt('c', 'Express ignores gateway headers.', false,
            'It doesn\'t; gateway headers can be trusted if configured correctly. The point is they\'re not the *only* line.'),
          opt('d', 'JWTs expire.', false,
            'True but unrelated to whether the route should check.'),
        ],
      };

    default:
      return genericConcept(v);
  }
}

function genericConcept(_v: Vulnerability): MCQ {
  return {
    id: '',
    question: 'Which of these statements describes the right mental model for the issue your code triggered?',
    options: [
      opt('a', 'Treat user input as untrusted until proven otherwise — even when it "looks" safe.', true,
        'Correct. The shape of the input is irrelevant; the source is what matters.'),
      opt('b', 'Input from your own frontend is trusted.', false,
        'Anyone can call your API directly. The "frontend" is just one of many possible callers.'),
      opt('c', 'HTTPS prevents injection.', false,
        'HTTPS protects data in transit. It does nothing about what the client sends.'),
      opt('d', 'A WAF removes the need for input validation.', false,
        'WAFs are signature-based and bypassable. They are a backstop, not a substitute.'),
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Application MCQ — "Which of YOUR lines is the issue?"
// ─────────────────────────────────────────────────────────────────────────────

function buildApplicationMCQ(vulns: Vulnerability[], glads: GladiatorResult[]): MCQ {
  const real = pickWorst(vulns);
  const killer = glads.find(g => !g.survived);
  const killerName = killer?.gladiator_name ?? 'The Arena';

  const file = real.file_path ?? 'your file';
  const realSnippet = snippetOf(real);

  const decoys: string[] = applicationDecoys(real.type);

  return {
    id: '',
    question: `${killerName} struck a specific line in ${file}. Which one of these is the line that fell?`,
    context: `Hint: line ${real.line}. The other options are similar shapes from the same file family — only one matched the gladiator's strike.`,
    options: [
      opt('a', '`' + realSnippet + '`', true,
        `Correct. This is the line at ${file}:${real.line}. ${real.description}`),
      opt('b', '`' + decoys[0]! + '`', false,
        'A safer pattern. Looks similar at a glance, but the input is bounded.'),
      opt('c', '`' + decoys[1]! + '`', false,
        'Different shape — no untrusted data reaches a sensitive sink here.'),
      opt('d', '`' + decoys[2]! + '`', false,
        'Cosmetic similarity, but functionally different. This wouldn\'t trigger the scanner.'),
    ],
  };
}

function applicationDecoys(type: string): string[] {
  switch (type) {
    case 'SQL_INJECTION':
      return [
        'db.query("SELECT * FROM users WHERE id = $1", [req.params.id])',
        'db.query("SELECT NOW()")',
        'const sql = `SELECT * FROM users WHERE id = ${SAFE_CONSTANT}`',
      ];
    case 'HARDCODED_SECRET':
      return [
        'const apiKey = process.env.API_KEY',
        'const password = await secretsManager.get("db-password")',
        'const token = req.headers.authorization',
      ];
    case 'UNVALIDATED_INPUT':
      return [
        'exec(allowedCommands[req.body.choice])',
        'exec("ls -la /tmp")',
        'spawn("git", ["status"])',
      ];
    case 'DANGEROUS_EVAL':
      return [
        'JSON.parse(req.body.payload)',
        'new Function("return 42")()',
        'vm.runInNewContext("return 1+1", {})',
      ];
    case 'SENSITIVE_DATA_EXPOSURE':
      return [
        'console.log("user signed in", { id: user.id })',
        'res.status(500).json({ message: "Internal error" })',
        'logger.info("startup complete")',
      ];
    case 'MISSING_AUTH_CHECK':
      return [
        'app.get("/health", (req, res) => res.send("ok"))',
        'app.post("/admin", requireAuth, handler)',
        'router.get("/users", isAuthenticated, listUsers)',
      ];
    default:
      return [
        'const x = sanitize(input)',
        'const y = parseSchema(input)',
        'const z = constants.SAFE_VALUE',
      ];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clean run — "Study the trial"
// ─────────────────────────────────────────────────────────────────────────────

function cleanRunMCQs(_glads: GladiatorResult[]): MCQ[] {
  return [
    withId({
      id: '',
      question: 'You survived the arena — but the trial isn\'t over. Why is "no findings" not the same as "secure"?',
      context: 'A clean scan tells you what the scanner *can see*. It does not tell you what it can\'t.',
      options: [
        opt('a', 'Static analysis only catches known patterns. Logic bugs, business-rule violations, and novel attacks slip past.', true,
          'Correct. Treat a clean scan as a floor, not a ceiling. Code review and threat modelling cover what scanners can\'t.'),
        opt('b', 'A clean scan means production-ready code.', false,
          'It means the scanners didn\'t flag anything. Many critical issues are invisible to pattern matching.'),
        opt('c', 'Scanners catch all OWASP Top 10.', false,
          'They catch *patterns* associated with Top 10 categories. Novel variants frequently slip through.'),
        opt('d', 'No findings means no vulnerabilities exist.', false,
          'Survivorship bias. You didn\'t see the gladiator that wasn\'t deployed.'),
      ],
    }, 'q1'),
    withId({
      id: '',
      question: 'Which habit gives you the best long-term protection — even when scans pass?',
      options: [
        opt('a', 'Always parameterise queries by reflex, even when the input "looks safe".', true,
          'Correct. Defaulting to the safe shape means you never have to reason about whether *this particular* query is exploitable.'),
        opt('b', 'Sanitise inputs with regex before queries.', false,
          'Blacklist regex is a maintenance burden and an incomplete defence. Parameterise structurally instead.'),
        opt('c', 'Trust input from your own frontend.', false,
          'Anyone can call your API directly. The frontend is just one caller.'),
        opt('d', 'Skip validation when the route is internal.', false,
          'Internal routes leak. Defence-in-depth assumes every layer might be reached.'),
      ],
    }, 'q2'),
    withId({
      id: '',
      question: 'You\'re reviewing a teammate\'s PR that "passes the scan." What\'s the most useful next question?',
      options: [
        opt('a', '"What untrusted input does this code touch, and where is it validated?"', true,
          'Correct. Tracing untrusted data flow is the question scanners can\'t answer for you. Make it your default review prompt.'),
        opt('b', '"Did you run the linter?"', false,
          'Useful but doesn\'t change security posture. Linters and scanners overlap.'),
        opt('c', '"Did you add a try/catch?"', false,
          'Try/catch is error handling, not security. Errors aren\'t the threat.'),
        opt('d', '"Is this covered by tests?"', false,
          'Coverage matters but tests rarely encode adversarial input.'),
      ],
    }, 'q3'),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────

function opt(id: string, label: string, correct: boolean, explanation: string): MCQOption {
  return { id, label, correct, explanation };
}
