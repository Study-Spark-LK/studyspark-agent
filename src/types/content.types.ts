export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

/** Material submitted by the Flutter client (forwarded by the Worker). */
export interface RawMaterial {
  /** Plain text extracted from the document, or user-pasted text */
  text?: string;
  /** Cloudflare R2 public URL for a PDF or image — fetched server-side and passed to Gemini */
  file_url?: string;
  /** Base64-encoded image (JPEG/PNG) for Gemini multimodal processing */
  imageBase64?: string;
  /** Base64-encoded PDF for Gemini multimodal processing */
  pdfBase64?: string;
  /** MIME type of the image/pdf, e.g. "image/jpeg", "application/pdf" */
  mimeType?: string;
}

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  /** Memory nudge without giving away the answer */
  hint: string;
  tags: string[];
}

/** Output shape of the content processor agent */
export interface ProcessedContent {
  topic: string;
  summary: string;
  keyPoints: string[];
  concepts: Array<{
    name: string;
    definition: string;
    examples: string[];
    relatedConcepts: string[];
  }>;
  difficulty: DifficultyLevel;
  estimatedReadTimeMinutes: number;
  tags: string[];
}

/** Output shape of the explanation agent */
export interface ExplanationOutput {
  topic: string;
  explanation: string;
  tldr: string;
  keyPoints: string[];
  /** Analogies tailored to the student's hobbies */
  analogies: string[];
  difficulty: DifficultyLevel;
}

/**
 * Final assembled output shape for /internal/process.
 * This is what the Worker caches in R2.
 */
export interface GeneratedContent {
  topic: string;
  personalised_explanation: string;
  tldr_summary: string;
  key_points: string[];
  analogies: string[];
  difficulty: DifficultyLevel;
  story_mode_explanation: string;
  concept_map: Array<{ concept: string; storyElement: string }>;
  flashcards: Array<{ question: string; answer: string; hint: string }>;
}

/** Output shape of the story mode agent */
export interface StoryOutput {
  topic: string;
  story: string;
  /** Maps each story character/event to the real concept it represents */
  conceptMap: Array<{ concept: string; storyElement: string }>;
}
