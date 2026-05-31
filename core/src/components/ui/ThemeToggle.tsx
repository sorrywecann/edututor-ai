'use client';

import { useTheme } from '@/context/ThemeContext';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--raised)',
        border: '1px solid var(--border-mid)',
        borderRadius: '20px',
        padding: '5px 13px',
        cursor: 'pointer',
        fontFamily: 'var(--font-jetbrains)',
        fontSize: '9.5px',
        letterSpacing: '0.08em',
        color: 'var(--t2)',
        transition: 'all 0.2s',
        userSelect: 'none',
      }}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
    >
      <span
        style={{
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: 'var(--accent)',
          display: 'block',
          flexShrink: 0,
        }}
      />
      {theme === 'dark' ? 'LIGHT' : 'DARK'}
    </button>
  );
}
