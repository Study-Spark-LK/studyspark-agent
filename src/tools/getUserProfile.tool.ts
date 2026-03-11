import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';
import type { UserProfile } from '../types/userProfile.types.js';

export const getUserProfileTool = new FunctionTool({
  name: 'get_user_profile',
  description:
    'Fetches the student\'s VARK learning profile from the Worker API. Call this at the start of every session to personalise the content — the profile contains VARK scores, hobbies, education level, and preferred difficulty.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: {
        type: Type.STRING,
        description: 'The Clerk user ID of the student.',
      },
    },
    required: ['userId'],
  },
  execute: async (input: unknown): Promise<UserProfile | { error: string }> => {
    const { userId } = input as { userId: string };

    const workerUrl = process.env.WORKER_BASE_URL;
    const internalKey = process.env.INTERNAL_API_KEY;

    if (!workerUrl || !internalKey) {
      return { error: 'WORKER_BASE_URL or INTERNAL_API_KEY is not configured.' };
    }

    try {
      const res = await fetch(`${workerUrl}/v1/internal/users/${encodeURIComponent(userId)}`, {
        headers: { 'X-Internal-Key': internalKey },
      });

      if (!res.ok) {
        return { error: `Worker returned ${res.status}: ${await res.text()}` };
      }

      return (await res.json()) as UserProfile;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: `Failed to fetch user profile: ${message}` };
    }
  },
});
