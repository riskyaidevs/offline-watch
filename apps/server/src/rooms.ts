import { randomInt } from 'node:crypto';
import {
  ROOM_ID_LENGTH,
  type ControlMode,
  type Room,
  type User,
} from '@flightwatch/protocol';
import { MAX_ROOM_SIZE, MAX_ROOMS } from './config.js';

// Unambiguous alphabet: no 0/O, 1/I/L — these get read out loud in a plane cabin.
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomId(rng: (max: number) => number = randomInt): string {
  let id = '';
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += ROOM_ALPHABET[rng(ROOM_ALPHABET.length)];
  }
  return id;
}

interface RoomState {
  id: string;
  hostId: string;
  controlMode: ControlMode;
  /** Insertion-ordered: the first entry is the longest-present user. */
  users: Map<string, User>;
}

export class RoomFullError extends Error {}
export class RoomNotFoundError extends Error {}
export class TooManyRoomsError extends Error {}

export class RoomManager {
  private rooms = new Map<string, RoomState>();

  create(host: User): Room {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new TooManyRoomsError('too many rooms');
    }
    let id = generateRoomId();
    while (this.rooms.has(id)) {
      id = generateRoomId();
    }
    const room: RoomState = {
      id,
      hostId: host.id,
      controlMode: 'host',
      users: new Map([[host.id, host]]),
    };
    this.rooms.set(id, room);
    return this.toPublic(room);
  }

  join(roomId: string, user: User): Room {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) {
      throw new RoomNotFoundError(`room ${roomId} not found`);
    }
    if (!room.users.has(user.id) && room.users.size >= MAX_ROOM_SIZE) {
      throw new RoomFullError(`room ${roomId} is full`);
    }
    room.users.set(user.id, user);
    return this.toPublic(room);
  }

  /**
   * Remove a user. Returns the updated room (null if the room closed because
   * it became empty) plus the id of any newly assigned host.
   */
  leave(roomId: string, userId: string): { room: Room | null; newHostId: string | null } {
    const room = this.rooms.get(roomId);
    if (!room || !room.users.has(userId)) {
      return { room: null, newHostId: null };
    }
    room.users.delete(userId);
    if (room.users.size === 0) {
      this.rooms.delete(roomId);
      return { room: null, newHostId: null };
    }
    let newHostId: string | null = null;
    if (room.hostId === userId) {
      // Reassign to the longest-present remaining user.
      newHostId = room.users.keys().next().value!;
      room.hostId = newHostId;
    }
    return { room: this.toPublic(room), newHostId };
  }

  get(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    return room ? this.toPublic(room) : null;
  }

  setControlMode(roomId: string, mode: ControlMode): Room | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }
    room.controlMode = mode;
    return this.toPublic(room);
  }

  isHost(roomId: string, userId: string): boolean {
    return this.rooms.get(roomId)?.hostId === userId;
  }

  canControl(roomId: string, userId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      return false;
    }
    return room.controlMode === 'anyone' || room.hostId === userId;
  }

  get size(): number {
    return this.rooms.size;
  }

  private toPublic(room: RoomState): Room {
    return {
      id: room.id,
      hostId: room.hostId,
      controlMode: room.controlMode,
      users: [...room.users.values()],
    };
  }
}
