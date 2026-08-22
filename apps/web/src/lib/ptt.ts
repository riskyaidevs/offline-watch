/**
 * Push-to-talk state machine, pure logic (no real microphone needed to test).
 *
 * States:
 *   idle     -> mic track disabled
 *   talking  -> mic track enabled
 *   disabled -> no mic / hidden tab; presses ignored, always outputs false
 */
export type PTTState = 'idle' | 'talking' | 'disabled';
export type PTTEvent =
  | { type: 'press' } // pointerdown
  | { type: 'release' } // pointerup / pointercancel
  | { type: 'hidden' } // tab backgrounded / phone locked
  | { type: 'visible' }
  | { type: 'disable' } // mic unavailable
  | { type: 'enable' }; // mic acquired

export function reducePTT(state: PTTState, talking: boolean, event: PTTEvent): PTTState {
  switch (event.type) {
    case 'press':
      return state === 'idle' ? 'talking' : state;
    case 'release':
      return state === 'talking' ? 'idle' : state;
    case 'hidden':
    case 'disable':
      // Force mute anywhere, from anywhere.
      return 'disabled';
    case 'visible':
    case 'enable':
      return state === 'disabled' ? 'idle' : state;
  }
}

export function isTalking(state: PTTState): boolean {
  return state === 'talking';
}

/**
 * Wraps the state machine, driving track.enabled (never tearing down the mic)
 * and notifying the room on changes.
 */
export class PushToTalk {
  private state: PTTState = 'idle';

  constructor(
    private readonly onTalkingChange: (talking: boolean) => void,
    initial: PTTState = 'idle',
  ) {
    this.state = initial;
  }

  get current(): PTTState {
    return this.state;
  }

  dispatch(event: PTTEvent): void {
    const next = reducePTT(this.state, isTalking(this.state), event);
    if (next !== this.state) {
      this.state = next;
      this.onTalkingChange(isTalking(next));
    }
  }
}
