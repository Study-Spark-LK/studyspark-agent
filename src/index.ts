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
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { explanationAgent, storyModeAgent } from './agents/explanation.agent.js';
import { contentProcessorAgent } from './agents/contentProcessor.agent.js';
import { quizGenerationAgent, quizEvaluationAgent } from './agents/quiz.agent.js';
import { profileUpdateAgent } from './agents/profileUpdate.agent.js';
import { profileAnalysisAgent } from './agents/profileAnalysis.agent.js';
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

const profileAnalysisRunner = new InMemoryRunner({
  agent: profileAnalysisAgent,
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

// ── Swagger / OpenAPI ────────────────────────────────────────────────────────

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StudySpark ADK API',
      version: '1.0.0',
      description: 'Internal API for the StudySpark AI backend. All /internal/* routes require the X-Internal-Key header.',
    },
    servers: [{ url: `http://localhost:${process.env.PORT ?? 8080}` }],
    components: {
      securitySchemes: {
        InternalKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Internal-Key',
        },
      },
      schemas: {
        ProcessRequest: {
          type: 'object',
          required: ['userId', 'material'],
          properties: {
            userId: { type: 'string', example: 'user_2abc123' },
            material: {
              type: 'object',
              description: 'Provide one of: file_url, text, imageBase64+mimeType, or pdfBase64.',
              properties: {
                file_url: { type: 'string', description: 'R2 public URL of a PDF or image file' },
                text: { type: 'string', description: 'Plain text study content' },
                imageBase64: { type: 'string', description: 'Base64-encoded image' },
                mimeType: { type: 'string', example: 'image/png' },
                pdfBase64: { type: 'string', description: 'Base64-encoded PDF' },
              },
            },
          },
        },
        ProcessResponse: {
          type: 'object',
          properties: {
            topic: { type: 'string' },
            personalised_explanation: { type: 'string' },
            tldr_summary: { type: 'string' },
            key_points: { type: 'array', items: { type: 'string' } },
            analogies: { type: 'array', items: { type: 'string' } },
            difficulty: { type: 'string' },
            story_mode_explanation: { type: 'string' },
            concept_map: { type: 'object' },
          },
        },
        QuizGenerateRequest: {
          type: 'object',
          required: ['userId', 'content'],
          properties: {
            userId: { type: 'string', example: 'user_2abc123' },
            content: { type: 'string', description: 'Study material text to generate questions from' },
            numQuestions: { type: 'integer', default: 10 },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], default: 'medium' },
          },
        },
        QuizEvaluateRequest: {
          type: 'object',
          required: ['userId', 'questions', 'answers'],
          properties: {
            userId: { type: 'string', example: 'user_2abc123' },
            questions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  question: { type: 'string' },
                  options: { type: 'array', items: { type: 'string' } },
                  correct_answer: { type: 'string' },
                },
              },
            },
            answers: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  questionId: { type: 'string' },
                  selectedOption: { type: 'string' },
                },
              },
            },
          },
        },
        ProfileAnalyzeRequest: {
          type: 'object',
          required: ['userId', 'profileId', 'qna'],
          properties: {
            userId: { type: 'string', example: 'user_2abc123' },
            profileId: { type: 'string' },
            name: { type: 'string', example: 'Alice' },
            qna: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  question: { type: 'string' },
                  answer: { type: 'string' },
                },
              },
            },
          },
        },
        ProfileAnalyzeResponse: {
          type: 'object',
          properties: {
            visualScore: { type: 'integer', minimum: 0, maximum: 100 },
            auditoryScore: { type: 'integer', minimum: 0, maximum: 100 },
            readingScore: { type: 'integer', minimum: 0, maximum: 100 },
            kinestheticScore: { type: 'integer', minimum: 0, maximum: 100 },
          },
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } },
        },
      },
    },
    security: [{ InternalKey: [] }],
    paths: {
      '/health': {
        get: {
          tags: ['System'],
          summary: 'Health check',
          security: [],
          responses: {
            '200': {
              description: 'Server is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      timestamp: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/internal/process': {
        post: {
          tags: ['Content'],
          summary: 'Process study material → personalised explanation + story mode',
          description: 'Runs the full pipeline: content extraction → personalised explanation + TL;DR + story mode. Results are cached by the Worker.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProcessRequest' } } },
          },
          responses: {
            '200': {
              description: 'Processed content',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ProcessResponse' } } },
            },
            '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Missing or invalid X-Internal-Key' },
            '500': { description: 'Agent error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/internal/quiz/generate': {
        post: {
          tags: ['Quiz'],
          summary: 'Generate MCQ quiz questions',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/QuizGenerateRequest' } } },
          },
          responses: {
            '200': { description: 'Generated quiz questions', content: { 'application/json': { schema: { type: 'object' } } } },
            '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Missing or invalid X-Internal-Key' },
            '500': { description: 'Agent error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/internal/quiz/evaluate': {
        post: {
          tags: ['Quiz'],
          summary: 'Score quiz answers + update VARK profile',
          description: 'Evaluates submitted answers, returns scores and VARK delta, and applies the delta to the user\'s learning profile.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/QuizEvaluateRequest' } } },
          },
          responses: {
            '200': { description: 'Evaluation result with VARK delta', content: { 'application/json': { schema: { type: 'object' } } } },
            '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Missing or invalid X-Internal-Key' },
            '500': { description: 'Agent error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/internal/profile/analyze': {
        post: {
          tags: ['Profile'],
          summary: 'Analyse onboarding Q&A → initial VARK scores',
          description: 'Reads the student\'s onboarding answers and returns initial VARK learning-style scores (0–100 each).',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileAnalyzeRequest' } } },
          },
          responses: {
            '200': {
              description: 'VARK scores',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/ProfileAnalyzeResponse' } } },
            },
            '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { description: 'Missing or invalid X-Internal-Key' },
            '500': { description: 'Agent error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
    },
  },
  apis: [],
});

// ── Express app ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/docs.json', (_req, res) => res.json(swaggerSpec));

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

    // Worker sends pdfBase64/imageBase64 directly — prefer inline data over URL fetching.
    if (material.pdfBase64) {
      parts.push({ inlineData: { mimeType: 'application/pdf', data: material.pdfBase64 } });
    } else if (material.imageBase64 && material.mimeType) {
      parts.push({ inlineData: { mimeType: material.mimeType, data: material.imageBase64 } });
    } else if (material.text) {
      parts.push({ text: material.text });
    } else if (material.file_url) {
      // Fallback: fetch from R2 URL (e.g. legacy or direct integrations)
      parts.push(await fetchFileAsInlinePart(material.file_url));
    } else {
      res.status(400).json({ error: 'material must contain pdfBase64, imageBase64, text, or file_url' });
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

// ── POST /internal/profile/analyze ──────────────────────────────────────────

interface ProfileAnalyzeRequest {
  userId: string;
  profileId: string;
  name: string;
  qna: Array<{ question: string; answer: string }>;
}

app.post('/internal/profile/analyze', async (req: Request, res: Response) => {
  const { userId, profileId, name, qna } = req.body as ProfileAnalyzeRequest;

  if (!userId || !profileId || !qna?.length) {
    res.status(400).json({ error: 'userId, profileId, and qna are required' });
    return;
  }

  try {
    const qnaText = qna.map((item, i) => `Q${i + 1}: ${item.question}\nA: ${item.answer}`).join('\n\n');
    const prompt = `Student name: ${name}\n\nOnboarding Q&A:\n${qnaText}`;
    const raw = await runAgent(profileAnalysisRunner, userId, prompt);
    const scores = parseAgentJson<{
      visualScore: number;
      auditoryScore: number;
      readingScore: number;
      kinestheticScore: number;
    }>(raw);
    res.json(scores);
  } catch (err) {
    console.error('[/internal/profile/analyze]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal server error' });
  }
});

// ── Start server ─────────────────────────────────────────────────────────────

const port = parseInt(process.env.PORT ?? '8080', 10);
app.listen(port, () => {
  console.log(`StudySpark ADK server running on port ${port}`);
  console.log(`  Docs:     GET  http://localhost:${port}/docs`);
  console.log(`  Health:   GET  http://localhost:${port}/health`);
  console.log(`  Process:  POST http://localhost:${port}/internal/process`);
  console.log(`  Profile:  POST http://localhost:${port}/internal/profile/analyze`);
  console.log(`  Quiz:     POST http://localhost:${port}/internal/quiz/generate`);
  console.log(`  Eval:     POST http://localhost:${port}/internal/quiz/evaluate`);
});
