# StudySpark ADK — Claude Code Context

## What is this project?
StudySpark is a personalised AI learning app (UN SDG Goal 4 — Quality Education).
This repository is the **AI backend** built with Google ADK TypeScript (`@google/adk`).
It runs on **Google Cloud Run** and is called internally by a **Cloudflare Worker** (separate repo).
The frontend is a **Flutter** mobile/web app.

---

## Architecture Overview

```
Flutter App
    ↓
Cloudflare Worker (studyspark-backend)
    ↓  [X-Internal-Key header]
This ADK Server (Cloud Run)
    ↓
Gemini 2.5 Flash
```

The Worker is the only caller of this service. Flutter never calls this directly.

---

## Agent Structure

```
orchestratorAgent          ← root agent, routes all requests
├── contentProcessorAgent  ← extracts content from PDF/image/text via Gemini multimodal
├── explanationAgent       ← generates personalised explanation + TL;DR
├── flashcardAgent         ← generates revision flashcards
├── quizAgent              ← generates MCQ quiz questions
└── profileUpdateAgent     ← analyses quiz results, updates VARK learning profile
```

---

## Tools

| Tool | Purpose |
|---|---|
| `getUserProfile` | Fetches user's VARK learning profile from Worker (GET /v1/internal/users/:userId) |
| `updateUserProfile` | Updates VARK scores after quiz (PATCH /v1/internal/users/:userId/profile) |
| `tts` | Cleans text for client-side TTS playback |

---

## Internal API Endpoints (what this server exposes)

All endpoints require header: `X-Internal-Key: <INTERNAL_API_KEY>`

| Method | Path | Purpose |
|---|---|---|
| GET | /health | Health check |
| POST | /internal/process | Full pipeline: process content → explain → flashcards |
| POST | /internal/quiz/generate | Generate quiz questions for a material |
| POST | /internal/quiz/evaluate | Score answers + update user profile |

---

## Key Design Decisions

- **Gemini 2.5 Flash** is used for all agents — fast and cost-effective for POC
- **All agents return JSON only** — prompts explicitly instruct no markdown, no preamble
- **Content is cached** — Worker stores generated content in D1 so ADK isn't called on every view
- **quiz correct_answer is never sent to Flutter** — only returned after submission to prevent cheating
- **VARK scores are incremental** — profile updates apply small deltas (+1 to +3), never reset
- **TTS is client-side** — we return clean text, Flutter handles playback via device TTS

---

## Environment Variables

```
GOOGLE_API_KEY=         # Gemini API key from Google AI Studio
INTERNAL_API_KEY=       # Shared secret with Cloudflare Worker
WORKER_BASE_URL=        # e.g. https://api.studyspark.app
GOOGLE_TTS_API_KEY=     # Optional for POC
PORT=8080
```

---

## Database (owned by Cloudflare Worker repo)

Tables in Cloudflare D1 (SQLite via Drizzle ORM):

| Table | Purpose |
|---|---|
| `users` | Clerk user accounts |
| `learning_profiles` | VARK scores + education level + learning goal |
| `study_materials` | Uploaded files metadata + R2 URLs |
| `generated_content` | Cached AI output per material |
| `flashcards` | AI-generated flashcards per material |
| `quiz_questions` | Generated questions + correct answers (never sent to client) |
| `quiz_attempts` | User quiz submissions + scores |
| `topic_progress` | Mastery score per user per material |

---

## User Profile Shape (UserProfile type)

```typescript
{
  user_id: string           // Clerk ID
  email?: string
  full_name?: string
  visual_score: number      // VARK scores — incremented over time
  auditory_score: number
  reading_score: number
  kinesthetic_score: number
  learning_style: 'visual' | 'auditory' | 'reading' | 'kinesthetic' | null
  hobbies: string[]         // Used for personalised analogies
  education_level: 'secondary' | 'undergrad' | 'postgrad' | 'professional' | null
  learning_goal: 'exams' | 'curiosity' | 'career' | 'project' | null
  preferred_difficulty: 'beginner' | 'intermediate' | 'advanced'
}
```

---

## POC Scope (2-week timeline)

### In scope
- Onboarding with VARK + interests questionnaire
- PDF / image / plain text upload
- Personalised explanation + story mode
- TL;DR summary
- AI flashcards
- AI quiz → profile update loop
- Progress tracking per topic
- Saved topics/history
- Reset preferences
- Difficulty toggle

### Post-POC (do not build now)
- Mind map generation
- "Go Deeper" rabbit hole feature
- Streak system

---

## Running Locally

```bash
npm install
cp .env .env   # fill in your keys
npm run dev            # opens ADK devtools UI at localhost:8000
```

## Deployment

```bash
# Build and deploy to Cloud Run
docker build -t studyspark-adk .
gcloud run deploy studyspark-adk --image studyspark-adk --platform managed
```

---

## Prompt Tuning

All prompts are in `src/prompts/`. When iterating:
- Test changes via `npm run dev` in the ADK devtools UI
- All prompts must end with "Return ONLY valid JSON. No markdown, no preamble."
- Never change the output JSON shape without updating the corresponding type in `src/types/`

---

## Relationships with Other Repos

| Repo | Owner | Stack |
|---|---|---|
| `studyspark-backend` | Teammate | Cloudflare Workers + D1 + R2 + Drizzle + Clerk |
| `studyspark-adk` | You | Google ADK TypeScript + Gemini + Cloud Run |
| `studyspark-app` | Flutter teammate | Flutter (mobile + web) |
