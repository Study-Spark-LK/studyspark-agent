/**
 * StudySpark ADK — Local Integration Tests
 *
 * Tests all three internal endpoints without needing the Worker to be running.
 * For /internal/process, a profileData object is passed in the request body so
 * the explanation/story agents use it directly instead of calling the Worker.
 *
 * Prerequisites:
 *   1. Fill in .env (INTERNAL_API_KEY, GOOGLE_API_KEY)
 *   2. Start the server: npm run serve
 *   3. In a second terminal: npm run test:local
 */
import 'dotenv/config';

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.SERVER_URL ?? 'http://localhost:8080';
const INTERNAL_KEY = process.env.INTERNAL_API_KEY ?? '';

if (!INTERNAL_KEY) {
  console.error('ERROR: INTERNAL_API_KEY is not set in .env');
  process.exit(1);
}

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Internal-Key': INTERNAL_KEY,
};

const PHOTOSYNTHESIS_TEXT =
  'Photosynthesis is the process by which plants use sunlight, water and carbon ' +
  'dioxide to produce oxygen and energy in the form of sugar. It occurs in two stages: ' +
  'the light-dependent reactions and the Calvin cycle. Chlorophyll in the chloroplasts ' +
  'absorbs light energy and converts it into chemical energy stored as ATP and NADPH. ' +
  'The Calvin cycle then uses this energy to convert CO2 into glucose.';

// ── Helpers ──────────────────────────────────────────────────────────────────

function heading(title: string) {
  const bar = '─'.repeat(60);
  console.log(`\n${bar}`);
  console.log(`  ${title}`);
  console.log(bar);
}

function pass(msg: string) {
  console.log(`  ✓  ${msg}`);
}

function fail(msg: string) {
  console.log(`  ✗  ${msg}`);
}

async function post(path: string, body: unknown): Promise<{ status: number; data: unknown; ms: number }> {
  const start = Date.now();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  const ms = Date.now() - start;
  const data = await res.json().catch(() => ({ error: 'non-JSON response' }));
  return { status: res.status, data, ms };
}

function checkFields(data: unknown, fields: string[]): { ok: boolean; missing: string[] } {
  const obj = data as Record<string, unknown>;
  const missing = fields.filter((f) => obj[f] === undefined || obj[f] === null);
  return { ok: missing.length === 0, missing };
}

// ── Test results tracker ─────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function result(ok: boolean, label: string) {
  if (ok) { pass(label); passed++; } else { fail(label); failed++; }
}

// ── TEST 1 — POST /internal/profile/analyze ──────────────────────────────────

heading('TEST 1 — POST /internal/profile/analyze');

