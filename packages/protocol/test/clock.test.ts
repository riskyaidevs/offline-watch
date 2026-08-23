import { describe, expect, it } from 'vitest';
import {
  estimateClockOffset,
  expectedPosition,
  median,
  sampleOffset,
  toServerTime,
} from '../src/clock.js';

describe('median', () => {
  it('returns the middle value for odd counts', () => {
    expect(median([5, 1, 9])).toBe(5);
  });
  it('averages the two middle values for even counts', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('does not mutate the input', () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
  it('throws on empty input', () => {
    expect(() => median([])).toThrow();
  });
});

describe('sampleOffset', () => {
  it('computes the NTP-style offset assuming symmetric latency', () => {
    // Server is 1000ms ahead; round trip takes 100ms.
    const sample = { clientSentAt: 5000, serverTime: 6050, clientReceivedAt: 5100 };
    expect(sampleOffset(sample)).toBe(1000);
  });

  it('handles zero latency', () => {
    const sample = { clientSentAt: 100, serverTime: 1100, clientReceivedAt: 100 };
    expect(sampleOffset(sample)).toBe(1000);
  });
});

describe('estimateClockOffset', () => {
  it('takes the median of several samples, rejecting outliers', () => {
    // True offset 1000ms. One sample had a huge one-way latency spike.
    const samples = [
      { clientSentAt: 0, serverTime: 1050, clientReceivedAt: 100 }, // offset 1000
      { clientSentAt: 200, serverTime: 1250, clientReceivedAt: 300 }, // offset 1000
      { clientSentAt: 400, serverTime: 5000, clientReceivedAt: 500 }, // offset 4550 (spike)
      { clientSentAt: 600, serverTime: 1650, clientReceivedAt: 700 }, // offset 1000
      { clientSentAt: 800, serverTime: 1850, clientReceivedAt: 900 }, // offset 1000
    ];
    expect(estimateClockOffset(samples)).toBe(1000);
  });

  it('throws with no samples', () => {
    expect(() => estimateClockOffset([])).toThrow();
  });
});

describe('toServerTime', () => {
  it('adds the offset', () => {
    expect(toServerTime(1000, 250)).toBe(1250);
  });
});

describe('expectedPosition', () => {
  const base = { state: 'playing' as const, position: 10, timestamp: 100_000, playbackRate: 1 };

  it('advances position by elapsed time when playing', () => {
    expect(expectedPosition(base, 105_000)).toBe(15);
  });

  it('scales by playbackRate', () => {
    expect(expectedPosition({ ...base, playbackRate: 2 }, 105_000)).toBe(20);
  });

  it('stays put when paused', () => {
    expect(expectedPosition({ ...base, state: 'paused' }, 999_000)).toBe(10);
  });
});
