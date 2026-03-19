import { describe, it, expect } from 'vitest';
import { parseAgentJson } from '../src/lib/utils.js';

describe('parseAgentJson', () => {
  // ── Strategy 1: markdown fence ─────────────────────────────────────────────

  it('parses JSON wrapped in a ```json fence', () => {
    const raw = '```json\n{"topic": "Photosynthesis"}\n```';
    expect(parseAgentJson(raw)).toEqual({ topic: 'Photosynthesis' });
  });

  it('parses JSON wrapped in a plain ``` fence (no language tag)', () => {
    const raw = '```\n{"score": 42}\n```';
    expect(parseAgentJson(raw)).toEqual({ score: 42 });
  });

  it('parses a JSON array inside a ```json fence', () => {
    const raw = '```json\n[{"id":"fc_001","front":"Q","back":"A"}]\n```';
    expect(parseAgentJson(raw)).toEqual([{ id: 'fc_001', front: 'Q', back: 'A' }]);
  });

  it('handles a fence with no trailing newline before closing backticks', () => {
    const raw = '```json\n{"ok":true}```';
    expect(parseAgentJson(raw)).toEqual({ ok: true });
  });

  it('is case-insensitive on the fence language tag (```JSON)', () => {
    const raw = '```JSON\n{"x":1}\n```';
    expect(parseAgentJson(raw)).toEqual({ x: 1 });
  });

  // ── Strategy 2: extract first { } or [ ] block ────────────────────────────

  it('strips leading prose and parses the first JSON object', () => {
    const raw = 'Here is the result:\n{"topic":"DNA","difficulty":"advanced"}';
    expect(parseAgentJson(raw)).toEqual({ topic: 'DNA', difficulty: 'advanced' });
  });

  it('strips trailing prose after the closing brace', () => {
    const raw = '{"updated":true} Done!';
    expect(parseAgentJson(raw)).toEqual({ updated: true });
  });

  it('extracts the first JSON array when the response has surrounding text', () => {
    const raw = 'Cards:\n[{"front":"Q1","back":"A1"}]\nEnd.';
    expect(parseAgentJson(raw)).toEqual([{ front: 'Q1', back: 'A1' }]);
  });

  it('prefers an object over an array when the object starts first', () => {
    const raw = '{"a":1} and also [1,2,3]';
    expect(parseAgentJson(raw)).toEqual({ a: 1 });
  });

  // ── Strategy 3: plain JSON (no fence, no preamble) ────────────────────────

  it('parses a plain JSON object string directly', () => {
    const raw = '{"varkDelta":{"visual":2,"auditory":1,"reading":0,"kinesthetic":1}}';
    expect(parseAgentJson(raw)).toEqual({
      varkDelta: { visual: 2, auditory: 1, reading: 0, kinesthetic: 1 },
    });
  });

  it('parses a plain JSON array string directly', () => {
    const raw = '[1, 2, 3]';
    expect(parseAgentJson(raw)).toEqual([1, 2, 3]);
  });

  it('handles extra whitespace / indentation', () => {
    const raw = '  \n  { "a" : 1 }  \n  ';
    expect(parseAgentJson(raw)).toEqual({ a: 1 });
  });

  // ── Nested and complex shapes ─────────────────────────────────────────────

  it('parses deeply nested JSON correctly', () => {
    const raw = '```json\n{"questions":[{"id":"q1","options":["A","B","C","D"]}]}\n```';
    expect(parseAgentJson(raw)).toEqual({
      questions: [{ id: 'q1', options: ['A', 'B', 'C', 'D'] }],
    });
  });

  // ── Invalid input ─────────────────────────────────────────────────────────

  it('throws when the input is not valid JSON at all', () => {
    expect(() => parseAgentJson('this is just plain text')).toThrow(
      /Agent returned invalid JSON/,
    );
  });

  it('throws when the fence content is malformed JSON', () => {
    // The fence match succeeds but JSON.parse fails, so it falls through all strategies
    expect(() => parseAgentJson('```json\n{bad json\n```')).toThrow(
      /Agent returned invalid JSON/,
    );
  });

  it('throws on an empty string', () => {
    expect(() => parseAgentJson('')).toThrow(/Agent returned invalid JSON/);
  });

  it('includes the first 200 chars of the bad output in the error message', () => {
    const bad = 'not json at all here';
    expect(() => parseAgentJson(bad)).toThrow(bad);
  });

  // ── Group 6 additional edge cases ─────────────────────────────────────────

  it('throws when input is only whitespace (no JSON content)', () => {
    expect(() => parseAgentJson('   \n\t  ')).toThrow(/Agent returned invalid JSON/);
  });

  it('parses the literal string "null" → returns null', () => {
    expect(parseAgentJson<null>('null')).toBeNull();
  });

  it('parses "null" inside a fence → returns null', () => {
    expect(parseAgentJson<null>('```json\nnull\n```')).toBeNull();
  });

  it('parses outer JSON correctly when a field value contains a nested JSON string', () => {
    // The outer object must be returned; the inner serialised JSON is just a string value
    const raw = '{"data": "{\\"key\\": 1}", "ok": true}';
    const result = parseAgentJson<{ data: string; ok: boolean }>(raw);
    expect(result.ok).toBe(true);
    expect(typeof result.data).toBe('string');
  });

  it('parses a very long input (>10 000 chars) correctly', () => {
    const longValue = 'x'.repeat(10_000);
    const raw = `{"big":"${longValue}"}`;
    const result = parseAgentJson<{ big: string }>(raw);
    expect(result.big).toHaveLength(10_000);
  });

  it('parses JSON containing unicode characters correctly', () => {
    const raw = '{"greeting": "こんにちは 🌸", "score": 42}';
    const result = parseAgentJson<{ greeting: string; score: number }>(raw);
    expect(result.greeting).toBe('こんにちは 🌸');
    expect(result.score).toBe(42);
  });

  it('returns an array when a JSON array is at the root level (plain)', () => {
    const raw = '[{"id": 1}, {"id": 2}]';
    const result = parseAgentJson<Array<{ id: number }>>(raw);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
  });

  it('returns an array at root level when wrapped in a fence', () => {
    const raw = '```json\n[1, 2, 3]\n```';
    expect(parseAgentJson<number[]>(raw)).toEqual([1, 2, 3]);
  });

  it('handles numbers as top-level JSON values', () => {
    expect(parseAgentJson<number>('42')).toBe(42);
  });

  it('handles boolean true/false as top-level JSON values', () => {
    expect(parseAgentJson<boolean>('true')).toBe(true);
    expect(parseAgentJson<boolean>('false')).toBe(false);
  });
});
