'use client';

// Orb — the canonical particle constellation that anchors every voice/avatar
// surface. v0.7.3 unification: replaces ChamberOrb + GradientOrb + OrbAvatar +
// WireframeOrb with one component aligned to the Atmosphere palette.
//
// ~N points distributed on a Fibonacci sphere, perspective-projected onto a
// canvas. Slow Y-axis rotation. Front-facing points tint warm; back-facing fade
// to nearly invisible. Behind the constellation: a soft amber radial halo
// (the orb's "soul"). The whole thing breathes; the breath rate + amplitude
// shift per state.
//
// States (see core/src/types/orb.ts):
//   idle       slow breath (~6.5s), gentle rotation, soft glow
//   listening  faster pulse, brighter, slight per-particle jitter
//   speaking   strong rhythmic expansion driven by `amplitude` (0..1)
//   thinking   slower rotation, slight inward contraction
//   loading    collapsing inward pulse
//
// When `amplitude` is 0 (the default), the orb reads live audio amplitude
// from the global analyser (audioAmplitude.ts) — speaking visuals work
// out of the box for any surface where audio is playing.

import { useEffect, useRef } from 'react';
import { getAudioAmplitude } from '@/lib/audioAmplitude';
import type { OrbState } from '@/types/orb';

interface OrbProps {
  /** Pixel size of the canvas (square). Default 280. */
  size?: number;
  state?: OrbState;
  /** Audio amplitude 0..1 used when state === 'speaking'. */
  amplitude?: number;
  /** Particle count. Default 1400 per the design spec; lower for small orbs. */
  particles?: number;
  /** When true, slightly enlarges the halo (for hero screens). */
  hero?: boolean;
  /** Click handler — wires the orb up as the conversation start/stop button. */
  onClick?: () => void;
}

interface Pt { x: number; y: number; z: number; jitter: number; }

