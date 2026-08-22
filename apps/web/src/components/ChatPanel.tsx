import { useEffect, useRef, useState } from 'react';

export interface ChatMessage {
  fromId: string;
  name: string;
  text: string;
  ts: number;
  self?: boolean;
}

interface Props {
  messages: ChatMessage[];
  onSend(text: string): void;
}

export function ChatPanel({ messages, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length]);

  function submit() {
    const text = draft.trim();
    if (text.length === 0 || text.length > 500) {
      return;
    }
    onSend(text);
    setDraft('');
  }

  return (
    <div className="chat-panel">
      <div className="chat-messages">
        {messages.map((m, i) => (
          // React renders text content only — HTML in messages is inert by construction.
          <div key={`${m.ts}-${i}`} className={m.self ? 'chat-message self' : 'chat-message'}>
            <span className="chat-name">{m.name}</span>
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="chat-input">
        <input
          value={draft}
          maxLength={500}
          placeholder="Say something…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              submit();
            }
          }}
        />
        <button onClick={submit}>Send</button>
      </div>
    </div>
  );
}
