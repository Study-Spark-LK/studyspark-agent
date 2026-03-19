/**
 * Pure business-logic helpers extracted from agent prompts and route handlers.
 * No ADK / Gemini imports — safe to unit-test without API keys or network.
 */

// ── Shared ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Profile Analysis Output Validation ───────────────────────────────────────

export interface ProfileScores {
  visualScore: number;
  auditoryScore: number;
  readingScore: number;
  kinestheticScore: number;
}

const PROFILE_SCORE_FIELDS: (keyof ProfileScores)[] = [
  'visualScore',
  'auditoryScore',
  'readingScore',
  'kinestheticScore',
];

/**
 * Validates that a profileAnalysisAgent response has all four score fields
 * and that each is a number in [0, 100].
 */
export function validateProfileScores(output: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof output !== 'object' || output === null) {
    return { valid: false, errors: ['Output must be a non-null object'] };
  }

  const obj = output as Record<string, unknown>;

  for (const field of PROFILE_SCORE_FIELDS) {
    if (!(field in obj)) {
      errors.push(`Missing field: ${field}`);
    } else if (typeof obj[field] !== 'number') {
      errors.push(`${field} must be a number, got ${typeof obj[field]}`);
    } else {
      const v = obj[field] as number;
      if (v < 0) errors.push(`${field} is negative (${v})`);
      if (v > 100) errors.push(`${field} exceeds 100 (${v})`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ── VARK Dominant Style Derivation ────────────────────────────────────────────

export type VarkStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic';

/**
 * Derives the dominant VARK learning style from four dimension scores.
 * A score of -1 means "not yet measured" — treated as 0.
 * On a tie, the order visual → auditory → reading → kinesthetic wins.
 */
export function deriveDominantStyle(scores: {
  visual: number;
  auditory: number;
  reading: number;
  kinesthetic: number;
}): VarkStyle {
  const v = Math.max(0, scores.visual);
  const a = Math.max(0, scores.auditory);
  const r = Math.max(0, scores.reading);
  const k = Math.max(0, scores.kinesthetic);
  const max = Math.max(v, a, r, k);
  if (v === max) return 'visual';
  if (a === max) return 'auditory';
  if (r === max) return 'reading';
  return 'kinesthetic';
}

// ── Quiz Scoring ──────────────────────────────────────────────────────────────

export interface ScoredQuestion {
  questionId: string;
  correct_answer: string;
  vark_dimension?: string;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedAnswer: string;
}

export interface QuizScore {
  /** Integer percentage 0–100 */
  score: number;
  correctCount: number;
  totalQuestions: number;
}

/**
 * Scores a quiz by comparing submitted answers against correct answers.
 * Rules that mirror the quizEvaluationAgent prompt:
 *   - Matching is case-sensitive.
 *   - A missing answer (not submitted) counts as wrong.
 *   - Extra submitted answers (beyond the question list) are ignored.
 */
export function scoreQuiz(
  questions: ScoredQuestion[],
  answers: SubmittedAnswer[],
): QuizScore {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedAnswer]));

  let correctCount = 0;
  for (const q of questions) {
    if (answerMap.get(q.questionId) === q.correct_answer) {
      correctCount++;
    }
  }

  const totalQuestions = questions.length;
  const score =
    totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);

  return { score, correctCount, totalQuestions };
}

// ── VARK Dimension Validation ─────────────────────────────────────────────────

export const VALID_VARK_DIMENSIONS: readonly VarkStyle[] = [
  'visual',
  'auditory',
  'reading',
  'kinesthetic',
];

export function isValidVarkDimension(dim: unknown): dim is VarkStyle {
  return VALID_VARK_DIMENSIONS.includes(dim as VarkStyle);
}

// ── Flashcard Validation ──────────────────────────────────────────────────────

/**
 * Validates a single flashcard.
 * Accepts both the internal shape (front/back) and the Worker-facing shape
 * (question/answer). Both must be non-empty strings, as must hint.
 */
