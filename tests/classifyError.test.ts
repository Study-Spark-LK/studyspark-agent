import { describe, it, expect } from 'vitest';
import { classifyError } from '../src/lib/utils.js';

describe('classifyError', () => {
  // ── 429 — quota / rate-limit ───────────────────────────────────────────────

  it('returns 429 when the message contains "quota"', () => {
    const result = classifyError(new Error('quota exceeded'));
    expect(result.status).toBe(429);
    expect(result.code).toBe('GEMINI_QUOTA_EXCEEDED');
  });

  it('returns 429 when the message contains "429"', () => {
    const result = classifyError(new Error('HTTP 429 Too Many Requests'));
    expect(result.status).toBe(429);
    expect(result.code).toBe('GEMINI_QUOTA_EXCEEDED');
  });

  it('returns 429 when the message contains "resource_exhausted"', () => {
    const result = classifyError(new Error('RESOURCE_EXHAUSTED: limit hit'));
    expect(result.status).toBe(429);
    expect(result.code).toBe('GEMINI_QUOTA_EXCEEDED');
  });

  it('quota check is case-insensitive', () => {
    const result = classifyError(new Error('Quota Exceeded'));
    expect(result.status).toBe(429);
  });

  it('returns the fixed user-facing message for quota errors', () => {
    const result = classifyError(new Error('quota'));
    expect(result.message).toBe('AI service quota exceeded. Please try again later.');
  });

  // ── 504 — timeout / deadline ───────────────────────────────────────────────

  it('returns 504 when the message contains "timeout"', () => {
    const result = classifyError(new Error('timeout: request exceeded 30000ms'));
    expect(result.status).toBe(504);
    expect(result.code).toBe('GEMINI_TIMEOUT');
  });

  it('returns 504 when the message contains "timed out"', () => {
    const result = classifyError(new Error('request timed out'));
    expect(result.status).toBe(504);
    expect(result.code).toBe('GEMINI_TIMEOUT');
  });

  it('returns 504 when the message contains "deadline"', () => {
    const result = classifyError(new Error('DEADLINE_EXCEEDED'));
    expect(result.status).toBe(504);
    expect(result.code).toBe('GEMINI_TIMEOUT');
  });

  it('timeout check is case-insensitive', () => {
    const result = classifyError(new Error('Request Timed Out'));
    expect(result.status).toBe(504);
  });

  it('returns the fixed user-facing message for timeout errors', () => {
    const result = classifyError(new Error('timeout'));
    expect(result.message).toBe('AI service timed out. Please try again.');
  });

  // ── 500 — generic / unknown ────────────────────────────────────────────────

  it('returns 500 for an unrecognised Error', () => {
    const result = classifyError(new Error('Something went wrong'));
    expect(result.status).toBe(500);
    expect(result.code).toBe('AGENT_ERROR');
    expect(result.message).toBe('Something went wrong');
  });

  it('preserves the original error message for generic errors', () => {
    const msg = 'Unexpected token in JSON';
    expect(classifyError(new Error(msg)).message).toBe(msg);
  });

  it('handles a non-Error string thrown directly', () => {
    const result = classifyError('plain string error');
    expect(result.status).toBe(500);
    expect(result.message).toBe('plain string error');
  });

  it('handles a non-Error object (e.g. thrown object)', () => {
    const result = classifyError({ code: 'UNKNOWN' });
    expect(result.status).toBe(500);
    expect(result.code).toBe('AGENT_ERROR');
  });

  it('handles null thrown as an error', () => {
    const result = classifyError(null);
    expect(result.status).toBe(500);
  });

  // ── Priority: quota takes precedence if both keywords appear ──────────────

  it('classifies as quota (429) even if the message also mentions timeout', () => {
    const result = classifyError(new Error('quota timeout conflict'));
    expect(result.status).toBe(429);
  });

  // ── Group 7 additional edge cases ─────────────────────────────────────────

  it('returns 429 for "RESOURCE_EXHAUSTED" in uppercase (Google gRPC style)', () => {
    const result = classifyError(new Error('RESOURCE_EXHAUSTED: daily quota hit'));
    expect(result.status).toBe(429);
    expect(result.code).toBe('GEMINI_QUOTA_EXCEEDED');
  });

  it('returns 504 for "deadline exceeded" in lowercase', () => {
    const result = classifyError(new Error('deadline exceeded after 30s'));
    expect(result.status).toBe(504);
    expect(result.code).toBe('GEMINI_TIMEOUT');
  });

  it('returns 500 for an Error with an empty message', () => {
    const result = classifyError(new Error(''));
    expect(result.status).toBe(500);
    expect(result.code).toBe('AGENT_ERROR');
    expect(result.message).toBe('');
  });

  it('quota takes priority even when "timeout" also appears in the message', () => {
    const result = classifyError(new Error('quota limit exceeded — request timed out'));
    expect(result.status).toBe(429);
  });

  it('returns 500 for undefined input', () => {
    const result = classifyError(undefined);
    expect(result.status).toBe(500);
  });

  it('returns 500 for a numeric thrown value', () => {
    const result = classifyError(404);
    expect(result.status).toBe(500);
    expect(result.message).toBe('404');
  });

  it('status is always one of 429, 504, or 500 for any input', () => {
    const inputs: unknown[] = [
      new Error('quota'),
      new Error('timeout'),
      new Error('unknown'),
      null,
      undefined,
      'string error',
      42,
      { code: 'CUSTOM' },
    ];
    for (const input of inputs) {
      const { status } = classifyError(input);
      expect([429, 504, 500]).toContain(status);
    }
  });
});
