'use client';

// ModelRow — extracted byte-identical row primitive used by InstallTab.

export function ModelRow({ name, size, status }: { name: string; size?: string; status: 'installed' | 'available' }) {
  const installed = status === 'installed';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0',
      borderBottom: '1px solid var(--ch-line, rgba(244,237,228,0.06))',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%',
          background: installed ? 'var(--ch-ok, #7ea88a)' : 'var(--ch-ink-faint, #5a5048)',
          boxShadow: installed ? '0 0 8px rgba(126,168,138,0.5)' : 'none',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 13, color: 'var(--ch-ink, #f4ede4)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {name}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {size && (
          <span style={{
            fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
            fontSize: 11, color: 'var(--ch-ink-dim, #9a8f82)',
            letterSpacing: '0.04em',
          }}>{size}</span>
        )}
        <span style={{
          fontFamily: 'var(--font-geist-mono), ui-monospace, monospace',
          fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: installed ? 'var(--ch-amber, #E8A87C)' : 'var(--ch-ink-dim, #9a8f82)',
          fontWeight: installed ? 500 : 400,
        }}>
          {installed ? 'Nainštalované' : 'Nenainštalované'}
        </span>
      </div>
    </div>
  );
}
