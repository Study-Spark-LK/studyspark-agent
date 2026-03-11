export type QuizDifficulty = 'easy' | 'medium' | 'hard';

export type VarkDimension = 'visual' | 'auditory' | 'reading' | 'kinesthetic';

/** Full question shape stored in D1. correct_answer is NEVER sent to Flutter directly. */
export interface QuizQuestion {
  questionId: string;
  question: string;
  /** Exactly 4 options */
  options: [string, string, string, string];
  /** The correct option text. Stripped before forwarding to Flutter. */
  correct_answer: string;
  explanation: string;
  difficulty: QuizDifficulty;
  concept: string;
  /** VARK dimension this question exercises — used for profile delta calculation */
  vark_dimension: VarkDimension;
}

/** Full quiz object returned by /internal/quiz/generate (Worker strips correct_answer before Flutter) */
export interface GeneratedQuiz {
  quizId: string;
  topic: string;
  questions: QuizQuestion[];
  totalQuestions: number;
  difficulty: QuizDifficulty;
  createdAt: string;
}

export interface SubmittedAnswer {
  questionId: string;
  selectedAnswer: string;
}

export interface QuestionResult {
  questionId: string;
  isCorrect: boolean;
  selectedAnswer: string;
  correct_answer: string;
  explanation: string;
}

/** Output of /internal/quiz/evaluate */
export interface QuizEvaluation {
  /** Percentage 0–100 */
  score: number;
  correctCount: number;
  totalQuestions: number;
  results: QuestionResult[];
  /** Incremental VARK deltas to apply to the user profile */
  varkDelta: { visual: number; auditory: number; reading: number; kinesthetic: number };
  feedback: string;
  weakAreas: string[];
  recommendation: string;
}
