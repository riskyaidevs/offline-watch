import { describe, expect, it } from 'vitest';
import { MAX_CHAT_LENGTH, MAX_NAME_LENGTH, parseClientMessage } from '../src/messages.js';

describe('parseClientMessage', () => {
  it('parses a valid create_room', () => {
    expect(parseClientMessage({ type: 'create_room', name: 'Alice' })).toEqual({
      type: 'create_room',
      name: 'Alice',
    });
  });

  it('parses a valid playback message', () => {
    const msg = {
      type: 'playback',
      state: { state: 'playing', position: 12.5, timestamp: 1234, playbackRate: 1 },
    };
    expect(parseClientMessage(msg)).toEqual(msg);
  });

  it('rejects unknown message types', () => {
    expect(parseClientMessage({ type: 'hack', payload: {} })).toBeNull();
  });

  it('rejects malformed payloads', () => {
    expect(parseClientMessage(null)).toBeNull();
    expect(parseClientMessage('create_room')).toBeNull();
    expect(parseClientMessage({ type: 'join_room', roomId: 'X', name: 'A' })).toBeNull();
  });

  it('rejects chat messages over the length cap', () => {
    const ok = { type: 'chat', text: 'x'.repeat(MAX_CHAT_LENGTH) };
    const tooLong = { type: 'chat', text: 'x'.repeat(MAX_CHAT_LENGTH + 1) };
    expect(parseClientMessage(ok)).not.toBeNull();
    expect(parseClientMessage(tooLong)).toBeNull();
  });

  it('rejects empty chat messages', () => {
    expect(parseClientMessage({ type: 'chat', text: '' })).toBeNull();
  });

  it('rejects names over the length cap', () => {
    const tooLong = { type: 'create_room', name: 'n'.repeat(MAX_NAME_LENGTH + 1) };
    expect(parseClientMessage(tooLong)).toBeNull();
  });

  it('rejects absurd playback rates', () => {
    const msg = {
      type: 'playback',
      state: { state: 'playing', position: 0, timestamp: 0, playbackRate: 100 },
    };
    expect(parseClientMessage(msg)).toBeNull();
  });
});
