import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Room, ServerMessage } from '@flightwatch/protocol';
import { JoinScreen } from './components/JoinScreen.js';
import { RoomScreen } from './components/RoomScreen.js';
import type { ChatMessage } from './components/ChatPanel.js';
import { syncClock } from './lib/clockSync.js';
import { FWClient, serverUrl } from './lib/wsClient.js';
import { SyncController } from './lib/syncController.js';
import { PushToTalk } from './lib/ptt.js';
import { VoiceMesh } from './lib/webrtc.js';

export default function App() {
  const client = useMemo(() => new FWClient(), []);
  const sync = useMemo(() => new SyncController(), []);
  const [connected, setConnected] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offsetMs, setOffsetMs] = useState<number | null>(null);

  const nameRef = useRef('');
  const roomIdRef = useRef<string | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const meshRef = useRef<VoiceMesh | null>(null);
  const [micReady, setMicReady] = useState(false);

  const ptt = useMemo(
    () =>
      new PushToTalk((talking) => {
        const stream = micRef.current;
        if (stream) {
          for (const track of stream.getAudioTracks()) {
            track.enabled = talking;
          }
        }
        client.send({ type: 'ptt', talking });
      }, 'disabled'),
    [client],
  );

  const initialRoomId = useMemo(
    () => new URLSearchParams(location.search).get('room') ?? '',
    [],
  );

  const joinRoom = useCallback(
    (roomId: string | null, name: string) => {
      nameRef.current = name;
      roomIdRef.current = roomId;
      if (roomId) {
        client.send({ type: 'join_room', roomId, name });
      } else {
        client.send({ type: 'create_room', name });
      }
    },
    [client],
  );

  // Wire up the socket once.
  useEffect(() => {
    const off = client.onMessage((message: ServerMessage) => {
      switch (message.type) {
        case 'room_joined': {
          setRoom(message.room);
          setError(null);
          const me = message.room.users.find((u) => u.name === nameRef.current);
          if (me) {
            setSelfId(me.id);
          }
          void syncClock(client).then(setOffsetMs).catch(() => setOffsetMs(0));
          break;
        }
        case 'room_update':
          setRoom(message.room);
          if (selfId) {
            meshRef.current?.sync(message.room.users.map((u) => u.id));
          }
          break;
        case 'room_left':
          setRoom(null);
          setMessages([]);
          break;
        case 'playback':
          sync.apply(message.state);
          break;
        case 'chat':
          setMessages((prev) => [
            ...prev,
            { fromId: message.fromId, name: message.name, text: message.text, ts: message.ts },
          ]);
          break;
        case 'signal':
          meshRef.current?.handleSignal(message.fromId, message.data);
          break;
        case 'error':
          if (message.code === 'room_not_found' || message.code === 'room_full') {
            setError(message.message);
          }
          break;
        default:
          break;
      }
    });

    client
      .connect(serverUrl())
      .then(() => {
        setConnected(true);
        // Rejoin after a reconnect (server keeps no session for dead sockets).
        if (nameRef.current) {
          joinRoom(roomIdRef.current, nameRef.current);
        }
      })
      .catch(() => setError('Could not reach the party server. Are you on the hotspot?'));

    return off;
  }, [client, sync, joinRoom, selfId]);

  // Force-mute whenever the tab is hidden or phone locks.
  useEffect(() => {
    const onVisibility = () => {
      ptt.dispatch(document.hidden ? { type: 'hidden' } : { type: 'visible' });
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [ptt]);

  // Autoplay gate passed: now we may grab the mic and build the voice mesh.
  const onGesturePassed = useCallback(() => {
    void navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        // Start muted: PTT toggles track.enabled, never the connection.
        for (const track of stream.getAudioTracks()) {
          track.enabled = false;
        }
        micRef.current = stream;
        setMicReady(true);
        ptt.dispatch({ type: 'enable' });
        if (selfId) {
          const mesh = new VoiceMesh(client, selfId, (_peerId, remote) => {
            const audio = new Audio();
            audio.srcObject = remote;
            audio.autoplay = true;
          });
          mesh.setMicrophone(stream);
          meshRef.current = mesh;
        }
      })
      .catch(() => {
        // No mic — PTT stays disabled, everything else still works.
        setMicReady(false);
      });
  }, [client, ptt, selfId]);

  const onSendChat = useCallback(
    (text: string) => {
      client.send({ type: 'chat', text });
      setMessages((prev) => [
        ...prev,
        { fromId: selfId ?? 'me', name: nameRef.current || 'Me', text, ts: Date.now(), self: true },
      ]);
    },
    [client, selfId],
  );

  const onLeave = useCallback(() => {
    client.send({ type: 'leave_room' });
    roomIdRef.current = null;
    meshRef.current?.close();
    meshRef.current = null;
    sync.detach();
  }, [client, sync]);

  if (!room) {
    return (
      <JoinScreen
        initialRoomId={initialRoomId}
        error={connected ? error : (error ?? 'Connecting…')}
        onCreate={(name) => joinRoom(null, name)}
        onJoin={(roomId, name) => joinRoom(roomId, name)}
      />
    );
  }

  return (
    <RoomScreen
      room={room}
      selfId={selfId ?? ''}
      client={client}
      sync={sync}
      offsetMs={offsetMs}
      messages={messages}
      ptt={ptt}
      micReady={micReady}
      onGesturePassed={onGesturePassed}
      onSendChat={onSendChat}
      onLeave={onLeave}
    />
  );
}