try {
  const { status, data, ms } = await post('/internal/profile/analyze', {
    userId: 'test_user_123',
    profileId: 'test_profile_123',
    name: 'Umair',
    hobbies: ['Gaming', 'Music', 'Technology'],
    qna: [
      {
        question: 'How do you prefer to study?',
        answer: 'I like watching videos and drawing diagrams to understand concepts.',
      },
      {
        question: 'What helps you remember things best?',
        answer: 'Seeing visual summaries and colour coded notes.',
      },
    ],
  });

  console.log(`\n  Status : ${status}  (${ms}ms)`);
  console.log('  Response:\n');
  console.log(JSON.stringify(data, null, 4).replace(/^/gm, '  '));

  const obj = data as Record<string, unknown>;
  result(status === 200, 'HTTP 200');

  const scoreFields = ['visualScore', 'auditoryScore', 'readingScore', 'kinestheticScore'];
  const { ok: fieldsOk, missing } = checkFields(data, scoreFields);
  result(fieldsOk, `All score fields present${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);

  const allNumbers = scoreFields.every((f) => typeof obj[f] === 'number');
  result(allNumbers, 'All scores are numbers');

  const allInRange = scoreFields.every((f) => {
    const v = obj[f] as number;
    return v >= 0 && v <= 100;
  });
  result(allInRange, 'All scores in range 0–100');

} catch (err) {
  fail(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
  failed++;
}

// ── TEST 2 — POST /internal/process ──────────────────────────────────────────

heading('TEST 2 — POST /internal/process');

try {
  const { status, data, ms } = await post('/internal/process', {
    userId: 'test_user_123',
    material: { text: PHOTOSYNTHESIS_TEXT },
    profileData: {
      user_id: 'test_user_123',
      visual_score: 75,
      auditory_score: 40,
      reading_score: 30,
      kinesthetic_score: 50,
      learning_style: 'visual',
      hobbies: ['Gaming', 'Music', 'Technology'],
      education_level: 'undergrad',
      learning_goal: 'exams',
      preferred_difficulty: 'intermediate',
    },
  });

  console.log(`\n  Status : ${status}  (${ms}ms)`);
  console.log('  Response:\n');
  console.log(JSON.stringify(data, null, 4).replace(/^/gm, '  '));

  result(status === 200, 'HTTP 200');

  const topFields = ['topic', 'personalised_explanation', 'tldr_summary', 'story_mode_explanation', 'flashcards'];
  const { ok: fieldsOk, missing } = checkFields(data, topFields);
  result(fieldsOk, `Top-level fields present${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);

  const obj = data as Record<string, unknown>;
  const flashcards = obj['flashcards'] as unknown[];
  result(Array.isArray(flashcards) && flashcards.length > 0, `flashcards is a non-empty array (${Array.isArray(flashcards) ? flashcards.length : 0} cards)`);

  if (Array.isArray(flashcards) && flashcards.length > 0) {
    const fc = flashcards[0] as Record<string, unknown>;
    const hasHint = typeof fc['hint'] === 'string' && fc['hint'].length > 0;
    result('question' in fc && 'answer' in fc, 'Flashcard has question and answer fields');
    result(hasHint, 'Flashcard has non-empty hint field');
  }

} catch (err) {
  fail(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
  failed++;
}

// ── TEST 3 — POST /internal/quiz/generate ────────────────────────────────────

heading('TEST 3 — POST /internal/quiz/generate');

try {
  const { status, data, ms } = await post('/internal/quiz/generate', {
    userId: 'test_user_123',
    content: PHOTOSYNTHESIS_TEXT,
    numQuestions: 3,
    difficulty: 'medium',
  });

  console.log(`\n  Status : ${status}  (${ms}ms)`);
  console.log('  Response:\n');
  console.log(JSON.stringify(data, null, 4).replace(/^/gm, '  '));

  result(status === 200, 'HTTP 200');

  const obj = data as Record<string, unknown>;
  const questions = obj['questions'] as unknown[];
  result(Array.isArray(questions), 'questions field is an array');
  result(Array.isArray(questions) && questions.length === 3, `questions array has 3 items (got ${Array.isArray(questions) ? questions.length : 'N/A'})`);

  if (Array.isArray(questions) && questions.length > 0) {
    const q = questions[0] as Record<string, unknown>;
    const questionFields = ['questionId', 'question', 'options', 'correct_answer', 'vark_dimension', 'hint'];
    const { ok: qFieldsOk, missing: qMissing } = checkFields(q, questionFields);
    result(qFieldsOk, `Question has all required fields${qMissing.length ? ` (missing: ${qMissing.join(', ')})` : ''}`);

    const options = q['options'] as unknown[];
    result(Array.isArray(options) && options.length === 4, `Question has exactly 4 options (got ${Array.isArray(options) ? options.length : 'N/A'})`);

    const validDimensions = ['visual', 'auditory', 'reading', 'kinesthetic'];
    result(validDimensions.includes(q['vark_dimension'] as string), `vark_dimension is valid (got "${q['vark_dimension']}")`);

    const hasHint = typeof q['hint'] === 'string' && (q['hint'] as string).length > 0;
    result(hasHint, 'Question has non-empty hint field');
  }

} catch (err) {
  fail(`Request failed: ${err instanceof Error ? err.message : String(err)}`);
  failed++;
}

// ── Summary ──────────────────────────────────────────────────────────────────

const bar = '═'.repeat(60);
console.log(`\n${bar}`);
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log(bar + '\n');

if (failed > 0) process.exit(1);
