'use client';

// Message — single chat bubble with atmospheric glass treatment.
// AI messages and user messages are visually distinct via subtle accent
// colouring on the avatar circle + role label, but both sit in glass
// cards that read against the shell's hero gradient.

import { motion } from 'framer-motion';
import { cleanMarkdown } from '@/lib/cleanMarkdown';

export interface ChatMessage {
  id: string;
  role: 'ai' | 'user';
  text: string;
  highlight?: string;
}

interface MessageProps {
  message: ChatMessage;
  /** Compact mode for the floating overlay over the avatar */
  compact?: boolean;
}

export function Message({ message, compact = false }: MessageProps) {
  const isAI = message.role === 'ai';
  const avatarSize = compact ? 22 : 28;
  const fontSize = compact ? 12.5 : 14;
  const padding = compact ? '8px 12px' : '12px 16px';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      style={{
        display: 'flex',
        gap: compact ? 8 : 12,
        flexDirection: isAI ? 'row' : 'row-reverse',
        maxWidth: '100%',
      }}
    >
      {/* Avatar dot */}
      <div
        style={{
          width: avatarSize,
          height: avatarSize,
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'var(--font-jetbrains)',
          fontSize: compact ? 8 : 9,
          fontWeight: 600,
          marginTop: 2,
          background: isAI
            ? 'rgba(var(--accent-r), 0.14)'
            : 'rgba(245, 237, 216, 0.04)',
          border: `1px solid ${
            isAI ? 'rgba(var(--accent-r), 0.30)' : 'var(--atm-glass-border)'
          }`,
          color: isAI ? 'var(--accent)' : 'var(--t2)',
          letterSpacing: '0.04em',
        }}
      >
        {isAI ? 'L' : 'TY'}
      </div>

      {/* Bubble */}
      <div
        className="atm-glass"
        style={{
          padding,
          maxWidth: 'min(720px, 84%)',
          borderRadius: isAI ? '5px 16px 16px 16px' : '16px 5px 16px 16px',
          background: isAI
            ? 'var(--accent-soft)'
            : 'rgba(245, 237, 216, 0.06)',
          borderColor: isAI
            ? 'rgba(var(--accent-r), 0.26)'
            : 'var(--atm-glass-border)',
          backdropFilter: 'blur(18px) saturate(1.4)',
          WebkitBackdropFilter: 'blur(18px) saturate(1.4)',
        }}
      >
        {!compact && (
          <div
            style={{
              fontFamily: 'var(--font-jetbrains)',
              fontSize: 8.5,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: isAI ? 'rgba(var(--accent-r), 0.65)' : 'var(--t3)',
              marginBottom: 6,
            }}
          >
            {isAI ? 'Lukáš' : 'Ty'}
          </div>
        )}

        <div
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize,
            lineHeight: 1.55,
            color: 'var(--t1)',
            letterSpacing: '-0.005em',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {isAI ? cleanMarkdown(message.text) : message.text}
        </div>

        {message.highlight && !compact && (
          <div
            style={{
              background: 'rgba(245, 237, 216, 0.04)',
              borderLeft: '2px solid rgba(var(--accent-r), 0.45)',
              borderRadius: '0 8px 8px 0',
              padding: '10px 14px',
              marginTop: 10,
              fontFamily: 'var(--font-jetbrains)',
              fontSize: 11,
              color: 'var(--t2)',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {message.highlight}
          </div>
        )}
      </div>
    </motion.div>
  );
}
