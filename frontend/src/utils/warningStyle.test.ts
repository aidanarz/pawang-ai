import { describe, expect, it } from 'vitest';
import type { ActiveWarning } from '@/data/agent';
import { RISK_COLORS } from './areaColors';
import { WARNING_LEVELS, changeKindLabel, formatWib, highestLevel, sortWarnings } from './warningStyle';

const w = (level: ActiveWarning['level'], since: string, grid: string = level): ActiveWarning => ({
  grid_id: grid,
  level,
  warning_id: grid,
  since,
  message: '',
  area: grid,
});

describe('warning levels', () => {
  it('use the risk colours: yellow, orange, red', () => {
    expect(WARNING_LEVELS.waspada.color).toBe(RISK_COLORS.Medium);
    expect(WARNING_LEVELS.siaga.color).toBe(RISK_COLORS['Medium-High']);
    expect(WARNING_LEVELS.awas.color).toBe(RISK_COLORS.High);
  });

  it('sort highest first, then newest first', () => {
    const out = sortWarnings([
      w('siaga', '2026-11-27T06:00:00+07:00', 'a'),
      w('awas', '2026-11-26T06:00:00+07:00', 'b'),
      w('siaga', '2026-11-27T09:00:00+07:00', 'c'),
    ]);
    expect(out.map((x) => x.grid_id)).toEqual(['b', 'c', 'a']);
  });

  it('find the highest level, or none for an empty list', () => {
    expect(highestLevel([w('waspada', 'x'), w('awas', 'x'), w('siaga', 'x')])).toBe('awas');
    expect(highestLevel([])).toBeNull();
  });
});

describe('agent log text', () => {
  it('names the change kinds in Indonesian and passes unknown ones through', () => {
    expect(changeKindLabel('tier_up')).toBe('Tier risiko naik');
    expect(changeKindLabel('citizen_reports')).toBe('Laporan warga menumpuk');
    expect(changeKindLabel('something_new')).toBe('something_new');
  });

  it('formats times in Jakarta time and leaves a bad date as it came', () => {
    expect(formatWib('2026-11-27T23:30:00Z')).toMatch(/28/); // 06.30 on the 28th in Jakarta
    expect(formatWib('not a date')).toBe('not a date');
  });
});
