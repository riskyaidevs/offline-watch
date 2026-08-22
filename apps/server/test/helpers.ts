import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import type { ClientMessage, ServerMessage } from '@flightwatch/protocol';
import { buildServer } from '../src/app.js';

export interface TestContext {
  app: FastifyInstance;
  url: string;
}

export async function startServer(): Promise<TestContext> {
  const app = buildServer({ logger: false });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address() as { port: number };
  return { app, url: `ws://127.0.0.1:${address.port}/ws` };
}

export class TestClient {
  private ws: WebSocket;
  private queue: ServerMessage[] = [];
  private waiters: Array<(msg: ServerMessage) => void> = [];

  private constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as ServerMessage;
      const waiter = this.waiters.shift();
      if (waiter) {
        waiter(msg);
      } else {
        this.queue.push(msg);
      }
    });
  }

  static connect(url: string): Promise<TestClient> {
    const ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
      ws.on('open', () => resolve(new TestClient(ws)));
      ws.on('error', reject);
    });
  }

  send(message: ClientMessage): void {
    this.ws.send(JSON.stringify(message));
  }

  nextMessage(timeoutMs = 2000): Promise<ServerMessage> {
    const queued = this.queue.shift();
    if (queued) {
      return Promise.resolve(queued);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
      this.waiters.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  }

  /** Wait for a message of a specific type, skipping others. */
  async waitFor<T extends ServerMessage['type']>(
    type: T,
    timeoutMs = 2000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const msg = await this.nextMessage(deadline - Date.now());
      if (msg.type === type) {
        return msg as Extract<ServerMessage, { type: T }>;
      }
    }
    throw new Error(`timeout waiting for ${type}`);
  }

  close(): void {
    this.ws.close();
  }
}
