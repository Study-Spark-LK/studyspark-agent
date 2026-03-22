import { LlmAgent } from '@google/adk';
import { EXPLANATION_PROMPT, STORY_MODE_EXPLANATION_PROMPT } from '../prompts/explanation.prompt.js';
import { ttsTool } from '../tools/tts.tool.js';
import { getUserProfileTool } from '../tools/getUserProfile.tool.js';

/**
 * Generates a personalised explanation of study content.
 * Adapts to VARK learning style, education level, hobbies, and preferred difficulty.
 * Outputs JSON stored under "explanationOutput" in session state.
 */
export const explanationAgent = new LlmAgent({
  name: 'explanation_agent',
  model: 'gemini-2.5-flash',
  generateContentConfig: { responseMimeType: 'application/json' },
  description:
    'Produces a VARK-personalised explanation with TL;DR, key points, and hobby-based analogies. Returns structured JSON.',
  instruction: EXPLANATION_PROMPT,
  tools: [getUserProfileTool, ttsTool],
  outputKey: 'explanationOutput',
});

/**
 * Story mode variant: same content, narrative format.
 * Returns JSON with story prose and a concept map.
 */
export const storyModeAgent = new LlmAgent({
  name: 'story_mode_agent',
  model: 'gemini-2.5-flash',
  generateContentConfig: { responseMimeType: 'application/json' },
  description:
    'Transforms study content into an engaging story personalised to the student\'s hobbies. Returns JSON with story prose and a concept map.',
  instruction: STORY_MODE_EXPLANATION_PROMPT,
  tools: [getUserProfileTool],
  outputKey: 'storyOutput',
});
