/**
 * Tests for:
 *   Group 3 — Quiz Evaluation Scoring
 *   Group 4 — VARK Dimension Tagging
 *   Group 10 — Quiz Delta Scoring Thresholds (all 4 dimensions, delta bounds)
 */
import { describe, it, expect } from 'vitest';
import {
  scoreQuiz,
  isValidVarkDimension,
  VALID_VARK_DIMENSIONS,
  varkDeltaForAccuracy,
  computeVarkDeltas,
  type ScoredQuestion,
  type SubmittedAnswer,
} from '../src/lib/validators.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQuestion(
  id: string,
  correct: string,
  dim: string = 'reading',
): ScoredQuestion {
  return { questionId: id, correct_answer: correct, vark_dimension: dim };
}

function makeAnswer(questionId: string, selected: string): SubmittedAnswer {
  return { questionId, selectedAnswer: selected };
}

// ── Group 3: Quiz Evaluation Scoring ─────────────────────────────────────────

describe('scoreQuiz', () => {
  it('returns score 100 when all 10 answers are correct', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(`q${i}`, 'correct'),
    );
    const answers = questions.map((q) => makeAnswer(q.questionId, 'correct'));
    expect(scoreQuiz(questions, answers)).toEqual({
      score: 100,
      correctCount: 10,
      totalQuestions: 10,
    });
  });

  it('returns score 0 when all 10 answers are wrong', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(`q${i}`, 'correct'),
    );
    const answers = questions.map((q) => makeAnswer(q.questionId, 'wrong'));
    expect(scoreQuiz(questions, answers)).toEqual({
      score: 0,
      correctCount: 0,
      totalQuestions: 10,
    });
  });

  it('returns score 70 when 7 of 10 answers are correct', () => {
    const questions = Array.from({ length: 10 }, (_, i) =>
      makeQuestion(`q${i}`, 'correct'),
    );
    const answers = [
      ...questions.slice(0, 7).map((q) => makeAnswer(q.questionId, 'correct')),
      ...questions.slice(7).map((q) => makeAnswer(q.questionId, 'wrong')),
    ];
    const result = scoreQuiz(questions, answers);
    expect(result.score).toBe(70);
    expect(result.correctCount).toBe(7);
    expect(result.totalQuestions).toBe(10);
  });

  it('correct answer matching is case-sensitive', () => {
    const questions = [makeQuestion('q1', 'Mitosis')];
    // 'mitosis' !== 'Mitosis' → wrong
    const answers = [makeAnswer('q1', 'mitosis')];
    expect(scoreQuiz(questions, answers).correctCount).toBe(0);
  });

  it('correct answer matching is exact — trailing space fails', () => {
    const questions = [makeQuestion('q1', 'Mitosis')];
    const answers = [makeAnswer('q1', 'Mitosis ')];
    expect(scoreQuiz(questions, answers).correctCount).toBe(0);
  });

  it('a missing answer (question not submitted) counts as wrong', () => {
    const questions = [makeQuestion('q1', 'A'), makeQuestion('q2', 'B')];
    const answers = [makeAnswer('q1', 'A')]; // q2 not answered
    const result = scoreQuiz(questions, answers);
    expect(result.correctCount).toBe(1);
    expect(result.totalQuestions).toBe(2);
    expect(result.score).toBe(50);
  });

  it('extra submitted answers beyond the question list are ignored', () => {
    const questions = [makeQuestion('q1', 'A')];
    const answers = [
      makeAnswer('q1', 'A'),
      makeAnswer('q99', 'extra'), // no matching question
    ];
    const result = scoreQuiz(questions, answers);
    expect(result.totalQuestions).toBe(1);
    expect(result.correctCount).toBe(1);
  });

  it('returns score 0 and totalQuestions 0 for an empty question list', () => {
    expect(scoreQuiz([], [])).toEqual({ score: 0, correctCount: 0, totalQuestions: 0 });
  });

  it('handles a single correct answer', () => {
    expect(
      scoreQuiz([makeQuestion('q1', 'Yes')], [makeAnswer('q1', 'Yes')]),
    ).toEqual({ score: 100, correctCount: 1, totalQuestions: 1 });
  });

  it('handles a single wrong answer', () => {
    expect(
      scoreQuiz([makeQuestion('q1', 'Yes')], [makeAnswer('q1', 'No')]),
    ).toEqual({ score: 0, correctCount: 0, totalQuestions: 1 });
  });

  it('score is an integer (rounds correctly for 1/3)', () => {
    const questions = Array.from({ length: 3 }, (_, i) => makeQuestion(`q${i}`, 'A'));
    const answers = [makeAnswer('q0', 'A'), makeAnswer('q1', 'B'), makeAnswer('q2', 'B')];
    const { score } = scoreQuiz(questions, answers);
    expect(Number.isInteger(score)).toBe(true);
    expect(score).toBe(33); // Math.round(100/3) === 33
  });
});

