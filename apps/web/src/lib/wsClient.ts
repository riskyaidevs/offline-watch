import {
  serverMessageSchema,
  type ClientMessage,
  type ServerMessage,
} from '@flightwatch/protocol';

type Listener = (message: ServerMessage) => void;

/**
 * WebSocket connection to the room server, with automatic reconnect.
 *
 * On reconnect the client must re-run joinRoom() — the server keeps no
 * session state for dead connections.
 */
export class FWClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  onMessage: (handler: Listener) => () => void = (handler) => {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  };

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error(`could not reach ${url}`));
      ws.onmessage = (event: MessageEvent<string>) => {
        let raw: unknown;
        try {
          raw = JSON.parse(event.data);
        } catch {
          return;
        }
        const parsed = serverMessageSchema.safeParse(raw);
        if (!parsed.success) {
          return;
        }
        for (const listener of this.listeners) {
          listener(parsed.data);
        }
      };
      ws.onclose = () => {
        if (!this.closed) {
          this.reconnectTimer = setTimeout(() => {
            void this.connect(url).catch(() => {
              /* the close handler will reschedule */
            });
          }, 2000);
        }
      };
    });
  }

  send(message: ClientMessage): void {
    this.ws?.send(JSON.stringify(message));
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
  }
}

export function serverUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
