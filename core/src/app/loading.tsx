// v0.6.5: root loading state. Renders during route transitions so the user
// doesn't see a blank window. Minimal — just the amber orb pulse from splash
// so transitions feel continuous with the launch animation.

export default function Loading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--ch-bg, #0b0705)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: '50%',
          background:
            'radial-gradient(circle at 35% 30%, rgba(232,168,124,0.45), rgba(232,168,124,0.12) 60%, rgba(232,168,124,0) 75%)',
          animation: 'edu-loading-breathe 2.2s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes edu-loading-breathe {
          0%, 100% { transform: scale(0.96); opacity: 0.72; }
          50%      { transform: scale(1.04); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