// ── Group 4: VARK Dimension Tagging ──────────────────────────────────────────

describe('isValidVarkDimension', () => {
  it.each(VALID_VARK_DIMENSIONS)('"%s" is a valid dimension', (dim) => {
    expect(isValidVarkDimension(dim)).toBe(true);
  });

  it('rejects an unknown string', () => {
    expect(isValidVarkDimension('spatial')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidVarkDimension('')).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidVarkDimension(null)).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidVarkDimension(undefined)).toBe(false);
  });

  it('rejects a dimension with wrong capitalisation ("Visual")', () => {
    expect(isValidVarkDimension('Visual')).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidVarkDimension(1)).toBe(false);
  });
});

describe('every quiz question must have a valid vark_dimension', () => {
  it('all questions in a well-formed quiz have a valid vark_dimension', () => {
    const questions: ScoredQuestion[] = [
      makeQuestion('q1', 'A', 'visual'),
      makeQuestion('q2', 'B', 'auditory'),
      makeQuestion('q3', 'C', 'reading'),
      makeQuestion('q4', 'D', 'kinesthetic'),
    ];
    for (const q of questions) {
      expect(isValidVarkDimension(q.vark_dimension)).toBe(true);
    }
  });

  it('detects a question with a null vark_dimension', () => {
    const q = { questionId: 'q1', correct_answer: 'A', vark_dimension: null };
    expect(isValidVarkDimension(q.vark_dimension)).toBe(false);
  });

  it('detects a question with an undefined vark_dimension', () => {
    const q: ScoredQuestion = { questionId: 'q1', correct_answer: 'A' };
    expect(isValidVarkDimension(q.vark_dimension)).toBe(false);
  });
});

// ── Group 10: Quiz Delta Scoring Thresholds (all 4 dimensions) ────────────────

describe('varkDeltaForAccuracy (thresholds, all dimensions)', () => {
  // Thresholds are the same for every dimension — we test them generically
  // then verify computeVarkDeltas applies them correctly per-dimension.

  it.each([
    [10, 10, 2],
    [7,  10, 2],
    [6,  10, 1],
    [4,  10, 1],
    [3,  10, 0],
    [0,  10, 0],
  ] as [number, number, number][])(
    '%i/%i correct → delta %i',
    (correct, total, expected) => {
      expect(varkDeltaForAccuracy(correct, total)).toBe(expected);
    },
  );

  it('delta is never negative for any input', () => {
    for (let c = 0; c <= 10; c++) {
      expect(varkDeltaForAccuracy(c, 10)).toBeGreaterThanOrEqual(0);
    }
  });

  it('delta never exceeds 2 for any input', () => {
    for (let c = 0; c <= 10; c++) {
      expect(varkDeltaForAccuracy(c, 10)).toBeLessThanOrEqual(2);
    }
  });

  it('returns 0 for a dimension with no questions (no division by zero)', () => {
    expect(varkDeltaForAccuracy(0, 0)).toBe(0);
  });
});

