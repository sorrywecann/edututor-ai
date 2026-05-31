'use client';

import { useState, useEffect } from 'react';

const STORAGE_KEY = 'edututor_onboarded';

const STEPS = [
  {
    title: 'Vitaj v EduTutore',
    body: 'Som tvoj AI vzdelávací asistent. Hovor po slovensky a ja ti pomôžem pochopiť akúkoľvek tému.',
    target: 'orb',
  },
  {
    title: 'Konverzácia',
    body: 'Klikni na guľu a začni hovoriť. AI ti odpovie v reálnom čase — automaticky počúva, keď dohovoríš. Jeden klik začne, ďalší ukončí.',
    target: 'orb',
  },
  {
    title: 'Databáza znalostí',
    body: 'Nahraj PDF, Word alebo TXT a rozprávaj sa s dokumentmi. Klikni na mikrofón — pýtaj sa hlasom a AI odpovie na základe tvojich materiálov.',
    target: 'kb-selector',
  },
  {
    title: 'Nastavenia',
    body: 'V bočnom paneli nájdeš nastavenie hardvéru, sprievodcu platformou a históriu konverzácií.',
    target: 'sidebar-settings',
  },
];

export function OnboardingTour() {
  const [step, setStep] = useState(-1);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      setTimeout(() => { setStep(0); setVisible(true); }, 800);
    }
  }, []);

  function next() {
    if (step >= STEPS.length - 1) {
      finish();
      return;
    }
    setStep(s => s + 1);
  }

  function finish() {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, 'true');
  }

  if (!visible || step < 0) return null;

  const current = STEPS[step];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'onb-fade-in 0.3s ease',
    }}>
      <div style={{
        width: 380, padding: '28px 28px 22px',
        background: 'rgba(26, 20, 16, 0.62)', border: '1px solid var(--atm-glass-border)',
        borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {STEPS.map((_, i) => (
              <span key={i} style={{
                width: i === step ? 18 : 6, height: 6, borderRadius: 3,
                background: i === step ? 'var(--accent)' : i < step ? '#22c55e' : 'var(--border-mid)',
                transition: 'all 0.25s ease',
              }} />
            ))}
          </div>
          <button
            onClick={finish}
            style={{
              background: 'transparent', border: 'none', color: 'var(--t3)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-jetbrains)',
              letterSpacing: '0.06em',
            }}
          >
            Preskočiť
          </button>
        </div>

        <div>
          <div style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 8 }}>
            Krok {step + 1} z {STEPS.length}
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            {current.title}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.7 }}>
            {current.body}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              style={{
                padding: '8px 16px', background: 'transparent',
                border: '1px solid var(--atm-glass-border)', borderRadius: 8,
                fontSize: 11.5, color: 'var(--t2)', cursor: 'pointer',
                fontFamily: 'var(--font-inter)',
              }}
            >
              Späť
            </button>
          )}
          <button
            onClick={next}
            style={{
              padding: '8px 20px', background: 'var(--accent)',
              border: '1px solid var(--accent)', borderRadius: 8,
              fontSize: 11.5, color: '#fff', cursor: 'pointer',
              fontFamily: 'var(--font-inter)', fontWeight: 500,
              transition: 'all 0.15s',
            }}
          >
            {step === STEPS.length - 1 ? 'Začať' : 'Ďalej'}
          </button>
        </div>
      </div>

      <style>{`@keyframes onb-fade-in { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}
