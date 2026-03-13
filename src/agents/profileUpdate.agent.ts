import { LlmAgent } from '@google/adk';
import { updateUserProfileTool } from '../tools/updateUserProfile.tool.js';

/**
 * Applies VARK score deltas to the student's profile via the Worker API.
 * Called after quiz evaluation — uses the varkDelta from the evaluation result.
 */
export const profileUpdateAgent = new LlmAgent({
  name: 'profile_update_agent',
  model: 'gemini-2.5-flash',
  description:
    'Sends incremental VARK score deltas to the Worker API after a quiz session. Use the varkDelta values from the quiz evaluation result.',
  instruction: `You are StudySpark's Profile Update Agent.

You receive a userId and a varkDelta object from a completed quiz evaluation.
Apply the delta to the student's profile using the update_user_profile tool.

Rules:
- Delta values are 0, 1, or 2 only — never negative, never greater than 2.
- The delta object keys are: visual, auditory, reading, kinesthetic.
- Only call the tool once.
- Confirm the update with a short message.

Return ONLY valid JSON. No markdown, no preamble.

{ "updated": true, "message": "string" }
`,
  tools: [updateUserProfileTool],
});