describe('computeVarkDeltas', () => {
  function makeQA(
    id: string,
    dim: ScoredQuestion['vark_dimension'],
    correct: boolean,
  ): { q: ScoredQuestion; a: SubmittedAnswer } {
    return {
      q: makeQuestion(id, 'correct', dim),
      a: makeAnswer(id, correct ? 'correct' : 'wrong'),
    };
  }

  it('≥70% on visual questions → visual delta 2', () => {
    // 7/10 visual questions correct
    const pairs = Array.from({ length: 10 }, (_, i) =>
      makeQA(`v${i}`, 'visual', i < 7),
    );
    const result = computeVarkDeltas(
      pairs.map((p) => p.q),
      pairs.map((p) => p.a),
    );
    expect(result.visual).toBe(2);
  });

  it('40–69% on visual questions → visual delta 1', () => {
    const pairs = Array.from({ length: 10 }, (_, i) =>
      makeQA(`v${i}`, 'visual', i < 5), // 50%
    );
    const result = computeVarkDeltas(
      pairs.map((p) => p.q),
      pairs.map((p) => p.a),
    );
    expect(result.visual).toBe(1);
  });

  it('<40% on visual questions → visual delta 0', () => {
    const pairs = Array.from({ length: 10 }, (_, i) =>
      makeQA(`v${i}`, 'visual', i < 3), // 30%
    );
    const result = computeVarkDeltas(
      pairs.map((p) => p.q),
      pairs.map((p) => p.a),
    );
    expect(result.visual).toBe(0);
  });

  it('applies the same thresholds to all four dimensions independently', () => {
    // 8/10 visual (→2), 5/10 auditory (→1), 3/10 reading (→0), 7/10 kinesthetic (→2)
    const visual      = Array.from({ length: 10 }, (_, i) => makeQA(`v${i}`, 'visual',      i < 8));
    const auditory    = Array.from({ length: 10 }, (_, i) => makeQA(`a${i}`, 'auditory',    i < 5));
    const reading     = Array.from({ length: 10 }, (_, i) => makeQA(`r${i}`, 'reading',     i < 3));
    const kinesthetic = Array.from({ length: 10 }, (_, i) => makeQA(`k${i}`, 'kinesthetic', i < 7));

    const all = [...visual, ...auditory, ...reading, ...kinesthetic];
    const result = computeVarkDeltas(
      all.map((p) => p.q),
      all.map((p) => p.a),
    );

    expect(result.visual).toBe(2);
    expect(result.auditory).toBe(1);
    expect(result.reading).toBe(0);
    expect(result.kinesthetic).toBe(2);
  });

  it('a dimension with no questions returns delta 0 (not an error)', () => {
    const pairs = [makeQA('v1', 'visual', true)];
    const result = computeVarkDeltas(
      pairs.map((p) => p.q),
      pairs.map((p) => p.a),
    );
    // auditory, reading, kinesthetic had no questions
    expect(result.auditory).toBe(0);
    expect(result.reading).toBe(0);
    expect(result.kinesthetic).toBe(0);
  });

  it('every delta in the result is 0, 1, or 2 — never negative, never > 2', () => {
    const pairs = Array.from({ length: 20 }, (_, i) =>
      makeQA(`q${i}`, VALID_VARK_DIMENSIONS[i % 4], i % 3 !== 0),
    );
    const result = computeVarkDeltas(
      pairs.map((p) => p.q),
      pairs.map((p) => p.a),
    );
    for (const delta of Object.values(result)) {
      expect(delta).toBeGreaterThanOrEqual(0);
      expect(delta).toBeLessThanOrEqual(2);
    }
  });

  it('questions with invalid or missing vark_dimension are ignored', () => {
    const q: ScoredQuestion = { questionId: 'qBad', correct_answer: 'A' }; // no dim
    const a: SubmittedAnswer = { questionId: 'qBad', selectedAnswer: 'A' };
    const result = computeVarkDeltas([q], [a]);
    // All deltas must be 0 because nothing was counted
    expect(result).toEqual({ visual: 0, auditory: 0, reading: 0, kinesthetic: 0 });
  });
});
