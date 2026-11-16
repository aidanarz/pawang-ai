import { describe, expect, it } from 'vitest';
import { rainCategory } from './rainCategory';

describe('rainCategory (BMKG daily scale)', () => {
  it('maps mm/day to the category edges', () => {
    expect(rainCategory(0).kind).toBe('none');
    expect(rainCategory(0.5).kind).toBe('light');
    expect(rainCategory(19.9).kind).toBe('light');
    expect(rainCategory(20).kind).toBe('moderate');
    expect(rainCategory(50).kind).toBe('heavy');
    expect(rainCategory(100).kind).toBe('very_heavy');
    expect(rainCategory(150).kind).toBe('extreme');
  });
});
