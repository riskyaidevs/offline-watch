import type { Room } from '@flightwatch/protocol';
import type { FWClient } from '../lib/wsClient.js';
import type { SyncController } from '../lib/syncController.js';
import type { PushToTalk } from '../lib/ptt.js';
import { ChatPanel, type ChatMessage } from './ChatPanel.js';
import { PushToTalkButton } from './PushToTalkButton.js';
import { VideoPanel } from './VideoPanel.js';

interface Props {
  room: Room;
  selfId: string;
  client: FWClient;
  sync: SyncController;
  offsetMs: number | null;
  messages: ChatMessage[];
  ptt: PushToTalk;
  micReady: boolean;
  onGesturePassed(): void;
  onSendChat(text: string): void;
  onLeave(): void;
}

export function RoomScreen({
  room,
  selfId,
  client,
  sync,
  offsetMs,
  messages,
  ptt,
  micReady,
  onGesturePassed,
  onSendChat,
  onLeave,
}: Props) {
  const isHost = room.hostId === selfId;
  const canControl = room.controlMode === 'anyone' || isHost;

  return (
    <div className="room-screen">
      <header className="room-header">
        <div>
          Room <strong className="room-code">{room.id}</strong>
          <span className="hint"> — say it out loud or scan the QR</span>
        </div>
        <button className="leave" onClick={onLeave}>
          Leave
        </button>
      </header>

      <div className="participants">
        {room.users.map((u) => (
          <span key={u.id} className={u.id === room.hostId ? 'participant host' : 'participant'}>
            {u.name}
            {u.id === room.hostId ? ' 👑' : ''}
            {u.id === selfId ? ' (you)' : ''}
          </span>
        ))}
      </div>

      {isHost && (
        <label className="control-toggle">
          <input
            type="checkbox"
            checked={room.controlMode === 'anyone'}
            onChange={(e) =>
              client.send({
                type: 'set_control_mode',
                mode: e.target.checked ? 'anyone' : 'host',
              })
            }
          />
          Anyone can control playback
        </label>
      )}

      <VideoPanel
        client={client}
        sync={sync}
        offsetMs={offsetMs}
        canControl={canControl}
        onGesturePassed={onGesturePassed}
      />

      <div className="side-panel">
        <PushToTalkButton ptt={ptt} disabled={!micReady} />
        <ChatPanel messages={messages} onSend={onSendChat} />
      </div>
    </div>
  );
}
