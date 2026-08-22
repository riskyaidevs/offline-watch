import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from '../components/ChatPanel.js';

describe('chat rendering (Phase 6)', () => {
  it('renders HTML/script payloads as literal text, never as markup', () => {
    const malicious = '<script>alert("xss")</script><img src=x onerror=alert(1)>';
    render(
      <ChatPanel
        messages={[{ fromId: 'a', name: 'Eve', text: malicious, ts: 1 }]}
        onSend={() => {}}
      />,
    );

    // The payload shows up as readable text…
    expect(screen.getByText(malicious)).toBeDefined();
    // …and no live script or img element was created from it.
    expect(document.querySelector('.chat-messages script')).toBeNull();
    expect(document.querySelector('.chat-messages img')).toBeNull();
  });

  it('renders names as text too', () => {
    render(
      <ChatPanel
        messages={[{ fromId: 'a', name: '<b>Bold</b>', text: 'hi', ts: 1 }]}
        onSend={() => {}}
      />,
    );
    expect(document.querySelector('.chat-name b')).toBeNull();
    expect(screen.getByText('<b>Bold</b>')).toBeDefined();
  });
});
