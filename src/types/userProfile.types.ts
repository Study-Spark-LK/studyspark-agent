export type LearningStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic';

export type EducationLevel = 'secondary' | 'undergrad' | 'postgrad' | 'professional';

export type LearningGoal = 'exams' | 'curiosity' | 'career' | 'project';

export type DifficultyPreference = 'beginner' | 'intermediate' | 'advanced';

/**
 * Mirrors the `learning_profiles` row in Cloudflare D1 (owned by the Worker).
 * Retrieved via GET /v1/users/:userId on the Worker.
 */
export interface UserProfile {
  user_id: string;
  email?: string;
  full_name?: string;
  /** VARK dimension scores — incremented over time, never reset */
  visual_score: number;
  auditory_score: number;
  reading_score: number;
  kinesthetic_score: number;
  /** Dominant VARK style derived by the Worker from scores */
  learning_style: LearningStyle | null;
  /** Interests used for generating personalised analogies */
  hobbies: string[];
  education_level: EducationLevel | null;
  learning_goal: LearningGoal | null;
  preferred_difficulty: DifficultyPreference;
}

/**
 * Small incremental update sent to Worker PATCH /v1/users/:userId/profile.
 * Deltas are in the range +1 to +3 per session. Scores are never decremented.
 */
export interface VarkDelta {
  visual?: number;
  auditory?: number;
  reading?: number;
  kinesthetic?: number;
}
