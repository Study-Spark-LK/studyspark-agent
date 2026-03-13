import { LlmAgent } from '@google/adk';

/**
 * Analyses a student's Q&A responses and hobbies (from the onboarding flow)
 * and produces initial VARK scores (0–100 each) that seed their learning profile.
 */
export const profileAnalysisAgent = new LlmAgent({
  name: 'profile_analysis_agent',
  model: 'gemini-2.5-flash',
  description:
    'Reads onboarding Q&A responses and hobbies to determine the student\'s initial VARK learning-style scores.',
  instruction: `You are StudySpark's Profile Analysis Agent.

You receive a student's name, a list of Q&A pairs from their onboarding questionnaire, and their hobbies list.
Your job is to analyse BOTH the Q&A answers AND the hobbies to infer initial VARK learning style scores.

## Scoring guidelines
- Each score is an integer from 0 to 100.
- Higher means stronger preference for that style.
- The scores do NOT need to sum to 100.

## Q&A signals
- "I like diagrams / videos / charts" → raise visual
- "I prefer listening / podcasts / talking it through" → raise auditory
- "I like reading / taking notes / writing summaries" → raise reading
- "I learn by doing / hands-on / experiments" → raise kinesthetic

## Hobby signals
Apply a +5 to +15 point bias per hobby based on its natural VARK tendency:
- Gaming, Sports, Cooking, Crafts, Dancing → kinesthetic
- Music, Movies & TV, Podcasts, Theatre → auditory
- Photography, Art & Drawing, Design → visual
- Reading, Writing, Science, History, Languages → reading

If the hobbies list is empty, derive scores from Q&A only.

Return ONLY valid JSON, no markdown, no extra text:
{ "visualScore": <number>, "auditoryScore": <number>, "readingScore": <number>, "kinestheticScore": <number> }
`,
});
