/**
 * Tests for:
 *   Group 1 — Profile Analysis Output Validation
 *   Group 2 — VARK Dominant Style Derivation
 */
import { describe, it, expect } from 'vitest';
import {
  validateProfileScores,
  deriveDominantStyle,
  type ProfileScores,
} from '../src/lib/validators.js';

// ── Group 1: Profile Analysis Output Validation ───────────────────────────────

describe('validateProfileScores', () => {
  const validOutput: ProfileScores = {
    visualScore: 70,
    auditoryScore: 50,
    readingScore: 60,
    kinestheticScore: 40,
  };

  it('accepts a fully valid output', () => {
    expect(validateProfileScores(validOutput).valid).toBe(true);
  });

  it('reports no errors for a valid output', () => {
    expect(validateProfileScores(validOutput).errors).toHaveLength(0);
  });

  // All four fields present ──────────────────────────────────────────────────

  it('reports an error when visualScore is missing', () => {
    const { visualScore: _v, ...rest } = validOutput;
    const result = validateProfileScores(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('visualScore'))).toBe(true);
  });

  it('reports an error when auditoryScore is missing', () => {
    const { auditoryScore: _a, ...rest } = validOutput;
    const result = validateProfileScores(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('auditoryScore'))).toBe(true);
  });

  it('reports an error when readingScore is missing', () => {
    const { readingScore: _r, ...rest } = validOutput;
    const result = validateProfileScores(rest);
    expect(result.valid).toBe(false);
  });

  it('reports an error when kinestheticScore is missing', () => {
    const { kinestheticScore: _k, ...rest } = validOutput;
    const result = validateProfileScores(rest);
    expect(result.valid).toBe(false);
  });

  it('reports multiple errors when several fields are missing', () => {
    const result = validateProfileScores({});
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  // Score range validation ───────────────────────────────────────────────────

  it('accepts scores at the boundary of 0', () => {
    expect(validateProfileScores({ ...validOutput, visualScore: 0 }).valid).toBe(true);
  });

  it('accepts scores at the boundary of 100', () => {
    expect(validateProfileScores({ ...validOutput, visualScore: 100 }).valid).toBe(true);
  });

  it('rejects a negative score', () => {
    const result = validateProfileScores({ ...validOutput, auditoryScore: -1 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('negative'))).toBe(true);
  });

  it('rejects a score above 100', () => {
    const result = validateProfileScores({ ...validOutput, readingScore: 101 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('exceeds 100'))).toBe(true);
  });

  // Type checking ───────────────────────────────────────────────────────────

  it('rejects a string score (e.g. agent returned "70" instead of 70)', () => {
    const result = validateProfileScores({ ...validOutput, visualScore: '70' });
    expect(result.valid).toBe(false);
  });

  it('rejects null as the whole output', () => {
    expect(validateProfileScores(null).valid).toBe(false);
  });

  it('rejects an array as the whole output', () => {
    expect(validateProfileScores([]).valid).toBe(false);
  });

  it('rejects a non-object primitive', () => {
    expect(validateProfileScores('{"visualScore":50}').valid).toBe(false);
  });

  // Valid JSON with all fields (simulates real agent response) ──────────────

  it('accepts minimum valid agent response: all scores at 0', () => {
    const output = {
      visualScore: 0,
      auditoryScore: 0,
      readingScore: 0,
      kinestheticScore: 0,
    };
    expect(validateProfileScores(output).valid).toBe(true);
  });

  it('accepts additional fields beyond the four required ones', () => {
    const output = { ...validOutput, extra: 'ignored' };
    expect(validateProfileScores(output).valid).toBe(true);
  });
});

// ── Group 2: VARK Dominant Style Derivation ───────────────────────────────────

describe('deriveDominantStyle', () => {
  it('returns "visual" when visualScore is highest', () => {
    expect(deriveDominantStyle({ visual: 80, auditory: 60, reading: 50, kinesthetic: 40 }))
      .toBe('visual');
  });

  it('returns "auditory" when auditoryScore is highest', () => {
    expect(deriveDominantStyle({ visual: 30, auditory: 90, reading: 50, kinesthetic: 40 }))
      .toBe('auditory');
  });

  it('returns "reading" when readingScore is highest', () => {
    expect(deriveDominantStyle({ visual: 20, auditory: 30, reading: 75, kinesthetic: 10 }))
      .toBe('reading');
  });

  it('returns "kinesthetic" when kinestheticScore is highest', () => {
    expect(deriveDominantStyle({ visual: 10, auditory: 20, reading: 30, kinesthetic: 95 }))
      .toBe('kinesthetic');
  });

  // Ties ────────────────────────────────────────────────────────────────────

  it('returns a valid style string when all scores are equal', () => {
    const style = deriveDominantStyle({ visual: 50, auditory: 50, reading: 50, kinesthetic: 50 });
    expect(['visual', 'auditory', 'reading', 'kinesthetic']).toContain(style);
  });

  it('returns a valid style string when all scores are 0', () => {
    const style = deriveDominantStyle({ visual: 0, auditory: 0, reading: 0, kinesthetic: 0 });
    expect(['visual', 'auditory', 'reading', 'kinesthetic']).toContain(style);
  });

  it('visual wins a tie between visual and auditory (tie-break order)', () => {
    expect(deriveDominantStyle({ visual: 60, auditory: 60, reading: 20, kinesthetic: 10 }))
      .toBe('visual');
  });

  it('auditory wins a tie between auditory and reading (visual is 0)', () => {
    expect(deriveDominantStyle({ visual: 0, auditory: 60, reading: 60, kinesthetic: 0 }))
      .toBe('auditory');
  });

  // -1 handling (not yet measured) ──────────────────────────────────────────

  it('treats a score of -1 as 0', () => {
    // auditory is the only real score; -1 scores are normalised to 0
    const style = deriveDominantStyle({ visual: -1, auditory: 10, reading: -1, kinesthetic: -1 });
    expect(style).toBe('auditory');
  });

  it('treats all -1 scores as 0 (brand-new profile) and still returns a valid style', () => {
    const style = deriveDominantStyle({ visual: -1, auditory: -1, reading: -1, kinesthetic: -1 });
    expect(['visual', 'auditory', 'reading', 'kinesthetic']).toContain(style);
  });

  it('a -1 score does not win over a genuine 0', () => {
    // kinesthetic = 5 should win; others normalise to 0
    expect(deriveDominantStyle({ visual: -1, auditory: -1, reading: 0, kinesthetic: 5 }))
      .toBe('kinesthetic');
  });

  // Boundary scores ─────────────────────────────────────────────────────────

  it('handles maximum score of 100 in one dimension', () => {
    expect(deriveDominantStyle({ visual: 100, auditory: 99, reading: 99, kinesthetic: 99 }))
      .toBe('visual');
  });
});
