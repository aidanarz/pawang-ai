import { describe, expect, it } from 'vitest';
import { predictionModeParams } from './predictionMode';

describe('predictionModeParams', () => {
  it('does not send an archive date for live predictions', () => {
    expect(predictionModeParams('live', '2020-02-25')).toEqual({ mode: 'live' });
  });

  it('sends the selected date for historical predictions', () => {
    expect(predictionModeParams('replay', '2020-02-25')).toEqual({
      mode: 'replay',
      date: '2020-02-25',
    });
  });
});
