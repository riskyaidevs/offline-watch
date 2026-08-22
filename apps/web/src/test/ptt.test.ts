import { describe, expect, it, vi } from 'vitest';
import { PushToTalk, reducePTT } from '../lib/ptt.js';

describe('push-to-talk state machine (Phase 8)', () => {
  it('press starts talking, release stops', () => {
    expect(reducePTT('idle', false, { type: 'press' })).toBe('talking');
    expect(reducePTT('talking', true, { type: 'release' })).toBe('idle');
  });

  it('release in idle is a no-op (pointerup without press)', () => {
    expect(reducePTT('idle', false, { type: 'release' })).toBe('idle');
  });

  it('pointercancel-style release also stops talking', () => {
    // pointercancel is modeled as 'release'.
    expect(reducePTT('talking', true, { type: 'release' })).toBe('idle');
  });

  it('tab going hidden force-mutes mid-talk', () => {
    expect(reducePTT('talking', true, { type: 'hidden' })).toBe('disabled');
    expect(reducePTT('idle', false, { type: 'hidden' })).toBe('disabled');
  });

  it('coming back visible returns to idle, never auto-talks', () => {
    expect(reducePTT('disabled', false, { type: 'visible' })).toBe('idle');
  });

  it('presses are ignored while disabled', () => {
    expect(reducePTT('disabled', false, { type: 'press' })).toBe('disabled');
  });

  it('losing the mic force-mutes', () => {
    expect(reducePTT('talking', true, { type: 'disable' })).toBe('disabled');
    expect(reducePTT('disabled', false, { type: 'enable' })).toBe('idle');
  });

  it('PushToTalk only notifies on actual transitions', () => {
    const changes: boolean[] = [];
    const ptt = new PushToTalk((talking) => changes.push(talking));

    ptt.dispatch({ type: 'press' });
    ptt.dispatch({ type: 'press' }); // already talking, no notify
    ptt.dispatch({ type: 'release' });
    ptt.dispatch({ type: 'release' }); // already idle, no notify
    expect(changes).toEqual([true, false]);
  });

  it('full sequence: talk -> hidden -> visible -> talk again', () => {
    const onChange = vi.fn();
    const ptt = new PushToTalk(onChange);
    ptt.dispatch({ type: 'press' });
    expect(ptt.current).toBe('talking');
    ptt.dispatch({ type: 'hidden' });
    expect(ptt.current).toBe('disabled');
    ptt.dispatch({ type: 'visible' });
    expect(ptt.current).toBe('idle');
    ptt.dispatch({ type: 'press' });
    expect(ptt.current).toBe('talking');
    expect(onChange).toHaveBeenLastCalledWith(true);
  });
});
