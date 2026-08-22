import { useState } from 'react';
import { PushToTalk } from '../lib/ptt.js';

interface Props {
  ptt: PushToTalk;
  disabled: boolean;
}

export function PushToTalkButton({ ptt, disabled }: Props) {
  const [, forceRender] = useState(0);
  const talking = ptt.current === 'talking';

  return (
    <button
      className={talking ? 'ptt talking' : 'ptt'}
      disabled={disabled}
      onPointerDown={(e) => {
        e.preventDefault();
        ptt.dispatch({ type: 'press' });
        forceRender((n) => n + 1);
      }}
      onPointerUp={() => {
        ptt.dispatch({ type: 'release' });
        forceRender((n) => n + 1);
      }}
      onPointerCancel={() => {
        ptt.dispatch({ type: 'release' });
        forceRender((n) => n + 1);
      }}
      onPointerLeave={() => {
        ptt.dispatch({ type: 'release' });
        forceRender((n) => n + 1);
      }}
    >
      {talking ? '🎙️ Talking…' : '🎤 Hold to talk'}
    </button>
  );
}