export function validateFlashcard(card: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof card !== 'object' || card === null) {
    return { valid: false, errors: ['Flashcard must be a non-null object'] };
  }

  const c = card as Record<string, unknown>;

  // Support question/answer (external) and front/back (internal)
  const questionText = 'question' in c ? c.question : c.front;
  const answerText   = 'answer'   in c ? c.answer   : c.back;
  const hintText     = c.hint;

  if (typeof questionText !== 'string' || questionText.trim() === '') {
    errors.push('question/front must be a non-empty string');
  }
  if (typeof answerText !== 'string' || answerText.trim() === '') {
    errors.push('answer/back must be a non-empty string');
  }
  if (typeof hintText !== 'string' || hintText.trim() === '') {
    errors.push('hint must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

// ── Process Request Validation ────────────────────────────────────────────────

export interface ProcessValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Validates the body of a POST /internal/process request.
 * Mirrors the guard clauses at the top of the route handler in index.ts.
 */
export function validateProcessRequest(body: {
  userId?: unknown;
  material?: unknown;
}): ProcessValidationResult {
  if (!body.userId) {
    return {
      valid: false,
      errorCode: 'MISSING_PROFILE',
      errorMessage: 'profileData or userId is required',
    };
  }

  if (!body.material) {
    return {
      valid: false,
      errorCode: 'BAD_REQUEST',
      errorMessage: 'material is required',
    };
  }

  const m = body.material as Record<string, unknown>;
  const hasPdf   = Boolean(m.pdfBase64);
  const hasImage = Boolean(m.imageBase64) && Boolean(m.mimeType);
  const hasText  = Boolean(m.text);
  const hasUrl   = Boolean(m.file_url);

  if (!hasPdf && !hasImage && !hasText && !hasUrl) {
    return {
      valid: false,
      errorCode: 'BAD_REQUEST',
      errorMessage: 'material must contain pdfBase64, imageBase64, text, or file_url',
    };
  }

  return { valid: true };
}

/**
 * Builds the downstream prompt string passed to explanation/story/flashcard
 * agents after content processing.
 *
 * When profileData is provided the profile is embedded so agents skip the
 * get_user_profile tool call. When absent, agents fall back to userId-based
 * lookup via the tool.
 */
export function buildDownstreamPrompt(
  userId: string,
  processed: unknown,
  profileData?: Record<string, unknown>,
): string {
  const profileSection = profileData
    ? `\n\nStudent profile (use this directly — do NOT call get_user_profile):\n${JSON.stringify(profileData, null, 2)}`
    : '';
  return `userId: ${userId}${profileSection}\n\nProcessed study material:\n${JSON.stringify(processed, null, 2)}`;
}

// ── VARK Delta Scoring Thresholds ─────────────────────────────────────────────

/**
 * Calculates the VARK score delta for a single dimension.
 * Mirrors the thresholds specified in QUIZ_EVALUATION_PROMPT:
 *   ≥70% correct → delta = 2
 *   40–69% correct → delta = 1
 *   <40% correct  → delta = 0
 */
export function varkDeltaForAccuracy(correctCount: number, total: number): 0 | 1 | 2 {
  if (total === 0) return 0;
  const pct = (correctCount / total) * 100;
  if (pct >= 70) return 2;
  if (pct >= 40) return 1;
  return 0;
}

/**
 * Computes VARK deltas for all four dimensions from a full set of questions
 * and submitted answers. Questions without a vark_dimension are ignored.
 */
export function computeVarkDeltas(
  questions: ScoredQuestion[],
  answers: SubmittedAnswer[],
): { visual: 0 | 1 | 2; auditory: 0 | 1 | 2; reading: 0 | 1 | 2; kinesthetic: 0 | 1 | 2 } {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.selectedAnswer]));

  const byDim: Record<VarkStyle, { correct: number; total: number }> = {
    visual:      { correct: 0, total: 0 },
    auditory:    { correct: 0, total: 0 },
    reading:     { correct: 0, total: 0 },
    kinesthetic: { correct: 0, total: 0 },
  };

  for (const q of questions) {
    const dim = q.vark_dimension as VarkStyle | undefined;
    if (!dim || !isValidVarkDimension(dim)) continue;
    byDim[dim].total++;
    if (answerMap.get(q.questionId) === q.correct_answer) {
      byDim[dim].correct++;
    }
  }

  return {
    visual:      varkDeltaForAccuracy(byDim.visual.correct,      byDim.visual.total),
    auditory:    varkDeltaForAccuracy(byDim.auditory.correct,    byDim.auditory.total),
    reading:     varkDeltaForAccuracy(byDim.reading.correct,     byDim.reading.total),
    kinesthetic: varkDeltaForAccuracy(byDim.kinesthetic.correct, byDim.kinesthetic.total),
  };
}
