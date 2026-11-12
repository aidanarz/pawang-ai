import { describe, expect, it } from 'vitest';
import { formatProbability } from './formatProbability';

describe('formatProbability', () => {
  it('uses one decimal and a comma below 10%', () => {
    expect(formatProbability(0.0572)).toBe('5,7%');
    expect(formatProbability(0.0109)).toBe('1,1%');
    expect(formatProbability(0)).toBe('0,0%');
  });

  it('rounds to a whole number from 10% up', () => {
    expect(formatProbability(0.42)).toBe('42%');
    expect(formatProbability(0.1)).toBe('10%');
    expect(formatProbability(1)).toBe('100%');
  });

  it('clamps out-of-range values', () => {
    expect(formatProbability(1.4)).toBe('100%');
    expect(formatProbability(-0.2)).toBe('0,0%');
  });

  it('returns null when there is no number, never a made-up 0%', () => {
    expect(formatProbability(null)).toBeNull();
    expect(formatProbability(undefined)).toBeNull();
    expect(formatProbability(NaN)).toBeNull();
  });
});
