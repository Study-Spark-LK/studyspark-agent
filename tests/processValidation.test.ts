/**
 * Tests for Group 9 — Process Request Validation
 */
import { describe, it, expect } from 'vitest';
import {
  validateProcessRequest,
  buildDownstreamPrompt,
} from '../src/lib/validators.js';

// ── Group 9a: validateProcessRequest ─────────────────────────────────────────

describe('validateProcessRequest', () => {
  // Missing userId ──────────────────────────────────────────────────────────

  it('returns invalid with MISSING_PROFILE when userId is absent', () => {
    const result = validateProcessRequest({ material: { text: 'hello' } });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('MISSING_PROFILE');
  });

  it('returns invalid with MISSING_PROFILE when userId is an empty string', () => {
    const result = validateProcessRequest({ userId: '', material: { text: 'hello' } });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('MISSING_PROFILE');
  });

  it('returns invalid with MISSING_PROFILE when userId is null', () => {
    const result = validateProcessRequest({ userId: null, material: { text: 'hello' } });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('MISSING_PROFILE');
  });

  // Missing material ────────────────────────────────────────────────────────

  it('returns invalid with BAD_REQUEST when material is absent', () => {
    const result = validateProcessRequest({ userId: 'user_abc' });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('BAD_REQUEST');
  });

  it('returns invalid with BAD_REQUEST when material is null', () => {
    const result = validateProcessRequest({ userId: 'user_abc', material: null });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('BAD_REQUEST');
  });

  // Missing both file_url and text ──────────────────────────────────────────

  it('returns invalid when material is an empty object (no content fields)', () => {
    const result = validateProcessRequest({ userId: 'user_abc', material: {} });
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('BAD_REQUEST');
    expect(result.errorMessage).toMatch(/pdfBase64|text|file_url/);
  });

  it('returns invalid when imageBase64 is present but mimeType is missing', () => {
    const result = validateProcessRequest({
      userId: 'user_abc',
      material: { imageBase64: 'abc123' }, // mimeType absent → invalid
    });
    expect(result.valid).toBe(false);
  });

  // Valid requests ──────────────────────────────────────────────────────────

  it('returns valid for a userId + text material', () => {
    const result = validateProcessRequest({
      userId: 'user_abc',
      material: { text: 'Study this content please.' },
    });
    expect(result.valid).toBe(true);
    expect(result.errorCode).toBeUndefined();
  });

  it('returns valid for a userId + pdfBase64 material', () => {
    const result = validateProcessRequest({
      userId: 'user_abc',
      material: { pdfBase64: 'JVBERi0xLjQ...' },
    });
    expect(result.valid).toBe(true);
  });

  it('returns valid for a userId + imageBase64 + mimeType material', () => {
    const result = validateProcessRequest({
      userId: 'user_abc',
      material: { imageBase64: 'iVBORw0KGgo=', mimeType: 'image/png' },
    });
    expect(result.valid).toBe(true);
  });

  it('returns valid for a userId + file_url material', () => {
    const result = validateProcessRequest({
      userId: 'user_abc',
      material: { file_url: 'https://cdn.example.com/doc.pdf' },
    });
    expect(result.valid).toBe(true);
  });

  it('pdfBase64 takes priority — imageBase64 without mimeType is still valid if pdfBase64 present', () => {
    const result = validateProcessRequest({
      userId: 'user_abc',
      material: { pdfBase64: 'data', imageBase64: 'data' }, // no mimeType, but pdfBase64 wins
    });
    expect(result.valid).toBe(true);
  });
});

// ── Group 9b: buildDownstreamPrompt (profileData → embedded vs. userId lookup) ─

describe('buildDownstreamPrompt', () => {
  const processed = { topic: 'DNA', summary: 'A double helix.', keyPoints: ['helix'] };

  // profileData present ─────────────────────────────────────────────────────

  it('embeds the profile when profileData is provided', () => {
    const profile = { visual_score: 80, learning_style: 'visual' };
    const prompt = buildDownstreamPrompt('user_abc', processed, profile);
    expect(prompt).toContain('do NOT call get_user_profile');
  });

  it('includes the serialised profile in the prompt body', () => {
    const profile = { visual_score: 80, learning_style: 'visual' };
    const prompt = buildDownstreamPrompt('user_abc', processed, profile);
    expect(prompt).toContain('"visual_score": 80');
    expect(prompt).toContain('"learning_style": "visual"');
  });

  it('includes the userId in the prompt regardless of profileData', () => {
    const prompt = buildDownstreamPrompt('user_xyz', processed, { score: 50 });
    expect(prompt).toContain('user_xyz');
  });

  // profileData absent ──────────────────────────────────────────────────────

  it('does NOT embed the profile instruction when profileData is absent', () => {
    const prompt = buildDownstreamPrompt('user_abc', processed);
    expect(prompt).not.toContain('do NOT call get_user_profile');
  });

  it('still contains the userId when profileData is absent (for tool lookup)', () => {
    const prompt = buildDownstreamPrompt('user_abc', processed);
    expect(prompt).toContain('userId: user_abc');
  });

  it('includes the processed study material in both cases', () => {
    const withProfile = buildDownstreamPrompt('u', processed, { x: 1 });
    const withoutProfile = buildDownstreamPrompt('u', processed);
    expect(withProfile).toContain('DNA');
    expect(withoutProfile).toContain('DNA');
  });

  // profileData undefined vs. missing ──────────────────────────────────────

  it('treats undefined profileData the same as omitted (no embedding)', () => {
    const prompt = buildDownstreamPrompt('user_abc', processed, undefined);
    expect(prompt).not.toContain('do NOT call get_user_profile');
  });
});
