/**
 * StudySpark ADK — HTTP Server
 *
 * Exposes internal API endpoints called by the Cloudflare Worker.
 * All /internal/* routes require the X-Internal-Key header.
 *
 * Endpoints:
 *   GET  /health
 *   POST /internal/process          → personalised explanation + story mode (always both)
 *   POST /internal/quiz/generate    → generate MCQ quiz
 *   POST /internal/quiz/evaluate    → score answers + VARK profile update
 *
 * Run with: npm run serve   (dev)
 *           npm start       (production, after npm run build)
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { InMemoryRunner, isFinalResponse, stringifyContent } from '@google/adk';
import { explanationAgent, storyModeAgent } from './agents/explanation.agent.js';
import { contentProcessorAgent } from './agents/contentProcessor.agent.js';
import { quizGenerationAgent, quizEvaluationAgent } from './agents/quiz.agent.js';
import { profileUpdateAgent } from './agents/profileUpdate.agent.js';
import type { RawMaterial, ProcessedContent, ExplanationOutput, StoryOutput } from './types/content.types.js';
import type { SubmittedAnswer, QuizQuestion } from './types/quiz.types.js';

// ── Runners (one per agent, each has its own InMemorySessionService) ────────

const contentProcessorRunner = new InMemoryRunner({
  agent: contentProcessorAgent,
  appName: 'studyspark',
});

const explanationRunner = new InMemoryRunner({
  agent: explanationAgent,
  appName: 'studyspark',
});

const storyRunner = new InMemoryRunner({
  agent: storyModeAgent,
  appName: 'studyspark',
});

const quizGenRunner = new InMemoryRunner({
  agent: quizGenerationAgent,
  appName: 'studyspark',
});

const quizEvalRunner = new InMemoryRunner({
  agent: quizEvaluationAgent,
  appName: 'studyspark',
});

const profileRunner = new InMemoryRunner({
  agent: profileUpdateAgent,
  appName: 'studyspark',
});

// ── Helper: run an agent and return the final text response ─────────────────

async function runAgent(
  runner: InMemoryRunner,
  userId: string,
  prompt: string,
  parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>,
): Promise<string> {
  const sessionId = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  await runner.sessionService.createSession({
    appName: 'studyspark',
    userId,
    sessionId,
  });

  const messageParts = parts ?? [{ text: prompt }];

  let finalText = '';
  for await (const event of runner.runAsync({
    userId,
    sessionId,
    newMessage: { role: 'user', parts: messageParts },
  })) {
    if (isFinalResponse(event)) {
      finalText = stringifyContent(event);
    }
  }

  return finalText;
}

/**
 * Fetches a file from an R2 URL and returns it as a Gemini inlineData part.
 * MIME type is read from the Content-Type header; falls back to the file extension.
 * Supports: application/pdf, image/jpeg, image/png, image/gif, image/webp
 */
const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const EXT_TO_MIME: Record<string, string> = {
  pdf:  'application/pdf',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  gif:  'image/gif',
  webp: 'image/webp',
};

async function fetchFileAsInlinePart(
  url: string,
): Promise<{ inlineData: { mimeType: string; data: string } }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch file from R2: ${res.status} ${res.statusText}`);
  }

  // Content-Type header is the authoritative source; strip any charset suffix
  let mimeType = res.headers.get('content-type')?.split(';')[0].trim() ?? '';

  // Fall back to inferring from the URL extension (before any query string)
  if (!mimeType || !SUPPORTED_MIME_TYPES.has(mimeType)) {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
    mimeType = EXT_TO_MIME[ext] ?? mimeType;
  }

  if (!SUPPORTED_MIME_TYPES.has(mimeType)) {
    throw new Error(
      `Unsupported file type "${mimeType}". Supported types: PDF, JPEG, PNG, GIF, WebP.`,
    );
  }

  const buffer = await res.arrayBuffer();
  const data = Buffer.from(buffer).toString('base64');
  return { inlineData: { mimeType, data } };
}

/**
 * Extracts and parses JSON from an agent response string.
 *
 * Strategy (tried in order):
 *   1. Strip a markdown code fence (```json … ``` or ``` … ```) then parse.
 *   2. Scan for the first top-level JSON object `{…}` or array `[…]` and parse that.
 *   3. Attempt to parse the entire trimmed string as-is.
 *
 * Throws a descriptive error (including the first 200 chars of raw output) when
 * no valid JSON can be found.
 */
function parseAgentJson<T>(raw: string): T {
  const trimmed = raw.trim();

  // 1. Strip a markdown fence and try parsing the content inside it.
  const fenceMatch = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {
      // Fall through to the next strategy.
    }
  }

  // 2. Find the first '{' or '[' and the matching closing character, then parse.
  const firstBrace   = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  const start =
    firstBrace === -1 ? firstBracket :
    firstBracket === -1 ? firstBrace :
    Math.min(firstBrace, firstBracket);

  if (start !== -1) {
    const opener = trimmed[start];
    const closer = opener === '{' ? '}' : ']';
    const end = trimmed.lastIndexOf(closer);
    if (end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1)) as T;
      } catch {
        // Fall through to the next strategy.
      }
    }
  }

  // 3. Last resort: parse the whole trimmed string.
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Agent returned no valid JSON.\nFirst 200 chars: ${trimmed.slice(0, 200)}`,
    );
  }
}

// ── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '20mb' }));

