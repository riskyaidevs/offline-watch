/**
 * Clock-offset estimation (NTP-style) between a client and the server.
 *
 * For each ping round trip:
 *   offset_i = serverTime - (clientSentAt + rtt / 2)
 * where rtt = clientReceivedAt - clientSentAt.
 *
 * A single sample is noisy on real Wi-Fi, so callers collect several samples
 * and take the median, which is robust against one-off latency spikes.
 */

export interface ClockSample {
  /** Client clock when the ping was sent (ms). */
  clientSentAt: number;
  /** Server clock stamped on the pong (ms). */
  serverTime: number;
  /** Client clock when the pong was received (ms). */
  clientReceivedAt: number;
}

export function sampleOffset(sample: ClockSample): number {
  const rtt = sample.clientReceivedAt - sample.clientSentAt;
  return sample.serverTime - (sample.clientSentAt + rtt / 2);
}

export function median(values: number[]): number {
  if (values.length === 0) {
    throw new Error('median of empty array');
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const a = sorted[mid]!;
  return sorted.length % 2 === 1 ? a : (a + sorted[mid - 1]!) / 2;
}

/**
 * Estimate the clock offset (server - client, ms) from several round trips.
 * Throws if no samples are provided.
 */
export function estimateClockOffset(samples: ClockSample[]): number {
  if (samples.length === 0) {
    throw new Error('need at least one clock sample');
  }
  return median(samples.map(sampleOffset));
}

/** Convert a client-clock timestamp to server-clock time. */
export function toServerTime(clientTime: number, offsetMs: number): number {
  return clientTime + offsetMs;
}

/**
 * Expected media position (seconds) for a playback state at a given
 * server-clock time.
 */
export function expectedPosition(
  state: { state: 'playing' | 'paused'; position: number; timestamp: number; playbackRate: number },
  serverNowMs: number,
): number {
  if (state.state === 'paused') {
    return state.position;
  }
  return state.position + ((serverNowMs - state.timestamp) / 1000) * state.playbackRate;
}
