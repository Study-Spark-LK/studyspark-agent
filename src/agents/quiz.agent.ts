import { LlmAgent } from '@google/adk';
import { QUIZ_GENERATION_PROMPT, QUIZ_EVALUATION_PROMPT } from '../prompts/quiz.prompt.js';

/**
 * Generates a multiple-choice quiz with VARK-tagged questions.
 * correct_answer IS included in the output — the Worker strips it
 * before forwarding to Flutter.
 */
export const quizGenerationAgent = new LlmAgent({
  name: 'quiz_generation_agent',
  model: 'gemini-2.5-flash',
  description:
    'Generates a multiple-choice quiz from the provided content. Returns full question objects including correct_answer and vark_dimension.',
  instruction: QUIZ_GENERATION_PROMPT,
  outputKey: 'generatedQuiz',
});

/**
 * Evaluates submitted quiz answers, generates per-question feedback,
 * calculates VARK deltas, and identifies weak areas.
 */
export const quizEvaluationAgent = new LlmAgent({
  name: 'quiz_evaluation_agent',
  model: 'gemini-2.5-flash',
  description:
    'Scores submitted quiz answers, explains right/wrong answers, calculates VARK score deltas, and recommends next steps.',
  instruction: QUIZ_EVALUATION_PROMPT,
  outputKey: 'quizEvaluation',
});
