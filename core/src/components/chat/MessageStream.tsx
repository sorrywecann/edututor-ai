'use client';

import { useEffect, useRef } from 'react';
import { Message, ChatMessage } from './Message';

interface MessageStreamProps {
  messages: ChatMessage[];
  /** When true, render compactly for the floating overlay context */
  compact?: boolean;
}

export function MessageStream({ messages, compact = true }: MessageStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 14,
        padding: 0,
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      {messages.map((msg) => (
        <Message key={msg.id} message={msg} compact={compact} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
