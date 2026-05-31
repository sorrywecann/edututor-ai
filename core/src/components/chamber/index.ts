// Chamber design system — public exports.
// Pure black + one amber + Geist/Instrument Serif + a particle-constellation
// orb at the centre of every important moment. See docs/design-spec.

// v0.7.3: ChamberOrb merged into the canonical Orb at @/components/voice/Orb.
// Backward-compat alias so existing imports `import { ChamberOrb } from
// '@/components/chamber'` keep working while call sites migrate.
export { Orb as ChamberOrb } from '@/components/voice/Orb';
export type { OrbState as ChamberOrbState } from '@/types/orb';

export {
  ChamberShell,
  ChamberEyebrow,
  ChamberHero,
  ChamberSub,
  ChamberPrimary,
  ChamberGhost,
  ChamberInput,
  ChamberChip,
  ChamberStepDots,
  ChamberCard,
  ChamberStepNav,
} from './primitives';
