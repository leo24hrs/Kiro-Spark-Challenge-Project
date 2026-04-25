import type { GladiatorResult, MCQ, Vulnerability } from '../types.js';

/**
 * Source attribution shown to the user in the Learn Why modal.
 * 'claude' / 'gpt' indicate the MCQs were synthesised by an LLM call;
 * 'templates' means we fell back to the hand-written question bank.
 */
export type MCQSource = 'claude' | 'gpt' | 'templates';

export interface LLMGenerateInput {
  vulnerabilities: Vulnerability[];
  gladiators: GladiatorResult[];
  passed: boolean;
}

export interface LLMGenerateResult {
  mcqs: MCQ[];
  source: MCQSource;
}

// Haiku returns the 3-MCQ JSON in ~8–15s; Sonnet/Opus can take 25–40s for
// the same output. 60s caps a hung connection without cutting Sonnet off
// mid-generation. Override via env if you swap models.
const TIMEOUT_MS = Number(process.env['LLM_TIMEOUT_MS'] ?? 60_000);

/**
 * Returns the LLM provider currently configured via env vars.
 * Anthropic takes precedence — Claude tends to be better at structured
 * security reasoning at low temperature, which is what we want here.
 */
export function detectProvider(): 'claude' | 'gpt' | null {
  if (process.env['ANTHROPIC_API_KEY']) return 'claude';
  if (process.env['OPENAI_API_KEY']) return 'gpt';
  return null;
}

/**
 * Generate MCQs via an LLM. Returns null if no API key is configured, the
 * call times out, or the response can't be parsed into a valid MCQ shape —
 * the orchestrator is expected to fall back to the template generator in
 * any of those cases.
 *
 * Keep the surface area thin: no SDK dependency, just `fetch`.
 */
