import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Room } from '@flightwatch/protocol';
import { generateRoomId } from '../src/rooms.js';
import { TestClient, startServer, type TestContext } from './helpers.js';

describe('rooms (Phase 2)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await startServer();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('integration: create a room, join it twice, participant list updates', async () => {
    const host = await TestClient.connect(ctx.url);
    const alice = await TestClient.connect(ctx.url);
    const bob = await TestClient.connect(ctx.url);
    try {
      host.send({ type: 'create_room', name: 'Host' });
      const joined = await host.waitFor('room_joined');
      expect(joined.room.users).toHaveLength(1);
      const roomId = joined.room.id;

      alice.send({ type: 'join_room', roomId, name: 'Alice' });
      const aliceJoined = await alice.waitFor('room_joined');
      expect(aliceJoined.room.users.map((u) => u.name)).toEqual(['Host', 'Alice']);
      const hostUpdate = await host.waitFor('room_update');
      expect(hostUpdate.room.users).toHaveLength(2);

      bob.send({ type: 'join_room', roomId, name: 'Bob' });
      const bobJoined = await bob.waitFor('room_joined');
      expect(bobJoined.room.users).toHaveLength(3);
      expect((await host.waitFor('room_update')).room.users).toHaveLength(3);
      expect((await alice.waitFor('room_update')).room.users).toHaveLength(3);

      // Leave updates everyone.
      bob.send({ type: 'leave_room' });
      await bob.waitFor('room_left');
      const afterLeave = await host.waitFor('room_update');
      expect(afterLeave.room.users.map((u) => u.name)).toEqual(['Host', 'Alice']);
    } finally {
      host.close();
      alice.close();
      bob.close();
    }
  });

  it('rejects joining a nonexistent room', async () => {
    const client = await TestClient.connect(ctx.url);
    try {
      client.send({ type: 'join_room', roomId: 'ZZZZ', name: 'Alice' });
      const err = await client.waitFor('error');
      expect(err.code).toBe('room_not_found');
    } finally {
      client.close();
    }
  });

  it('host is the room creator', async () => {
    const host = await TestClient.connect(ctx.url);
    try {
      host.send({ type: 'create_room', name: 'Host' });
      const joined = await host.waitFor('room_joined');
      expect(joined.room.hostId).toBe(joined.room.users[0]!.id);
      expect(joined.room.controlMode).toBe('host');
    } finally {
      host.close();
    }
  });

  it('reassigns host when the host leaves, closes the room when empty', async () => {
    const host = await TestClient.connect(ctx.url);
    const guest = await TestClient.connect(ctx.url);
    try {
      host.send({ type: 'create_room', name: 'Host' });
      const { room } = await host.waitFor('room_joined');
      guest.send({ type: 'join_room', roomId: room.id, name: 'Guest' });
      const guestJoined = await guest.waitFor('room_joined');

      host.send({ type: 'leave_room' });
      await host.waitFor('room_left');
      const update = await guest.waitFor('room_update');
      expect(update.room.hostId).toBe(guestJoined.room.users[1]!.id);

      guest.send({ type: 'leave_room' });
      await guest.waitFor('room_left');
      // Room is gone now — joining it must fail.
      const rejoin = await TestClient.connect(ctx.url);
      try {
        rejoin.send({ type: 'join_room', roomId: room.id, name: 'Late' });
        const err = await rejoin.waitFor('error');
        expect(err.code).toBe('room_not_found');
      } finally {
        rejoin.close();
      }
    } finally {
      host.close();
      guest.close();
    }
  });

  it('disconnecting the socket leaves the room', async () => {
    const host = await TestClient.connect(ctx.url);
    const guest = await TestClient.connect(ctx.url);
    host.send({ type: 'create_room', name: 'Host' });
    const { room } = await host.waitFor('room_joined');
    guest.send({ type: 'join_room', roomId: room.id, name: 'Guest' });
    await guest.waitFor('room_joined');
    await host.waitFor('room_update');

    guest.close();
    const update = (await host.waitFor('room_update')) as { room: Room };
    expect(update.room.users).toHaveLength(1);
    host.close();
  });
});

describe('generateRoomId', () => {
  it('makes 4-char codes from an unambiguous alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const id = generateRoomId();
      expect(id).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    }
  });
});