// Internal auth middleware
function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  const key = req.headers['x-internal-key'];
  if (!process.env.INTERNAL_API_KEY || key !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

// ── GET /health ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── POST /internal/process ───────────────────────────────────────────────────

interface ProcessRequest {
  userId: string;
  material: RawMaterial;
}

app.post('/internal/process', requireInternalKey, async (req: Request, res: Response) => {
  const { userId, material } = req.body as ProcessRequest;

  if (!userId || !material) {
    res.status(400).json({ error: 'userId and material are required' });
    return;
  }

  try {
    // Build message parts (text or multimodal)
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [];

    if (material.file_url) {
      parts.push(await fetchFileAsInlinePart(material.file_url));
    } else if (material.text) {
      parts.push({ text: material.text });
    } else if (material.imageBase64 && material.mimeType) {
      parts.push({ inlineData: { mimeType: material.mimeType, data: material.imageBase64 } });
    } else if (material.pdfBase64) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: material.pdfBase64 } });
    } else {
      res.status(400).json({ error: 'material must contain file_url, text, imageBase64, or pdfBase64' });
      return;
    }

    // Step 1: content processor receives the raw parts (text / inlineData).
    const cpPrompt = `userId: ${userId}\n\nAnalyse the provided study material.`;
    parts.unshift({ text: cpPrompt });
    const cpRaw = await runAgent(contentProcessorRunner, userId, cpPrompt, parts);
    const processed = parseAgentJson<ProcessedContent>(cpRaw);

    // Step 2: downstream agents receive structured text only — no raw binary parts.
    const downstreamPrompt =
      `userId: ${userId}\n\nProcessed study material:\n${JSON.stringify(processed, null, 2)}`;

    // Step 3: run both downstream agents in parallel.
    const [explanationRaw, storyRaw] = await Promise.all([
      runAgent(explanationRunner, userId, downstreamPrompt),
      runAgent(storyRunner, userId, downstreamPrompt),
    ]);

    const explanation = parseAgentJson<ExplanationOutput>(explanationRaw);
    const story = parseAgentJson<StoryOutput>(storyRaw);

    res.json({
      topic: explanation.topic,
      personalised_explanation: explanation.explanation,
      tldr_summary: explanation.tldr,
      key_points: explanation.keyPoints,
      analogies: explanation.analogies,
      difficulty: explanation.difficulty,
      story_mode_explanation: story.story,
      concept_map: story.conceptMap,
    });
  } catch (err) {
    console.error('[/internal/process]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ── POST /internal/quiz/generate ─────────────────────────────────────────────

interface QuizGenerateRequest {
  userId: string;
  content: string;
  numQuestions?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
}

app.post('/internal/quiz/generate', requireInternalKey, async (req: Request, res: Response) => {
  const { userId, content, numQuestions = 10, difficulty = 'medium' } = req.body as QuizGenerateRequest;

  if (!userId || !content) {
    res.status(400).json({ error: 'userId and content are required' });
    return;
  }

  try {
    const prompt = `Generate a ${difficulty} quiz with ${numQuestions} questions for userId: ${userId}.\n\nStudy material:\n${content}`;
    const raw = await runAgent(quizGenRunner, userId, prompt);
    const result = parseAgentJson<Record<string, unknown>>(raw);
    res.json(result);
  } catch (err) {
    console.error('[/internal/quiz/generate]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ── POST /internal/quiz/evaluate ─────────────────────────────────────────────

interface QuizEvaluateRequest {
  userId: string;
  questions: QuizQuestion[];
  answers: SubmittedAnswer[];
}

app.post('/internal/quiz/evaluate', requireInternalKey, async (req: Request, res: Response) => {
  const { userId, questions, answers } = req.body as QuizEvaluateRequest;

  if (!userId || !questions?.length || !answers?.length) {
    res.status(400).json({ error: 'userId, questions, and answers are required' });
    return;
  }

  try {
    const prompt = `Evaluate the quiz for userId: ${userId}.\n\nQuestions (with correct answers):\n${JSON.stringify(questions, null, 2)}\n\nSubmitted answers:\n${JSON.stringify(answers, null, 2)}`;
    const raw = await runAgent(quizEvalRunner, userId, prompt);
    const evaluation = parseAgentJson<{
      varkDelta: { visual: number; auditory: number; reading: number; kinesthetic: number };
      [key: string]: unknown;
    }>(raw);

    // Apply VARK delta to the user's profile
    if (evaluation.varkDelta) {
      const { visual = 0, auditory = 0, reading = 0, kinesthetic = 0 } = evaluation.varkDelta;
      const deltaPrompt = `Apply VARK delta for userId: ${userId}. visual: ${visual}, auditory: ${auditory}, reading: ${reading}, kinesthetic: ${kinesthetic}`;
      await runAgent(profileRunner, userId, deltaPrompt);
    }

    res.json(evaluation);
  } catch (err) {
    console.error('[/internal/quiz/evaluate]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ── Start server ─────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '8080', 10);
app.listen(port, () => {
  console.log(`StudySpark ADK server running on port ${port}`);
  console.log(`  Health:  GET  http://localhost:${port}/health`);
  console.log(`  Process: POST http://localhost:${port}/internal/process`);
  console.log(`  Quiz:    POST http://localhost:${port}/internal/quiz/generate`);
  console.log(`  Eval:    POST http://localhost:${port}/internal/quiz/evaluate`);
});
