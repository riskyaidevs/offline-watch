/**
 * Drift-correction decision, as pure logic.
 *
 * Given how far the local playback position is from where it should be:
 *   |delta| < 100ms  -> do nothing
 *   100..500ms       -> nudge playbackRate to gently catch up / slow down
 *   |delta| > 500ms  -> hard seek
 */

export const DRIFT_IGNORE_MS = 100;
export const DRIFT_HARD_SEEK_MS = 500;

/** Fastest/slowest rate we ever nudge to. */
export const MAX_RATE_NUDGE = 0.15;

export type DriftCorrection =
  | { action: 'none' }
  | { action: 'rate'; playbackRate: number }
  | { action: 'seek' };

/**
 * @param deltaSeconds expected position minus actual position.
 *   Positive = we are behind and need to catch up.
 * @param baseRate the room's intended playback rate (usually 1).
 */
export function decideDriftCorrection(deltaSeconds: number, baseRate = 1): DriftCorrection {
  const deltaMs = deltaSeconds * 1000;
  const abs = Math.abs(deltaMs);

  if (abs < DRIFT_IGNORE_MS) {
    return { action: 'none' };
  }
  if (abs > DRIFT_HARD_SEEK_MS) {
    return { action: 'seek' };
  }
  // Proportional nudge: at 500ms of drift we hit the max nudge.
  const nudge = Math.min(abs / DRIFT_HARD_SEEK_MS, 1) * MAX_RATE_NUDGE;
  const rate = deltaMs > 0 ? baseRate * (1 + nudge) : baseRate * (1 - nudge);
  return { action: 'rate', playbackRate: rate };
}