export async function generateMCQsWithLLM(input: LLMGenerateInput): Promise<LLMGenerateResult | null> {
  const provider = detectProvider();
  if (!provider) return null;

  const prompt = buildPrompt(input);

  try {
    const raw = await Promise.race([
      provider === 'claude' ? callClaude(prompt) : callOpenAI(prompt),
      timeout<string>(TIMEOUT_MS),
    ]);
    const mcqs = parseAndValidate(raw);
    if (!mcqs) return null;
    return { mcqs, source: provider };
  } catch (err) {
    console.warn('[learn-why] LLM call failed, falling back to templates:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt construction
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Tribunal of the Kiro Colosseum — a security tutor that runs at the moment a developer tries to push code that would have hurt production.

YOUR JOB
Generate exactly 3 multiple-choice questions that help the developer understand the vulnerabilities in their own code. Reference the actual snippets and the specific gladiator that flagged them so the lesson lands as personal feedback, not textbook trivia.

QUESTION SHAPE
- Question 1 — RECOGNITION. Show 4 code snippets in the options; the correct one is THE actual line that fell. Other options are plausible-but-safe variations.
- Question 2 — CONCEPT. A "why" question about the underlying principle (e.g. why parameterised queries actually work, why secrets in git can't be deleted).
- Question 3 — APPLICATION. A scenario question that tests whether the developer can spot the same mistake elsewhere.

HARD RULES
- NEVER write the corrected code. NEVER show "here's how to fix it". You are an EDUCATION tool. The developer must figure out the fix themselves.
- Each question has exactly 4 options. Exactly 1 is correct.
- Each option (correct AND incorrect) has an explanation that teaches something — wrong-answer explanations should clarify why the wrong answer is appealing-but-incorrect.
- Reference the actual file path, line number, and snippet from the input when possible.
- Reference the gladiator that struck (e.g. "The Injector broke through your defences"). Make it feel like the arena is talking to them.
- Keep the tone: terse, specific, lightly theatrical (this is the Colosseum). No emojis. No corporate-speak.

OUTPUT FORMAT
Return ONLY a JSON object — no prose, no markdown fencing, no preamble. Schema:
{
  "mcqs": [
    {
      "id": "q1",
      "question": "string",
      "context": "string (optional — file:line or short hint)",
      "options": [
        {"id": "a", "label": "string", "correct": true|false, "explanation": "string"},
        {"id": "b", "label": "string", "correct": true|false, "explanation": "string"},
        {"id": "c", "label": "string", "correct": true|false, "explanation": "string"},
        {"id": "d", "label": "string", "correct": true|false, "explanation": "string"}
      ]
    },
    ... 2 more ...
  ]
}`;

function buildPrompt(input: LLMGenerateInput): string {
  const { vulnerabilities, gladiators, passed } = input;

  if (vulnerabilities.length === 0) {
    return `The developer's code passed the static scan. No vulnerabilities were detected.

Generate 3 MCQs that test whether the developer understands WHY a clean scan is not the same as "secure" — what scanners can't see, why defaulting to safe patterns matters even when scans pass, and how to review a teammate's code adversarially.

Tone: this is the "STUDY THE TRIAL" path — congratulatory but pushing them to keep learning.

Output the JSON object only.`;
  }

  // Compact the input to keep the prompt short. Take the worst few of each
  // type — three is plenty for context, and we'd rather leave headroom for
  // the LLM to reason than blow tokens on duplicate lines.
  const order = ['critical', 'high', 'medium', 'low'];
  const top = [...vulnerabilities]
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .slice(0, 6)
    .map(v => ({
      type: v.type,
      severity: v.severity,
      file: v.file_path ?? 'unknown',
      line: v.line,
      snippet: v.snippet.slice(0, 160),
      description: v.description,
    }));

  const killers = gladiators
    .filter(g => !g.survived)
    .map(g => ({ name: g.gladiator_name, severity: g.severity, damage: g.damage_report }));

  const survivors = gladiators
    .filter(g => g.survived)
    .map(g => g.gladiator_name);

  return `The developer's code was just intercepted by the Kiro Colosseum pre-push gate.

VULNERABILITIES (worst first):
${JSON.stringify(top, null, 2)}

GLADIATORS THAT STRUCK (felled the code):
${JSON.stringify(killers, null, 2)}

GLADIATORS THE CODE SURVIVED:
${JSON.stringify(survivors)}

OVERALL OUTCOME: ${passed ? 'survived (no casualties)' : 'fell — push will be blocked'}

Generate 3 MCQs following the shape rules above. Anchor every question to specific snippets, line numbers, and gladiator names from this data — make the developer feel the arena is talking about THEIR code, not generic OWASP examples.

Output the JSON object only.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider calls
// ─────────────────────────────────────────────────────────────────────────────

interface ClaudeResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason?: string;
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env['ANTHROPIC_API_KEY']!;
  // Pinned to a dated snapshot on purpose — `-latest` aliases get retired.
  // Default to Haiku for snappy demo turnaround (~8–15s); the MCQ task is
  // structured enough that Haiku nails it. Override with Sonnet/Opus via
  // ANTHROPIC_MODEL if you want richer wording at the cost of latency.
  const model = process.env['ANTHROPIC_MODEL'] ?? 'claude-haiku-4-5-20251001';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as ClaudeResponse;
  const text = data.content?.find(c => c.type === 'text')?.text;
  if (!text) throw new Error('Anthropic response had no text content');
  return text;
}

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
}

async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env['OPENAI_API_KEY']!;
  const model = process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini';

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as OpenAIResponse;
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI response had no content');
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parsing & validation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse the LLM output and confirm it matches the MCQ contract:
 *   - Exactly 3 MCQs
 *   - Each with a non-empty question and exactly 4 options
 *   - Each MCQ has exactly one correct option
 *
 * Returns null if anything is off — better to fall back to the templates than
 * to render half-formed questions.
 */
function parseAndValidate(raw: string): MCQ[] | null {
  const cleaned = stripJsonFence(raw).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  if (!isObject(parsed) || !Array.isArray((parsed as { mcqs?: unknown }).mcqs)) return null;
  const mcqs = (parsed as { mcqs: unknown[] }).mcqs;
  if (mcqs.length !== 3) return null;

  const out: MCQ[] = [];
  for (let i = 0; i < mcqs.length; i++) {
    const m = mcqs[i];
    if (!isObject(m)) return null;
    const id = typeof m['id'] === 'string' && m['id'] ? m['id'] : `q${i + 1}`;
    const question = m['question'];
    const options = m['options'];

    if (typeof question !== 'string' || !question.trim()) return null;
    if (!Array.isArray(options) || options.length !== 4) return null;

    const validOptions = options.map((opt, j) => {
      if (!isObject(opt)) return null;
      const label = opt['label'];
      const correct = opt['correct'];
      const explanation = opt['explanation'];
      if (typeof label !== 'string' || typeof correct !== 'boolean' || typeof explanation !== 'string') return null;
      const optId = typeof opt['id'] === 'string' && opt['id'] ? opt['id'] : String.fromCharCode(97 + j);
      return { id: optId, label, correct, explanation };
    });

    if (validOptions.some(o => o === null)) return null;
    const correctCount = validOptions.filter(o => o!.correct).length;
    if (correctCount !== 1) return null;

    out.push({
      id,
      question,
      context: typeof m['context'] === 'string' ? m['context'] : undefined,
      options: validOptions as { id: string; label: string; correct: boolean; explanation: string }[],
    });
  }

  return out;
}

function stripJsonFence(s: string): string {
  // LLMs occasionally wrap JSON in ```json ... ``` despite instructions.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return fence ? fence[1]! : s;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function timeout<T>(ms: number): Promise<T> {
  return new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    // Don't keep the event loop alive just for this timer — once the real
    // promise settles, the CLI should be free to exit.
    t.unref?.();
  });
}
