import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientMessage } from '@flightwatch/protocol';
import { TestClient, startServer, type TestContext } from './helpers.js';

const PLAY: ClientMessage = {
  type: 'playback',
  state: { state: 'playing', position: 10, timestamp: 1000, playbackRate: 1 },
};

describe('host controls (Phase 5)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await startServer();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  async function setup() {
    const host = await TestClient.connect(ctx.url);
    const guest = await TestClient.connect(ctx.url);
    host.send({ type: 'create_room', name: 'Host' });
    const { room } = await host.waitFor('room_joined');
    guest.send({ type: 'join_room', roomId: room.id, name: 'Guest' });
    await guest.waitFor('room_joined');
    await host.waitFor('room_update');
    return { host, guest };
  }

  it('host playback broadcasts to others; non-host control is rejected by default', async () => {
    const { host, guest } = await setup();
    try {
      // Host plays -> guest receives it.
      host.send(PLAY);
      const received = await guest.waitFor('playback');
      expect(received.state).toEqual(PLAY.state);

      // Guest tries to control -> rejected.
      guest.send(PLAY);
      const err = await guest.waitFor('error');
      expect(err.code).toBe('not_host');

      // After the toggle, anyone can control.
      host.send({ type: 'set_control_mode', mode: 'anyone' });
      await host.waitFor('room_update');
      await guest.waitFor('room_update');
      guest.send(PLAY);
      const relayed = await host.waitFor('playback');
      expect(relayed.state.position).toBe(10);
    } finally {
      host.close();
      guest.close();
    }
  });

  it('non-host cannot change the control mode', async () => {
    const { host, guest } = await setup();
    try {
      guest.send({ type: 'set_control_mode', mode: 'anyone' });
      const err = await guest.waitFor('error');
      expect(err.code).toBe('not_host');
    } finally {
      host.close();
      guest.close();
    }
  });

  it('playback from outside a room is rejected', async () => {
    const loner = await TestClient.connect(ctx.url);
    try {
      loner.send(PLAY);
      const err = await loner.waitFor('error');
      expect(err.code).toBe('not_in_room');
    } finally {
      loner.close();
    }
  });
});

describe('ping/pong', () => {
  it('answers with serverTime for clock sync', async () => {
    const ctx = await startServer();
    const client = await TestClient.connect(ctx.url);
    try {
      client.send({ type: 'ping', seq: 1, clientTime: 12345 });
      const pong = await client.waitFor('pong');
      expect(pong.seq).toBe(1);
      expect(pong.clientTime).toBe(12345);
      expect(pong.serverTime).toBeGreaterThan(0);
    } finally {
      client.close();
      await ctx.app.close();
    }
  });
});
