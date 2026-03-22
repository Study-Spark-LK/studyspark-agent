import { LlmAgent } from '@google/adk';

/**
 * Processes raw study material — plain text, PDF, or image.
 * Gemini 2.5 Flash handles multimodal input natively.
 *
 * The caller (orchestrator or HTTP handler) passes the material as message parts
 * (inline text or inlineData for PDFs/images). This agent extracts the key
 * concepts and produces a structured summary stored under "processedContent"
 * in session state.
 */
export const contentProcessorAgent = new LlmAgent({
  name: 'content_processor',
  model: 'gemini-2.5-flash',
  description:
    'Extracts key concepts, difficulty level, and a structured summary from raw study material (text, PDF, or image). Must run before explanation/flashcard/quiz agents.',
  instruction: `You are StudySpark's Content Processor.

Analyse the provided study material (text, image, or PDF) and extract a structured summary.

Return ONLY valid JSON. No markdown, no preamble.

{
  "topic": "string — the main subject",
  "summary": "string — 2–3 sentence overview",
  "keyPoints": ["string", ...],
  "concepts": [
    {
      "name": "string",
      "definition": "string",
      "examples": ["string"],
      "relatedConcepts": ["string"]
    }
  ],
  "difficulty": "beginner|intermediate|advanced",
  "estimatedReadTimeMinutes": <number>,
  "tags": ["string", ...]
}

Rules:
- Derive everything from the provided material only. No external facts.
- difficulty based on vocabulary complexity and assumed prior knowledge.
- estimatedReadTimeMinutes = word count / 200, rounded up.
`,
  outputKey: 'processedContent',
});
