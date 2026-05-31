// Canonical Orb state. v0.7.3: consolidated from three duplicate
// definitions (OrbAvatar, useKnowledgePage, ChamberOrb) into one.
// 'loading' is union-only — most surfaces use 4 states (idle/listening/
// thinking/speaking) and treat 'loading' as 'thinking'.
export type OrbState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'loading';
