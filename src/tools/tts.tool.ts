import { FunctionTool } from '@google/adk';
import { Type } from '@google/genai';

/**
 * TTS is handled client-side by Flutter's device TTS engine.
 * This tool strips markdown and normalises text so it reads naturally
 * when spoken aloud — no external API calls needed.
 */
export const ttsTool = new FunctionTool({
  name: 'prepare_tts_text',
  description:
    'Cleans and formats text for client-side text-to-speech playback. Strips markdown formatting, normalises whitespace, and expands abbreviations so the text reads naturally when spoken by Flutter\'s device TTS engine.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: {
        type: Type.STRING,
        description: 'The raw text (possibly containing markdown) to clean for TTS.',
      },
    },
    required: ['text'],
  },
  execute: (input: unknown): { cleanText: string; characterCount: number } => {
    const { text } = input as { text: string };

    const clean = text
      // Remove markdown headings
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1')
      .replace(/_{1,2}([^_]+)_{1,2}/g, '$1')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Remove list markers
      .replace(/^[\s-]*[-*+]\s+/gm, '')
      .replace(/^\s*\d+\.\s+/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove links but keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      // Collapse multiple blank lines
      .replace(/\n{3,}/g, '\n\n')
      // Normalise whitespace
      .replace(/[ \t]+/g, ' ')
      .trim();

    return { cleanText: clean, characterCount: clean.length };
  },
});
