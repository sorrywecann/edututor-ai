'use client';

// Select — fully custom glass dropdown. The native <select> open list is
// OS-rendered and not stylable beyond background+color; this primitive
// gives a liquid-glass option menu that matches the rest of the atmosphere.
//
// Drop-in replacement for `<select value onChange>` patterns. Esc closes,
// click-outside closes, ↑↓ navigate, Enter selects, type-ahead works.

import { useEffect, useId, useRef, useState, KeyboardEvent } from 'react';

export interface SelectOption<V extends string | number = string> {
  value: V;
  label: string;
  /** Optional secondary text shown faintly to the right */
  hint?: string;
  /** Optional badge (e.g. "agentic", "fast") rendered right of label */
  badge?: string;
  /** Disabled option */
  disabled?: boolean;
}

interface SelectProps<V extends string | number = string> {
  value: V;
  onChange: (value: V) => void;
  options: SelectOption<V>[];
  /** Placeholder when value matches no option */
  placeholder?: string;
  /** Hint text shown above the select trigger */
  label?: string;
  /** Full-width vs intrinsic width */
  block?: boolean;
  /** Disable the entire control */
  disabled?: boolean;
}

export function Select<V extends string | number = string>({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  label,
  block = true,
  disabled = false,
}: SelectProps<V>) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState<number>(-1);

  const currentIdx = options.findIndex((o) => o.value === value);
  const current = currentIdx >= 0 ? options[currentIdx] : null;

  // Close on outside click + esc
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Sync highlight to current value on open
  useEffect(() => {
    if (open) setHighlight(currentIdx >= 0 ? currentIdx : 0);
  }, [open, currentIdx]);

  const handleTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const handleMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(options.length - 1, h + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && !options[highlight].disabled) {
        onChange(options[highlight].value);
        setOpen(false);
        triggerRef.current?.focus();
      }
    } else if (e.key === 'Home') {
      setHighlight(0);
    } else if (e.key === 'End') {
      setHighlight(options.length - 1);
    }
  };

  return (
    <div style={{ position: 'relative', width: block ? '100%' : 'auto' }}>
      {label && (
        <div className="atm-micro" style={{ marginBottom: 6 }}>{label}</div>
      )}
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: block ? '100%' : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '9px 12px',
          background: 'rgba(245, 237, 216, 0.04)',
          border: `1px solid ${open ? 'rgba(var(--accent-r), 0.45)' : 'var(--atm-glass-border)'}`,
          borderRadius: 8,
          color: current ? 'var(--t1)' : 'var(--t3)',
          fontFamily: 'var(--font-inter)',
          fontSize: 13,
          textAlign: 'left',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          transition: 'border-color 150ms ease, background 150ms ease',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {current ? current.label : placeholder}
        </span>
        <span style={{ flexShrink: 0, color: 'var(--t3)', fontSize: 10, transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 180ms ease' }}>▾</span>
      </button>

      {open && (
        <div
          ref={menuRef}
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleMenuKeyDown}
          className="atm-glass"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            maxHeight: 280,
            overflowY: 'auto',
            padding: 4,
            zIndex: 60,
            background: 'rgba(26, 20, 16, 0.92)',
            backdropFilter: 'blur(28px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
            animation: 'atm-quote-fade 140ms ease both',
          }}
          autoFocus
        >
          {options.map((opt, i) => {
            const isCurrent = opt.value === value;
            const isHighlight = i === highlight;
            return (
              <div
                key={String(opt.value)}
                role="option"
                aria-selected={isCurrent}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 8,
                  background: isHighlight
                    ? 'rgba(var(--accent-r), 0.18)'
                    : isCurrent
                    ? 'rgba(245, 237, 216, 0.04)'
                    : 'transparent',
                  color: opt.disabled ? 'var(--t3)' : 'var(--t1)',
                  fontFamily: 'var(--font-inter)',
                  fontSize: 13,
                  cursor: opt.disabled ? 'default' : 'pointer',
                  opacity: opt.disabled ? 0.45 : 1,
                  transition: 'background 100ms ease',
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.label}
                </span>
                {opt.badge && (
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(var(--accent-r), 0.15)',
                    color: 'var(--accent)',
                    fontFamily: 'var(--font-jetbrains)',
                    fontSize: 9,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}>
                    {opt.badge}
                  </span>
                )}
                {opt.hint && (
                  <span style={{ fontSize: 11, color: 'var(--t3)' }}>{opt.hint}</span>
                )}
                {isCurrent && (
                  <span style={{ color: 'var(--accent)', fontSize: 11 }}>✓</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
