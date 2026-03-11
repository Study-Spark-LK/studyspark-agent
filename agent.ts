/**
 * ADK entry point.
 *
 * `adk web` and `adk run` discover the agent through the named export `agent`.
 * This file re-exports the orchestrator so the CLI can find it.
 *
 * Usage:
 *   npx adk web          → opens the ADK dev UI
 *   npx adk run agent.ts → run in terminal
 */
import 'dotenv/config';
export { orchestratorAgent as agent } from './src/agents/orchestrator.agent.js';
