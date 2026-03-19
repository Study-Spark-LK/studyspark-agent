/**
 * Tests for:
 *   - clamp() in updateUserProfile.tool.ts
 *   - varkDeltaForAccuracy() in validators.ts (shared with quizScoring.test.ts
 *     which tests it via computeVarkDeltas; kept here for the threshold contract)
 */
import { describe, it, expect } from 'vitest';
import { clamp } from '../src/tools/updateUserProfile.tool.js';
import { varkDeltaForAccuracy } from '../src/lib/validators.js';

// ── clamp ─────────────────────────────────────────────────────────────────────

describe('clamp (VARK delta)', () => {
  it('passes 0 through unchanged', () => {
    expect(clamp(0)).toBe(0);
  });

  it('passes 1 through unchanged', () => {
    expect(clamp(1)).toBe(1);
  });

  it('passes 2 through unchanged', () => {
    expect(clamp(2)).toBe(2);
  });

  it('clamps negative values to 0', () => {
    expect(clamp(-1)).toBe(0);
    expect(clamp(-100)).toBe(0);
  });

  it('clamps values greater than 2 to 2', () => {
    expect(clamp(3)).toBe(2);
    expect(clamp(100)).toBe(2);
  });

  it('rounds 1.5 up to 2', () => {
    expect(clamp(1.5)).toBe(2);
  });

  it('rounds 1.4 down to 1', () => {
    expect(clamp(1.4)).toBe(1);
  });

  it('rounds 0.5 up to 1', () => {
    expect(clamp(0.5)).toBe(1);
  });

  it('rounds 0.4 down to 0', () => {
    expect(clamp(0.4)).toBe(0);
  });

  it('rounds and then clamps: 2.6 → rounds to 3 → clamps to 2', () => {
    expect(clamp(2.6)).toBe(2);
  });

  it('rounds and then clamps: -0.4 → rounds to 0 → stays 0', () => {
    expect(clamp(-0.4)).toBe(0);
  });
});

// ── VARK delta scoring thresholds ─────────────────────────────────────────────

describe('varkDeltaForAccuracy — scoring thresholds', () => {
  it('returns 2 when accuracy is exactly 70%', () => {
    expect(varkDeltaForAccuracy(7, 10)).toBe(2);
  });

  it('returns 2 when accuracy is above 70%', () => {
    expect(varkDeltaForAccuracy(10, 10)).toBe(2);
    expect(varkDeltaForAccuracy(8, 10)).toBe(2);
  });

  it('returns 1 when accuracy is exactly 40%', () => {
    expect(varkDeltaForAccuracy(4, 10)).toBe(1);
  });

  it('returns 1 when accuracy is between 40% and 69%', () => {
    expect(varkDeltaForAccuracy(5, 10)).toBe(1);
    expect(varkDeltaForAccuracy(6, 10)).toBe(1);
  });

  it('returns 0 when accuracy is below 40%', () => {
    expect(varkDeltaForAccuracy(3, 10)).toBe(0);
    expect(varkDeltaForAccuracy(0, 10)).toBe(0);
  });

  it('returns 0 when there are no questions (avoids division by zero)', () => {
    expect(varkDeltaForAccuracy(0, 0)).toBe(0);
  });

  it('delta values are always in [0, 2] for any accuracy', () => {
    for (let correct = 0; correct <= 10; correct++) {
      const delta = varkDeltaForAccuracy(correct, 10);
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(2);
    }
  });

  // Same thresholds apply to all four dimensions ────────────────────────────
  // (The function is dimension-agnostic; the caller passes dimension-filtered
  //  counts. These tests confirm thresholds hold regardless of what "dimension"
  //  is conceptually being tested.)

  it('visual dimension: 8/10 → delta 2', () => {
    expect(varkDeltaForAccuracy(8, 10)).toBe(2);
  });

  it('auditory dimension: 5/10 → delta 1', () => {
    expect(varkDeltaForAccuracy(5, 10)).toBe(1);
  });

  it('reading dimension: 2/10 → delta 0', () => {
    expect(varkDeltaForAccuracy(2, 10)).toBe(0);
  });

  it('kinesthetic dimension: 7/10 → delta 2', () => {
    expect(varkDeltaForAccuracy(7, 10)).toBe(2);
  });

  it('delta is never negative for any dimension', () => {
    expect(varkDeltaForAccuracy(0, 10)).toBeGreaterThanOrEqual(0);
  });

  it('delta never exceeds 2 for any dimension', () => {
    expect(varkDeltaForAccuracy(10, 10)).toBeLessThanOrEqual(2);
  });

  // Boundary cases
  it('69% accuracy (6.9/10 ≈ rounded) → delta 1', () => {
    // 69 out of 100 questions → 1
    expect(varkDeltaForAccuracy(69, 100)).toBe(1);
  });

  it('70% accuracy exactly (70/100) → delta 2', () => {
    expect(varkDeltaForAccuracy(70, 100)).toBe(2);
  });

  it('39% accuracy (39/100) → delta 0', () => {
    expect(varkDeltaForAccuracy(39, 100)).toBe(0);
  });

  it('40% accuracy exactly (40/100) → delta 1', () => {
    expect(varkDeltaForAccuracy(40, 100)).toBe(1);
  });
});
