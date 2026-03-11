import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';

export const updateUserProfileTool = new FunctionTool({
  name: 'update_user_profile',
  description:
    'Sends incremental VARK score deltas to the Worker API after a quiz session. Deltas should be +1 to +3 per dimension based on quiz performance. Scores are never decremented.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: {
        type: Type.STRING,
        description: 'The Clerk user ID of the student.',
      },
      visual: {
        type: Type.NUMBER,
        description: 'Points to add to visual_score (0–3).',
      },
      auditory: {
        type: Type.NUMBER,
        description: 'Points to add to auditory_score (0–3).',
      },
      reading: {
        type: Type.NUMBER,
        description: 'Points to add to reading_score (0–3).',
      },
      kinesthetic: {
        type: Type.NUMBER,
        description: 'Points to add to kinesthetic_score (0–3).',
      },
    },
    required: ['userId'],
  },
  execute: async (input: unknown): Promise<{ success: boolean; message: string }> => {
    const { userId, visual = 0, auditory = 0, reading = 0, kinesthetic = 0 } = input as {
      userId: string;
      visual?: number;
      auditory?: number;
      reading?: number;
      kinesthetic?: number;
    };

    const workerUrl = process.env.WORKER_BASE_URL;
    const internalKey = process.env.INTERNAL_API_KEY;

    if (!workerUrl || !internalKey) {
      return { success: false, message: 'WORKER_BASE_URL or INTERNAL_API_KEY is not configured.' };
    }

    // Clamp each delta to the valid range
    const clamp = (n: number) => Math.max(0, Math.min(3, Math.round(n)));
    const delta = {
      visual: clamp(visual),
      auditory: clamp(auditory),
      reading: clamp(reading),
      kinesthetic: clamp(kinesthetic),
    };

    try {
      const res = await fetch(
        `${workerUrl}/v1/internal/users/${encodeURIComponent(userId)}/profile`,
        {
          method: 'PATCH',
          headers: {
            'X-Internal-Key': internalKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(delta),
        },
      );

      if (!res.ok) {
        return { success: false, message: `Worker returned ${res.status}: ${await res.text()}` };
      }

      return {
        success: true,
        message: `VARK delta applied: V+${delta.visual} A+${delta.auditory} R+${delta.reading} K+${delta.kinesthetic}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to update profile: ${message}` };
    }
  },
});
