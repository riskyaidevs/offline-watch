import { useCallback, useEffect, useRef, useState } from 'react';
import type { FWClient } from '../lib/wsClient.js';
import type { SyncController } from '../lib/syncController.js';
import { createLocalVideoSource, revokeLocalVideoSource } from '../lib/localVideo.js';

interface Props {
  client: FWClient;
  sync: SyncController;
  /** Clock offset in ms; null until clock sync finished. */
  offsetMs: number | null;
  canControl: boolean;
  /** Fired once when the user passes the autoplay gesture gate. */
  onGesturePassed(): void;
}

export function VideoPanel({ client, sync, offsetMs, canControl, onGesturePassed }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<{ name: string; url: string } | null>(null);
  const [gesturePassed, setGesturePassed] = useState(false);

  const onFilePicked = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      setSource((old) => {
        if (old) {
          revokeLocalVideoSource(old.url);
        }
        return createLocalVideoSource(file);
      });
    },
    [],
  );

  // Attach the sync controller once the video element exists and clock sync is done.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || offsetMs == null) {
      return;
    }
    sync.attach(video, offsetMs);
    return () => sync.detach();
  }, [source, offsetMs, sync]);

  // Broadcast local control actions (host / anyone mode).
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !canControl) {
      return;
    }
    const handler = () => {
      if (sync.isApplyingRemote()) {
        return;
      }
      const state = sync.sample();
      if (state) {
        client.send({ type: 'playback', state });
      }
    };
    for (const event of ['play', 'pause', 'seeked', 'ratechange']) {
      video.addEventListener(event, handler);
    }
    return () => {
      for (const event of ['play', 'pause', 'seeked', 'ratechange']) {
        video.removeEventListener(event, handler);
      }
    };
  }, [client, sync, canControl, source]);

  /**
   * Autoplay policy gate: a PLAY over the socket is not a user gesture, so
   * every participant must tap once. Inside that gesture we prime the video
   * (play+pause) and hand control back up (mic permission etc.).
   */
  async function passGestureGate() {
    const video = videoRef.current;
    if (video) {
      try {
        await video.play();
        video.pause();
      } catch {
        /* nothing to play yet — still counts as a gesture */
      }
    }
    setGesturePassed(true);
    onGesturePassed();
  }

  return (
    <div className="video-panel">
      {!source ? (
        <label className="file-picker">
          <span>🎬 Choose your copy of the movie</span>
          <small>The file stays on your device — it is never uploaded.</small>
          <input type="file" accept="video/*" onChange={onFilePicked} />
        </label>
      ) : (
        <>
          <div className="video-wrapper">
            <video
              ref={videoRef}
              src={source.url}
              playsInline
              controls={canControl && gesturePassed}
            />
            {!gesturePassed && (
              <button className="gesture-gate" onClick={passGestureGate}>
                ▶ Tap to join playback
              </button>
            )}
          </div>
          <p className="file-name">Playing: {source.name}</p>
          <label className="re-pick">
            Pick a different file
            <input type="file" accept="video/*" onChange={onFilePicked} />
          </label>
        </>
      )}
    </div>
  );
}
