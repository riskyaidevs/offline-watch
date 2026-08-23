import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestClient, startServer, type TestContext } from './helpers.js';

describe('WebRTC signaling relay (Phase 7)', () => {
  let ctx: TestContext;

  beforeEach(async () => {
    ctx = await startServer();
  });

  afterEach(async () => {
    await ctx.app.close();
  });

  it('relays SDP/ICE between room members, addressed by id', async () => {
    const a = await TestClient.connect(ctx.url);
    const b = await TestClient.connect(ctx.url);
    try {
      a.send({ type: 'create_room', name: 'A' });
      const { room } = await a.waitFor('room_joined');
      b.send({ type: 'join_room', roomId: room.id, name: 'B' });
      const bJoined = await b.waitFor('room_joined');
      const aId = bJoined.room.users[0]!.id;
      const bId = bJoined.room.users[1]!.id;

      a.send({
        type: 'signal',
        targetId: bId,
        data: { sdp: { type: 'offer', sdp: 'fake-offer' } },
      });
      const offer = await b.waitFor('signal');
      expect(offer.fromId).toBe(aId);
      expect(offer.data.sdp?.sdp).toBe('fake-offer');

      b.send({
        type: 'signal',
        targetId: aId,
        data: { candidate: { candidate: 'candidate:1 ...', sdpMid: '0', sdpMLineIndex: 0 } },
      });
      const ice = await a.waitFor('signal');
      expect(ice.fromId).toBe(bId);
      expect(ice.data.candidate?.candidate).toContain('candidate:1');
    } finally {
      a.close();
      b.close();
    }
  });

  it('does not relay to users in another room', async () => {
    const a = await TestClient.connect(ctx.url);
    const c = await TestClient.connect(ctx.url);
    try {
      a.send({ type: 'create_room', name: 'A' });
      await a.waitFor('room_joined');
      c.send({ type: 'create_room', name: 'C' });
      const cJoined = await c.waitFor('room_joined');
      const cId = cJoined.room.users[0]!.id;

      a.send({ type: 'signal', targetId: cId, data: { sdp: { type: 'offer' } } });
      await expect(c.waitFor('signal', 300)).rejects.toThrow();
    } finally {
      a.close();
      c.close();
    }
  });

  it('relays PTT state to the room', async () => {
    const a = await TestClient.connect(ctx.url);
    const b = await TestClient.connect(ctx.url);
    try {
      a.send({ type: 'create_room', name: 'A' });
      const { room } = await a.waitFor('room_joined');
      b.send({ type: 'join_room', roomId: room.id, name: 'B' });
      await b.waitFor('room_joined');
      await a.waitFor('room_update');

      a.send({ type: 'ptt', talking: true });
      const ptt = await b.waitFor('ptt');
      expect(ptt.talking).toBe(true);
    } finally {
      a.close();
      b.close();
    }
  });
});
