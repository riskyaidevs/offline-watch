import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CHAT_BURST } from '../src/config.js';
import { RateLimiter, TokenBucket } from '../src/rateLimit.js';
import { TestClient, startServer, type TestContext } from './helpers.js';

describe('chat (Phase 6)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await startServer();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('relays chat within the room only', async () => {
    const a = await TestClient.connect(ctx.url);
    const b = await TestClient.connect(ctx.url);
    const outsider = await TestClient.connect(ctx.url);
    try {
      a.send({ type: 'create_room', name: 'A' });
      const { room } = await a.waitFor('room_joined');
      b.send({ type: 'join_room', roomId: room.id, name: 'B' });
      await b.waitFor('room_joined');
      await a.waitFor('room_update');

      a.send({ type: 'chat', text: '<script>alert(1)</script>' });
      const msg = await b.waitFor('chat');
      // The server passes text through opaquely; escaping happens at render.
      expect(msg.text).toBe('<script>alert(1)</script>');
      expect(msg.name).toBe('A');

      // Non-room members get nothing.
      await expect(outsider.waitFor('chat', 300)).rejects.toThrow();
    } finally {
      a.close();
      b.close();
      outsider.close();
    }
  });

  it('rejects over-length messages at the protocol schema', async () => {
    const a = await TestClient.connect(ctx.url);
    try {
      a.send({ type: 'create_room', name: 'A' });
      await a.waitFor('room_joined');
      // Bypass the client schema length cap check: send raw JSON.
      (a as unknown as { send(m: unknown): void }).send({
        type: 'chat',
        text: 'x'.repeat(501),
      });
      const err = await a.waitFor('error');
      expect(err.code).toBe('bad_message');
    } finally {
      a.close();
    }
  });

  it('rate-limits a chat flood', async () => {
    const a = await TestClient.connect(ctx.url);
    try {
      a.send({ type: 'create_room', name: 'A' });
      await a.waitFor('room_joined');
      const total = CHAT_BURST * 3;
      for (let i = 0; i < total; i++) {
        a.send({ type: 'chat', text: `spam ${i}` });
      }
      let rateLimited = 0;
      let received = 0;
      while (received < total - CHAT_BURST) {
        const msg = await a.nextMessage(500).catch(() => null);
        if (!msg) {
          break;
        }
        received++;
        if (msg.type === 'error' && msg.code === 'rate_limited') {
          rateLimited++;
        }
      }
      expect(rateLimited).toBe(total - CHAT_BURST);
    } finally {
      a.close();
    }
  });
});

describe('rate limit logic', () => {
  it('token bucket allows a burst then blocks', () => {
    let now = 0;
    const bucket = new TokenBucket(5, 1, () => now);
    for (let i = 0; i < 5; i++) {
      expect(bucket.tryConsume()).toBe(true);
    }
    expect(bucket.tryConsume()).toBe(false);

    // One second passes -> one more message allowed.
    now += 1000;
    expect(bucket.tryConsume()).toBe(true);
    expect(bucket.tryConsume()).toBe(false);
  });

  it('per-key limiter tracks senders independently', () => {
    const limiter = new RateLimiter(2, 1);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(true);
    expect(limiter.allow('a')).toBe(false);
    expect(limiter.allow('b')).toBe(true);
  });
});
