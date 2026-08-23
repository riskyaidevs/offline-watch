import { z } from 'zod';

export const PROTOCOL_VERSION = 1;

export const MAX_NAME_LENGTH = 32;
export const MAX_CHAT_LENGTH = 500;
export const ROOM_ID_LENGTH = 4;

const idSchema = z.string().min(1).max(64);

export const playbackStateSchema = z.object({
  state: z.enum(['playing', 'paused']),
  /** Media position in seconds at `timestamp`. */
  position: z.number().min(0),
  /** Sender wall-clock time (ms, sender's clock) when state/position were sampled. */
  timestamp: z.number(),
  playbackRate: z.number().min(0.25).max(4),
});
export type PlaybackState = z.infer<typeof playbackStateSchema>;

export const userSchema = z.object({
  id: idSchema,
  name: z.string().min(1).max(MAX_NAME_LENGTH),
});
export type User = z.infer<typeof userSchema>;

export const roomSchema = z.object({
  id: z.string().length(ROOM_ID_LENGTH),
  hostId: idSchema,
  users: z.array(userSchema),
  controlMode: z.enum(['host', 'anyone']),
});
export type Room = z.infer<typeof roomSchema>;

export type ControlMode = Room['controlMode'];

/** Opaque WebRTC signaling payload relayed verbatim by the server. */
export const signalDataSchema = z.object({
  sdp: z
    .object({
      type: z.enum(['offer', 'answer', 'pranswer', 'rollback']),
      sdp: z.string().optional(),
    })
    .optional(),
  candidate: z
    .object({
      candidate: z.string().optional(),
      sdpMid: z.string().nullable().optional(),
      sdpMLineIndex: z.number().nullable().optional(),
      usernameFragment: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type SignalData = z.infer<typeof signalDataSchema>;

// ---- Client -> Server ----

export const clientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_room'),
    name: z.string().min(1).max(MAX_NAME_LENGTH),
  }),
  z.object({
    type: z.literal('join_room'),
    roomId: z.string().length(ROOM_ID_LENGTH),
    name: z.string().min(1).max(MAX_NAME_LENGTH),
  }),
  z.object({ type: z.literal('leave_room') }),
  z.object({
    type: z.literal('ping'),
    seq: z.number().int().min(0),
    clientTime: z.number(),
  }),
  z.object({ type: z.literal('playback'), state: playbackStateSchema }),
  z.object({
    type: z.literal('chat'),
    text: z.string().min(1).max(MAX_CHAT_LENGTH),
  }),
  z.object({
    type: z.literal('set_control_mode'),
    mode: z.enum(['host', 'anyone']),
  }),
  z.object({
    type: z.literal('signal'),
    targetId: idSchema,
    data: signalDataSchema,
  }),
  z.object({
    type: z.literal('ptt'),
    talking: z.boolean(),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ---- Server -> Client ----

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), selfId: idSchema }),
  z.object({ type: z.literal('room_joined'), room: roomSchema }),
  z.object({ type: z.literal('room_update'), room: roomSchema }),
  z.object({ type: z.literal('room_left') }),
  z.object({
    type: z.literal('pong'),
    seq: z.number().int().min(0),
    clientTime: z.number(),
    serverTime: z.number(),
  }),
  z.object({
    type: z.literal('playback'),
    state: playbackStateSchema,
    fromId: idSchema,
  }),
  z.object({
    type: z.literal('chat'),
    fromId: idSchema,
    name: z.string(),
    text: z.string().max(MAX_CHAT_LENGTH),
    ts: z.number(),
  }),
  z.object({
    type: z.literal('signal'),
    fromId: idSchema,
    data: signalDataSchema,
  }),
  z.object({
    type: z.literal('ptt'),
    fromId: idSchema,
    talking: z.boolean(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.enum([
      'room_not_found',
      'room_full',
      'not_in_room',
      'not_host',
      'rate_limited',
      'bad_message',
    ]),
    message: z.string(),
  }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const result = clientMessageSchema.safeParse(raw);
  return result.success ? result.data : null;
}
