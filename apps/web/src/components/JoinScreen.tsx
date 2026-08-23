import { useState } from 'react';

interface Props {
  initialRoomId: string;
  error: string | null;
  onCreate(name: string): void;
  onJoin(roomId: string, name: string): void;
}

export function JoinScreen({ initialRoomId, error, onCreate, onJoin }: Props) {
  const [name, setName] = useState('');
  const [roomId, setRoomId] = useState(initialRoomId);

  const validName = name.trim().length > 0;
  const validRoom = /^[A-Za-z2-9]{4}$/.test(roomId.trim());

  return (
    <div className="join-screen">
      <h1>✈️ Flight Watch Party</h1>
      <p className="subtitle">
        Watch a movie together over the hotspot. No internet needed.
      </p>
      <label>
        Your name
        <input
          value={name}
          maxLength={32}
          onChange={(e) => setName(e.target.value)}
          placeholder="Seat 14A"
        />
      </label>
      <button disabled={!validName} onClick={() => onCreate(name.trim())}>
        Create a new room
      </button>
      <div className="divider">or</div>
      <label>
        Room code
        <input
          value={roomId}
          maxLength={4}
          onChange={(e) => setRoomId(e.target.value.toUpperCase())}
          placeholder="ABCD"
          className="room-code"
        />
      </label>
      <button disabled={!validName || !validRoom} onClick={() => onJoin(roomId.trim(), name.trim())}>
        Join room
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
