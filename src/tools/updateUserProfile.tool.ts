import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';

export const updateUserProfileTool = new FunctionTool({
  name: 'update_user_profile',
  description:
    'Sends incremental VARK score deltas to the Worker API after a quiz session. Each delta is 0, 1, or 2. Scores are never decremented.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      userId: {
        type: Type.STRING,
        description: 'The Clerk user ID of the student.',
      },
      visual: {
        type: Type.NUMBER,
        description: 'Points to add to visual_score (0, 1, or 2).',
      },
      auditory: {
        type: Type.NUMBER,
        description: 'Points to add to auditory_score (0, 1, or 2).',
      },
      reading: {
        type: Type.NUMBER,
        description: 'Points to add to reading_score (0, 1, or 2).',
      },
      kinesthetic: {
        type: Type.NUMBER,
        description: 'Points to add to kinesthetic_score (0, 1, or 2).',
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

    // Clamp each delta to 0–2, never negative
    const clamp = (n: number) => Math.max(0, Math.min(2, Math.round(n)));

    // Worker expects camelCase delta keys
    const body = {
      visualDelta:      clamp(visual),
      auditoryDelta:    clamp(auditory),
      readingDelta:     clamp(reading),
      kinestheticDelta: clamp(kinesthetic),
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
          body: JSON.stringify(body),
        },
      );

      if (!res.ok) {
        return { success: false, message: `Worker returned ${res.status}: ${await res.text()}` };
      }

      return {
        success: true,
        message: `VARK delta applied: V+${body.visualDelta} A+${body.auditoryDelta} R+${body.readingDelta} K+${body.kinestheticDelta}`,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to update profile: ${message}` };
    }
  },
});