export function Orb({
  size = 280,
  state = 'idle',
  amplitude = 0,
  particles = 1400,
  hero = false,
  onClick,
}: OrbProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Mutable runtime state so the rAF loop can read changing props without
  // restarting the animation (which would break the rotation continuity).
  const stateRef = useRef<OrbState>(state);
  const ampRef = useRef<number>(amplitude);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // ── Fibonacci sphere distribution ────────────────────────────────────────
    const pts: Pt[] = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < particles; i++) {
      const y = 1 - (i / Math.max(1, particles - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = phi * i;
      pts.push({
        x: Math.cos(theta) * r,
        y,
        z: Math.sin(theta) * r,
        jitter: (Math.random() - 0.5) * 2,
      });
    }
    const STRAY_COUNT = Math.max(4, Math.floor(particles * 0.012));
    const strays: Pt[] = [];
    for (let i = 0; i < STRAY_COUNT; i++) {
      const v = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - v * v);
      strays.push({
        x: Math.cos(t) * r,
        y: v,
        z: Math.sin(t) * r,
        jitter: 1.10 + Math.random() * 0.25,
      });
    }

    const cx = size / 2;
    const cy = size / 2;
    const baseR = size * (hero ? 0.34 : 0.30);

    let rotY = 0;
    let frame = 0;
    let raf = 0;
    let startTs = performance.now();
    let lastTs = startTs;

    function paramsFor(s: OrbState, amp: number) {
      switch (s) {
        case 'listening':
          return { breathRate: 1.45, breathAmp: 0.045, rotSpeed: 0.0035, particleAlpha: 0.95, haloAlpha: 1.10, jitterScale: 0.7, contraction: 0 };
        case 'speaking': {
          const aBoost = Math.max(0, Math.min(1, amp));
          return { breathRate: 1.6, breathAmp: 0.055 + aBoost * 0.090, rotSpeed: 0.0030, particleAlpha: 1.0, haloAlpha: 1.20 + aBoost * 0.4, jitterScale: 0.5 + aBoost * 0.6, contraction: 0 };
        }
        case 'thinking':
          return { breathRate: 0.55, breathAmp: 0.020, rotSpeed: 0.0015, particleAlpha: 0.78, haloAlpha: 0.78, jitterScale: 0.4, contraction: 0.04 };
        case 'loading':
          return { breathRate: 0.85, breathAmp: 0.030, rotSpeed: 0.0020, particleAlpha: 0.72, haloAlpha: 0.70, jitterScale: 0.3, contraction: 0.06 };
        case 'idle':
        default:
          return { breathRate: 0.45, breathAmp: 0.022, rotSpeed: 0.0025, particleAlpha: 0.85, haloAlpha: 0.90, jitterScale: 0.45, contraction: 0 };
      }
    }

    function draw(ts: number) {
      const dt = Math.min(64, ts - lastTs);
      lastTs = ts;
      frame++;
      const tSec = (ts - startTs) / 1000;

      const externalAmp = ampRef.current;
      const liveAmp = getAudioAmplitude();
      const effAmp = externalAmp > 0 ? externalAmp : liveAmp;
      const p = paramsFor(stateRef.current, effAmp);
      rotY += p.rotSpeed * (dt / 16.667);

      const breath = Math.sin(tSec * p.breathRate * Math.PI) * p.breathAmp;
      const r = baseR * (1 + breath - p.contraction);

      ctx.clearRect(0, 0, size, size);

      const soul = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.95);
      soul.addColorStop(0,    `rgba(244, 181, 138, ${0.22 * p.haloAlpha})`);
      soul.addColorStop(0.55, `rgba(232, 168, 124, ${0.10 * p.haloAlpha})`);
      soul.addColorStop(1,    'rgba(184, 122, 82, 0)');
      ctx.fillStyle = soul;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
      ctx.fill();

      const sinR = Math.sin(rotY);
      const cosR = Math.cos(rotY);
      const focal = size * 1.8;

      type Drawable = { sx: number; sy: number; depth: number; sz: number; size_: number; alpha: number; color: string };
      const drawables: Drawable[] = [];

      for (let i = 0; i < pts.length; i++) {
        const pt = pts[i];
        const rx = pt.x * cosR - pt.z * sinR;
        const rz = pt.x * sinR + pt.z * cosR;
        const ry = pt.y;
        const persp = focal / (focal + rz * r);
        const sx = cx + rx * r * persp;
        const sy = cy + ry * r * persp;
        const depth = (rz + 1) / 2;
        const jit = Math.sin(tSec * 1.6 + pt.jitter * 3.1) * 0.16 * p.jitterScale;
        const baseSize = (0.55 + depth * 1.45) * (1 + jit * 0.15);
        const alpha = (0.22 + depth * 0.65) * p.particleAlpha * (1 + jit * 0.08);
        const warmFront = depth > 0.72;
        const color = warmFront
          ? `rgba(248, 220, 184, ${alpha})`
          : `rgba(244, 237, 228, ${alpha})`;
        drawables.push({ sx, sy, depth, sz: rz, size_: baseSize, alpha, color });
      }

      for (let i = 0; i < strays.length; i++) {
        const pt = strays[i];
        const rx = pt.x * cosR - pt.z * sinR;
        const rz = pt.x * sinR + pt.z * cosR;
        const ry = pt.y;
        const persp = focal / (focal + rz * r);
        const sx = cx + rx * r * pt.jitter * persp;
        const sy = cy + ry * r * pt.jitter * persp;
        const depth = (rz + 1) / 2;
        const alpha = (0.15 + depth * 0.30) * p.particleAlpha;
        drawables.push({
          sx, sy, depth, sz: rz,
          size_: 0.4 + depth * 0.6,
          alpha,
          color: `rgba(244, 237, 228, ${alpha})`,
        });
      }

      drawables.sort((a, b) => a.sz - b.sz);

      for (const d of drawables) {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.sx, d.sy, d.size_, 0, Math.PI * 2);
        ctx.fill();
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, particles, hero]);

  return (
    <div style={{ position: 'relative', width: size, height: size, display: 'inline-block' }}>
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: `-${Math.round(size * 0.5)}px`,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle, ' +
            'rgba(232, 168, 124, 0.22) 0%, ' +
            'rgba(232, 168, 124, 0.10) 18%, ' +
            'rgba(232, 168, 124, 0.035) 34%, ' +
            'rgba(232, 168, 124, 0) 56%)',
          animation: 'chamber-orb-halo 6.5s ease-in-out infinite',
          willChange: 'transform, opacity',
        }}
      />
      <canvas
        ref={ref}
        aria-hidden
        onClick={onClick}
        style={{
          display: 'block',
          position: 'relative',
          zIndex: 1,
          cursor: onClick ? 'pointer' : 'default',
        }}
      />
    </div>
  );
}
