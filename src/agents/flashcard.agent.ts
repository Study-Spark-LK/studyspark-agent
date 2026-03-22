import { LlmAgent } from '@google/adk';
import { FLASHCARD_PROMPT } from '../prompts/flashcard.prompt.js';

/**
 * Generates a flashcard deck from processed study content.
 * Returns a JSON array of Flashcard objects stored under "flashcards" in session state.
 */
export const flashcardAgent = new LlmAgent({
  name: 'flashcard_agent',
  model: 'gemini-2.5-flash',
  generateContentConfig: { responseMimeType: 'application/json' },
  description:
    'Creates 8–15 study flashcards from the provided content. Returns a JSON array of flashcard objects.',
  instruction: FLASHCARD_PROMPT,
  outputKey: 'flashcards',
});
