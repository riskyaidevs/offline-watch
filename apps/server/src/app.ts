import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { WebSocketServer, WebSocket } from 'ws';
import {
  parseClientMessage,
  type ClientMessage,
  type ServerMessage,
  type User,
} from '@flightwatch/protocol';
import { CHAT_BURST, CHAT_REFILL_PER_SECOND } from './config.js';
import { RateLimiter } from './rateLimit.js';
import { RoomFullError, RoomManager, RoomNotFoundError, TooManyRoomsError } from './rooms.js';

export interface ServerOptions {
  /** TLS key/cert. Omit for plain HTTP (tests only — production needs HTTPS). */
  https?: { key: string; cert: string } | null;
  /** Directory with the built SPA. Missing dir = API-only mode. */
  staticDir?: string;
  logger?: boolean;
}

interface ClientState {
  socket: WebSocket;
  user: User | null;
  roomId: string | null;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
    ...(options.https ? { https: { key: options.https.key, cert: options.https.cert } } : {}),
  });

  const rooms = new RoomManager();
  const chatLimiter = new RateLimiter(CHAT_BURST, CHAT_REFILL_PER_SECOND);
  const clients = new Map<string, ClientState>();

  // Never, ever accept uploads — every participant has their own local copy
  // of the video file. Any upload-shaped request is a hard 404.
  const staticDir = options.staticDir;
  const hasStatic = staticDir != null && fs.existsSync(staticDir);
  if (hasStatic) {
    void app.register(fastifyStatic, { root: path.resolve(staticDir) });
  }
  app.setNotFoundHandler((req, reply) => {
    const isPageNav = req.method === 'GET' && !req.url.startsWith('/api');
    if (isPageNav && hasStatic) {
      // SPA fallback so /?room=XXXX deep links work.
      void reply.type('text/html').send(fs.readFileSync(path.join(staticDir!, 'index.html')));
      return;
    }
    void reply.code(404).send({ error: 'not found' });
  });

  const wss = new WebSocketServer({ server: app.server, path: '/ws' });

  function send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  function broadcast(roomId: string, message: ServerMessage, exceptId?: string): void {
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }
    for (const member of room.users) {
      if (member.id === exceptId) {
        continue;
      }
      const client = clients.get(member.id);
      if (client) {
        send(client.socket, message);
      }
    }
  }

  function leaveRoom(client: ClientState): void {
    if (!client.user || !client.roomId) {
      return;
    }
    const roomId = client.roomId;
    client.roomId = null;
    chatLimiter.remove(client.user.id);
    const { room } = rooms.leave(roomId, client.user.id);
    send(client.socket, { type: 'room_left' });
    if (room) {
      broadcast(roomId, { type: 'room_update', room });
    }
  }

  function joinRoom(client: ClientState, room: import('@flightwatch/protocol').Room): void {
    client.roomId = room.id;
    send(client.socket, { type: 'room_joined', room });
    broadcast(room.id, { type: 'room_update', room }, client.user!.id);
  }

  function handle(client: ClientState, raw: ClientMessage): void {
    const { socket } = client;
    switch (raw.type) {
      case 'create_room': {
        leaveRoom(client);
        const user: User = { id: client.user?.id ?? randomUUID(), name: raw.name };
        client.user = user;
        let room;
        try {
          room = rooms.create(user);
        } catch (err) {
          if (err instanceof TooManyRoomsError) {
            send(socket, { type: 'error', code: 'room_full', message: err.message });
            return;
          }
          throw err;
        }
        clients.set(user.id, client);
        joinRoom(client, room);
        return;
      }
      case 'join_room': {
        leaveRoom(client);
        const user: User = { id: client.user?.id ?? randomUUID(), name: raw.name };
        client.user = user;
        let room;
        try {
          room = rooms.join(raw.roomId, user);
        } catch (err) {
          if (err instanceof RoomNotFoundError) {
            send(socket, { type: 'error', code: 'room_not_found', message: err.message });
            return;
          }
          if (err instanceof RoomFullError) {
            send(socket, { type: 'error', code: 'room_full', message: err.message });
            return;
          }
          throw err;
        }
        clients.set(user.id, client);
        joinRoom(client, room);
        return;
      }
      case 'leave_room': {
        leaveRoom(client);
        return;
      }
      case 'ping': {
        send(socket, {
          type: 'pong',
          seq: raw.seq,
          clientTime: raw.clientTime,
          serverTime: Date.now(),
        });
        return;
      }
      case 'playback': {
        const roomId = client.roomId;
        if (!client.user || !roomId) {
          send(socket, { type: 'error', code: 'not_in_room', message: 'join a room first' });
          return;
        }
        if (!rooms.canControl(roomId, client.user.id)) {
          send(socket, {
            type: 'error',
            code: 'not_host',
            message: 'only the host can control playback',
          });
          return;
        }
        broadcast(
          roomId,
          { type: 'playback', state: raw.state, fromId: client.user.id },
          client.user.id,
        );
        return;
      }
      case 'chat': {
        const roomId = client.roomId;
        if (!client.user || !roomId) {
          send(socket, { type: 'error', code: 'not_in_room', message: 'join a room first' });
          return;
        }
        if (!chatLimiter.allow(client.user.id)) {
          send(socket, { type: 'error', code: 'rate_limited', message: 'slow down' });
          return;
        }
        broadcast(
          roomId,
          {
            type: 'chat',
            fromId: client.user.id,
            name: client.user.name,
            text: raw.text,
            ts: Date.now(),
          },
          client.user.id,
        );
        return;
      }
      case 'set_control_mode': {
        const roomId = client.roomId;
        if (!client.user || !roomId) {
          send(socket, { type: 'error', code: 'not_in_room', message: 'join a room first' });
          return;
        }
        if (!rooms.isHost(roomId, client.user.id)) {
          send(socket, {
            type: 'error',
            code: 'not_host',
            message: 'only the host can change control mode',
          });
          return;
        }
        const room = rooms.setControlMode(roomId, raw.mode);
        if (room) {
          broadcast(roomId, { type: 'room_update', room });
        }
        return;
      }
      case 'signal': {
        const roomId = client.roomId;
        if (!client.user || !roomId) {
          send(socket, { type: 'error', code: 'not_in_room', message: 'join a room first' });
          return;
        }
        const target = clients.get(raw.targetId);
        // Relay only within the same room; the server never inspects media.
        if (target && target.roomId === roomId) {
          send(target.socket, { type: 'signal', fromId: client.user.id, data: raw.data });
        }
        return;
      }
      case 'ptt': {
        const roomId = client.roomId;
        if (!client.user || !roomId) {
          send(socket, { type: 'error', code: 'not_in_room', message: 'join a room first' });
          return;
        }
        broadcast(
          roomId,
          { type: 'ptt', fromId: client.user.id, talking: raw.talking },
          client.user.id,
        );
        return;
      }
    }
  }

  wss.on('connection', (socket: WebSocket) => {
    const client: ClientState = { socket, user: null, roomId: null };
    socket.on('message', (data: Buffer) => {
      let parsed: ClientMessage | null = null;
      try {
        parsed = parseClientMessage(JSON.parse(data.toString()));
      } catch {
        parsed = null;
      }
      if (!parsed) {
        send(socket, { type: 'error', code: 'bad_message', message: 'unparseable message' });
        return;
      }
      handle(client, parsed);
    });
    socket.on('close', () => {
      leaveRoom(client);
      if (client.user) {
        clients.delete(client.user.id);
      }
    });
  });

  app.addHook('onClose', () => {
    wss.close();
  });

  return app;
}
