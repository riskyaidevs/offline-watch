import {
  estimateClockOffset,
  type ClockSample,
  type ServerMessage,
} from '@flightwatch/protocol';
import type { FWClient } from './wsClient.js';

/**
 * Run the ping/pong handshake several times and take the median offset.
 * A single sample is meaningless on real Wi-Fi.
 */
export async function syncClock(
  client: FWClient,
  samples = 5,
  intervalMs = 150,
): Promise<number> {
  const collected: ClockSample[] = [];

  return new Promise((resolve, reject) => {
    let seq = 0;
    let sentAt = 0;
    const timeout = setTimeout(() => reject(new Error('clock sync timed out')), 15_000);

    const off = client.onMessage((message: ServerMessage) => {
      if (message.type !== 'pong') {
        return;
      }
      collected.push({
        clientSentAt: message.clientTime,
        serverTime: message.serverTime,
        clientReceivedAt: Date.now(),
      });
      if (collected.length >= samples) {
        clearTimeout(timeout);
        off();
        resolve(estimateClockOffset(collected));
        return;
      }
      schedulePing();
    });

    function schedulePing() {
      setTimeout(() => {
        seq += 1;
        sentAt = Date.now();
        client.send({ type: 'ping', seq, clientTime: sentAt });
      }, seq === 0 ? 0 : intervalMs);
    }

    schedulePing();
    void sentAt;
  });
}

/** Server-clock estimate of now, given a sync offset. */
export function serverNow(offsetMs: number): number {
  return Date.now() + offsetMs;
}
