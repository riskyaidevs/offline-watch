import {
  decideDriftCorrection,
  expectedPosition,
  type PlaybackState,
} from '@flightwatch/protocol';
import { serverNow } from './clockSync.js';

const DRIFT_CHECK_INTERVAL_MS = 1000;

/**
 * Applies playback commands to a <video> element and keeps it drifting toward
 * the shared position. Local controls (host) are handled by the UI calling
 * broadcast(); remote commands come in via apply().
 */
export class SyncController {
  private video: HTMLVideoElement | null = null;
  private current: PlaybackState | null = null;
  private offsetMs = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** The room's intended rate, used as the base for drift nudges. */
  private baseRate = 1;

  attach(video: HTMLVideoElement, offsetMs: number): void {
    this.detach();
    this.video = video;
    this.offsetMs = offsetMs;
    this.timer = setInterval(() => this.correctDrift(), DRIFT_CHECK_INTERVAL_MS);
  }

  detach(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.video = null;
  }

  /** Echo suppression: applying a remote command fires seeked/play events,
   * which must not be re-broadcast as if they were local control actions. */
  private suppressUntil = 0;

  /** A playback command arrived from the room. */
  apply(state: PlaybackState): void {
    this.current = state;
    this.suppressUntil = Date.now() + 500;
    this.baseRate = state.playbackRate;
    const video = this.video;
    if (!video) {
      return;
    }
    const target = expectedPosition(state, serverNow(this.offsetMs));
    video.currentTime = target;
    if (state.state === 'playing') {
      video.playbackRate = state.playbackRate;
      void video.play().catch(() => {
        /* autoplay gate should have handled this; drift loop will retry */
      });
    } else {
      video.pause();
    }
  }

  /** True briefly after apply() — media events in this window are echoes. */
  isApplyingRemote(): boolean {
    return Date.now() < this.suppressUntil;
  }

  /** Sample local state for broadcasting (host/anyone control). */
  sample(): PlaybackState | null {
    const video = this.video;
    if (!video) {
      return null;
    }
    return {
      state: video.paused ? 'paused' : 'playing',
      position: video.currentTime,
      timestamp: serverNow(this.offsetMs),
      playbackRate: video.playbackRate === this.baseRate ? this.baseRate : video.playbackRate,
    };
  }

  private correctDrift(): void {
    const video = this.video;
    const state = this.current;
    if (!video || !state || state.state !== 'playing') {
      return;
    }
    const expected = expectedPosition(state, serverNow(this.offsetMs));
    const delta = expected - video.currentTime;
    const correction = decideDriftCorrection(delta, this.baseRate);
    if (correction.action === 'seek') {
      video.currentTime = expected;
    } else if (correction.action === 'rate') {
      video.playbackRate = correction.playbackRate;
    }
  }
}
