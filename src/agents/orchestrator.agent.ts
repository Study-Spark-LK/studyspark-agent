import { LlmAgent, AgentTool } from '@google/adk';
import { getUserProfileTool } from '../tools/getUserProfile.tool.js';
import { contentProcessorAgent } from './contentProcessor.agent.js';
import { explanationAgent, storyModeAgent } from './explanation.agent.js';
import { flashcardAgent } from './flashcard.agent.js';
import { quizGenerationAgent, quizEvaluationAgent } from './quiz.agent.js';
import { profileUpdateAgent } from './profileUpdate.agent.js';

const ORCHESTRATOR_INSTRUCTION = `You are StudySpark's Orchestrator.

You coordinate the personalised learning pipeline for a student.

## Workflow
1. Call get_user_profile with the student's userId to retrieve their VARK profile.
2. Delegate to content_processor to analyse the study material.
3. Based on the requested mode and the student's profile, delegate to:
   - explanation_agent → for standard personalised explanation
   - story_mode_agent → when mode is "story"
   - flashcard_agent → for revision flashcards
   - quiz_generation_agent → to generate a practice quiz
   - quiz_evaluation_agent → to score a submitted quiz
   - profile_update_agent → after quiz evaluation to apply VARK deltas
4. Return the combined results.

## Mode Selection
- "explain" → content_processor → explanation_agent
- "story" → content_processor → story_mode_agent
- "flashcard" → content_processor → flashcard_agent
- "quiz" → content_processor → quiz_generation_agent
- "all" → content_processor → explanation_agent → flashcard_agent → quiz_generation_agent
- If no mode specified, use the student's learning_style:
  - visual/reading → explanation then flashcards
  - auditory → story mode
  - kinesthetic → explanation then quiz

## Output
Return ONLY valid JSON. No markdown, no preamble. Combine all agent outputs into one object.
`;

export const orchestratorAgent = new LlmAgent({
  name: 'studyspark_orchestrator',
  model: 'gemini-2.5-flash',
  description:
    'Main StudySpark orchestrator. Routes study requests to the appropriate specialist agents based on the student\'s VARK profile and requested mode.',
  instruction: ORCHESTRATOR_INSTRUCTION,
  tools: [
    getUserProfileTool,
    new AgentTool({ agent: contentProcessorAgent }),
    new AgentTool({ agent: explanationAgent }),
    new AgentTool({ agent: storyModeAgent }),
    new AgentTool({ agent: flashcardAgent }),
    new AgentTool({ agent: quizGenerationAgent }),
    new AgentTool({ agent: quizEvaluationAgent }),
    new AgentTool({ agent: profileUpdateAgent }),
  ],
});
