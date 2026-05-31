'use client';

// Button — unified button primitive with atmosphere-consistent variants.
// Stops every page from inventing its own button styling.
//
// Variants:
//   primary    — solid accent blue, white text — main CTA per screen
//   ghost      — transparent + glass border — secondary actions, "Cancel"
//   destructive— solid red, white text — delete / discard actions
//   glass      — atm-glass card style — toolbar buttons, mode pickers
//   link       — text-only with accent colour — inline navigation
//
// Sizes:
//   sm  — 6px×12px padding, 11px font
//   md  — 9px×18px padding, 13px font (default)
//   lg  — 12px×24px padding, 14px font

import { ButtonHTMLAttributes, CSSProperties, forwardRef, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'destructive' | 'glass' | 'link';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: Variant;
  size?: Size;
  /** Optional leading icon — string emoji or ReactNode */
  leading?: ReactNode;
  /** Stretches to fill parent width */
  block?: boolean;
}

const SIZE: Record<Size, { padding: string; fontSize: number }> = {
  sm: { padding: '6px 12px', fontSize: 11 },
  md: { padding: '9px 18px', fontSize: 13 },
  lg: { padding: '12px 24px', fontSize: 14 },
};

function variantStyle(variant: Variant): CSSProperties {
  switch (variant) {
    case 'primary':
      return {
        background: 'var(--accent)',
        border: '1px solid var(--accent)',
        color: '#fff',
      };
    case 'destructive':
      return {
        background: '#ef4444',
        border: '1px solid #ef4444',
        color: '#fff',
      };
    case 'ghost':
      return {
        background: 'transparent',
        border: '1px solid var(--atm-glass-border)',
        color: 'var(--t1)',
      };
    case 'glass':
      return {
        background: 'rgba(245, 237, 216, 0.04)',
        border: '1px solid var(--atm-glass-border)',
        color: 'var(--t1)',
        backdropFilter: 'blur(10px) saturate(1.2)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
      };
    case 'link':
      return {
        background: 'transparent',
        border: 'none',
        color: 'var(--accent)',
        padding: 0,
      };
  }
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leading, block, style, disabled, children, ...rest },
  ref,
) {
  const sz = SIZE[size];
  const vstyle = variantStyle(variant);
  return (
    <button
      ref={ref}
      disabled={disabled}
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 10,
        fontFamily: 'var(--font-inter)',
        fontWeight: 500,
        letterSpacing: '-0.005em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 150ms ease, transform 80ms ease, background 150ms ease, border-color 150ms ease',
        userSelect: 'none',
        ...sz,
        ...vstyle,
        ...(variant === 'link' ? {} : { padding: sz.padding }),
        width: block ? '100%' : undefined,
        opacity: disabled ? 0.45 : 1,
        ...style,
      }}
      onMouseDown={(e) => {
        if (!disabled) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)';
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
      }}
    >
      {leading && <span style={{ display: 'inline-flex', alignItems: 'center' }}>{leading}</span>}
      {children}
    </button>
  );
});
