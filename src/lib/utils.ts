/**
 * Shared pure helpers extracted here so they can be unit-tested
 * independently of the Express server startup in index.ts.
 */

/** Rejects with a timeout error if the promise does not resolve within `ms` milliseconds. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`timeout: request exceeded ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

/**
 * Classifies an error into a structured HTTP error response.
 * - 429 for Gemini quota / rate-limit errors
 * - 504 for timeouts
 * - 500 for everything else
 */
export function classifyError(err: unknown): { status: number; code: string; message: string } {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('quota') || lower.includes('429') || lower.includes('resource_exhausted')) {
    return {
      status: 429,
      code: 'GEMINI_QUOTA_EXCEEDED',
      message: 'AI service quota exceeded. Please try again later.',
    };
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('deadline')) {
    return {
      status: 504,
      code: 'GEMINI_TIMEOUT',
      message: 'AI service timed out. Please try again.',
    };
  }
  return { status: 500, code: 'AGENT_ERROR', message: msg };
}

/**
 * Extracts and parses JSON from an agent response string.
 *
 * Strategy (tried in order):
 *   1. Strip a markdown code fence (```json … ``` or ``` … ```) then parse.
 *   2. Scan for the first top-level JSON object `{…}` or array `[…]` and parse that.
 *   3. Attempt to parse the entire trimmed string as-is.
 *
 * Throws a descriptive error (including the first 200 chars of raw output) when
 * no valid JSON can be found.
 */
export function parseAgentJson<T>(raw: string): T {
  const trimmed = raw.trim();

  // 1. Strip a markdown fence and try parsing the content inside it.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // Fall through to the next strategy.
    }
  }

  // 2. Find the first '{' or '[' and the matching closing character, then parse.
  const firstBrace   = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const start =
    firstBrace === -1 ? firstBracket :
    firstBracket === -1 ? firstBrace :
    Math.min(firstBrace, firstBracket);

  if (start !== -1) {
    const opener = trimmed[start];
    const closer = opener === '{' ? '}' : ']';
    const end = trimmed.lastIndexOf(closer);
    if (end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        // Fall through to the next strategy.
      }
    }
  }

  // 3. Last resort: parse the whole trimmed string.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    console.error('[parseAgentJson] Failed to parse agent response:\n', raw);
    throw new Error(
      `Agent returned invalid JSON: ${trimmed.slice(0, 200)}`,
    );
  }
}
