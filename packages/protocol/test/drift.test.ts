import { describe, expect, it } from 'vitest';
import {
  decideDriftCorrection,
  DRIFT_HARD_SEEK_MS,
  DRIFT_IGNORE_MS,
  MAX_RATE_NUDGE,
} from '../src/drift.js';

describe('decideDriftCorrection', () => {
  it('ignores drift below the ignore threshold', () => {
    expect(decideDriftCorrection(0)).toEqual({ action: 'none' });
    expect(decideDriftCorrection(0.05)).toEqual({ action: 'none' });
    expect(decideDriftCorrection(-0.05)).toEqual({ action: 'none' });
    expect(decideDriftCorrection((DRIFT_IGNORE_MS - 1) / 1000)).toEqual({ action: 'none' });
  });

  it('nudges the rate up when behind', () => {
    const result = decideDriftCorrection(0.25);
    expect(result.action).toBe('rate');
    if (result.action === 'rate') {
      expect(result.playbackRate).toBeGreaterThan(1);
      expect(result.playbackRate).toBeLessThanOrEqual(1 + MAX_RATE_NUDGE);
    }
  });

  it('nudges the rate down when ahead', () => {
    const result = decideDriftCorrection(-0.25);
    expect(result.action).toBe('rate');
    if (result.action === 'rate') {
      expect(result.playbackRate).toBeLessThan(1);
      expect(result.playbackRate).toBeGreaterThanOrEqual(1 - MAX_RATE_NUDGE);
    }
  });

  it('caps the nudge at the hard-seek boundary', () => {
    const result = decideDriftCorrection(DRIFT_HARD_SEEK_MS / 1000);
    expect(result.action).toBe('rate');
    if (result.action === 'rate') {
      expect(result.playbackRate).toBeCloseTo(1 + MAX_RATE_NUDGE);
    }
  });

  it('hard-seeks beyond the hard-seek threshold', () => {
    expect(decideDriftCorrection(0.6)).toEqual({ action: 'seek' });
    expect(decideDriftCorrection(-2)).toEqual({ action: 'seek' });
  });

  it('respects a non-1 base rate', () => {
    const result = decideDriftCorrection(0.25, 1.5);
    expect(result.action).toBe('rate');
    if (result.action === 'rate') {
      expect(result.playbackRate).toBeGreaterThan(1.5);
    }
  });
});
