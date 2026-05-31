'use client';

// Atmosphere showcase — Phase-1 + Phase-3 design system preview.
// Visit /design-tokens to see every primitive in a single hero-style page.

import { useState } from 'react';
import {
  AtmosphereHeader,
  AtmosphereModal,
  DataTable,
  EmptyState,
  GlassCard,
  MetricCard,
  MicroLabel,
  PageHeader,
  QualitativeSlider,
  StatusPill,
  StepDots,
  UploadZone,
} from '@/components/atmosphere';

interface DemoRow { id: string; name: string; docs: number; status: 'ready' | 'pending'; }
const DEMO_ROWS: DemoRow[] = [
  { id: 'a', name: 'biology-grade-8.pdf', docs: 14, status: 'ready' },
  { id: 'b', name: 'history-notes.docx', docs: 7, status: 'ready' },
  { id: 'c', name: 'physics-lab.txt', docs: 3, status: 'pending' },
];

export default function DesignTokensShowcase() {
  const [step, setStep] = useState(2);
  const [formality, setFormality] = useState(2);
  const [humor, setHumor] = useState(3);
  const [directness, setDirectness] = useState(2);
  const [modalOpen, setModalOpen] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState<string[]>([]);
  const [verbosity, setVerbosity] = useState(2);

  return (
    <div
      className="atm-hero"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <AtmosphereHeader
        name="dizajnér"
        appName="EduTutor · design system"
        quotes={[
          { text: 'Dobrý dizajn je čo najmenej dizajnu.', attrib: 'Dieter Rams' },
          { text: 'Jednoduchosť je ten najvyšší stupeň prepracovanosti.', attrib: 'Leonardo da Vinci' },
          { text: 'Detaily nie sú detaily. Detaily robia dizajn.', attrib: 'Charles Eames' },
          { text: 'Design is intelligence made visible.', attrib: 'Alina Wheeler' },
        ]}
      />

      <main
        style={{
          flex: 1,
          padding: '40px 32px 56px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 32,
        }}
      >
        {/* === Card 1: Vibe (showcase the qualitative slider) === */}
        <GlassCard pad="lg" maxWidth={760}>
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 200px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--t1)',
                  marginBottom: 6,
                  letterSpacing: '-0.01em',
                }}
              >
                Nastav atmosféru.
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: 'var(--t2)',
                  lineHeight: 1.55,
                }}
              >
                Môžeš to kedykoľvek zmeniť. Lukáš sa prispôsobí.
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <MicroLabel>Daj svojmu asistentovi meno</MicroLabel>
              <input
                defaultValue="Lukáš"
                style={{
                  padding: '10px 12px',
                  background: 'rgba(245, 237, 216, 0.04)',
                  border: '1px solid var(--atm-glass-border)',
                  borderRadius: 8,
                  color: 'var(--t1)',
                  fontSize: 14,
                  outline: 'none',
                  fontFamily: 'var(--font-inter)',
                }}
              />

              <QualitativeSlider
                title="Formálnosť"
                labels={['Neformálne', 'Srdečné', 'Formálne']}
                value={formality}
                onChange={setFormality}
              />
              <QualitativeSlider
                title="Humor"
                labels={['Suchý', 'Vtipný', 'Hravý']}
                value={humor}
                onChange={setHumor}
              />
              <QualitativeSlider
                title="Priamosť"
                labels={['Jemne', 'Úprimne', 'Bez okolkov']}
                value={directness}
                onChange={setDirectness}
              />
              <QualitativeSlider
                title="Výrečnosť"
                labels={['Stručne', 'Vyvážene', 'Detailne']}
                value={verbosity}
                onChange={setVerbosity}
              />
            </div>
          </div>
        </GlassCard>

        {/* === Card 2: Pick chat model (showcase MicroLabel + StatusPill + GET KEY pattern) === */}
        <GlassCard pad="lg" maxWidth={760}>
          <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 200px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-inter)',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--t1)',
                  marginBottom: 6,
                  letterSpacing: '-0.01em',
                }}
              >
                Vyber model.
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--t2)', lineHeight: 1.55 }}>
                Poskytovateľ a model pre chat. Všetko uložené je šifrované
                lokálne.
              </div>
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ flex: 1 }}>
                  <MicroLabel
                    right={
                      <a
                        href="#"
                        style={{
                          fontFamily: 'var(--font-jetbrains)',
                          fontSize: 9,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                          color: 'var(--accent)',
                          textDecoration: 'none',
                        }}
                      >
                        Získať kľúč ↗
                      </a>
                    }
                  >
                    Poskytovateľ
                  </MicroLabel>
                  <select
                    defaultValue="openai"
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      background: 'rgba(245, 237, 216, 0.04)',
                      border: '1px solid var(--atm-glass-border)',
                      borderRadius: 8,
                      color: 'var(--t1)',
                      fontSize: 13,
                      fontFamily: 'var(--font-inter)',
                    }}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama (lokálne)</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <MicroLabel>Model</MicroLabel>
                  <div
                    style={{
                      padding: '9px 12px',
                      background: 'rgba(245, 237, 216, 0.04)',
                      border: '1px solid var(--atm-glass-border)',
                      borderRadius: 8,
                      color: 'var(--t1)',
                      fontSize: 13,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    GPT-4o mini
                    <StatusPill kind="info" dot={false}>agentic</StatusPill>
                    <StatusPill kind="ok" dot={false}>fast</StatusPill>
                  </div>
                </div>
              </div>

              <div>
                <MicroLabel>OpenAI API kľúč</MicroLabel>
                <input
                  type="password"
                  placeholder="sk-proj-..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'rgba(245, 237, 216, 0.04)',
                    border: '1px solid var(--atm-glass-border)',
                    borderRadius: 8,
                    color: 'var(--t1)',
                    fontSize: 13,
                    fontFamily: 'var(--font-jetbrains)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <StatusPill kind="ok">Overené</StatusPill>
                <StatusPill kind="warn">Potrebný kľúč</StatusPill>
                <StatusPill kind="info">Cloud</StatusPill>
                <StatusPill kind="idle">Nenakonfigurované</StatusPill>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* === Footer: StepDots + actions === */}
        <div
          style={{
            width: '100%',
            maxWidth: 760,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 4px',
          }}
        >
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            className="atm-micro"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ← Späť
          </button>
          <StepDots total={6} current={step} onJump={setStep} />
          <button
            onClick={() => setStep(Math.min(5, step + 1))}
            style={{
              padding: '8px 18px',
              background: 'rgba(245, 237, 216, 0.06)',
              border: '1px solid var(--atm-glass-border)',
              borderRadius: 8,
              color: 'var(--t1)',
              fontFamily: 'var(--font-inter)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Pokračovať →
          </button>
        </div>

        {/* ═══ Phase 3 — page primitives ═══ */}
        <div style={{ width: '100%', maxWidth: 1000, marginTop: 24, paddingTop: 24, borderTop: '1px solid var(--atm-glass-border)' }}>
          <PageHeader
            eyebrow="Phase 3 · page primitives"
            title="Foundation for content pages"
            description="Six new primitives that compose into any /knowledge, /history, /progress, /performance, /voice-lab page without per-page reinvention."
          />
        </div>

        {/* Metric cards row */}
        <div style={{ width: '100%', maxWidth: 1000, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <MetricCard label="Latency (p50)" value="843" unit="ms" delta={{ direction: 'down', label: '-12% wk' }} polarity="up-is-bad" />
          <MetricCard label="Chat turns" value="1 245" delta={{ direction: 'up', label: '+18% wk' }} />
          <MetricCard label="Avg session" value="6.4" unit="min" delta={{ direction: 'flat', label: 'stable' }} />
          <MetricCard label="Cards due" value="23" description="Pravdepodobne dnes večer" />
        </div>

        {/* DataTable */}
        <div style={{ width: '100%', maxWidth: 1000 }}>
          <MicroLabel>DataTable — KB list demo</MicroLabel>
          <DataTable<DemoRow>
            columns={[
              { key: 'name', label: 'Súbor', width: 'minmax(0, 2fr)' },
              { key: 'docs', label: 'Dokumenty', align: 'right', width: 120 },
              {
                key: 'status', label: 'Status', width: 140,
                render: (r) => <StatusPill kind={r.status === 'ready' ? 'ok' : 'warn'} dot>{r.status === 'ready' ? 'Indexované' : 'Spracúva sa'}</StatusPill>,
              },
            ]}
            rows={DEMO_ROWS}
            getRowId={(r) => r.id}
            onRowClick={(r) => alert(`Clicked ${r.name}`)}
          />
        </div>

        {/* UploadZone */}
        <div style={{ width: '100%', maxWidth: 1000 }}>
          <MicroLabel>UploadZone — KB upload demo</MicroLabel>
          <UploadZone
            accept=".pdf,.docx,.txt,.md"
            multiple
            label="Pretiahni súbory sem alebo klikni pre výber"
            description="PDF · Word · TXT · Markdown — max 10 MB / súbor"
            onFiles={(files) => setDroppedFiles(files.map((f) => f.name))}
          />
          {droppedFiles.length > 0 && (
            <div style={{ marginTop: 8, fontFamily: 'var(--font-jetbrains)', fontSize: 10, color: 'var(--t2)' }}>
              Got: {droppedFiles.join(', ')}
            </div>
          )}
        </div>

        {/* EmptyState */}
        <div style={{ width: '100%', maxWidth: 1000 }}>
          <MicroLabel>EmptyState — zero-data demo</MicroLabel>
          <GlassCard pad="sm" maxWidth="100%">
            <EmptyState
              icon="📭"
              title="Zatiaľ žiadne konverzácie"
              description="Tvoje minulé rozhovory sa zobrazia tu po prvej relácii."
              action={(
                <button onClick={() => alert('Start chat')} style={{ padding: '8px 18px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontFamily: 'var(--font-inter)', fontSize: 13, cursor: 'pointer' }}>
                  Začať prvý rozhovor
                </button>
              )}
              secondaryAction={(
                <button style={{ padding: '8px 18px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: 8, color: 'var(--t2)', fontFamily: 'var(--font-inter)', fontSize: 13, cursor: 'pointer' }}>
                  Pozri si návod
                </button>
              )}
            />
          </GlassCard>
        </div>

        {/* AtmosphereModal */}
        <div style={{ width: '100%', maxWidth: 1000, display: 'flex', justifyContent: 'flex-start' }}>
          <button
            onClick={() => setModalOpen(true)}
            style={{ padding: '9px 18px', background: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 8, color: '#fff', fontFamily: 'var(--font-inter)', fontSize: 13, cursor: 'pointer' }}
          >
            Otvoriť AtmosphereModal
          </button>
          <AtmosphereModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Naozaj odstrániť konverzáciu?"
            actions={(
              <>
                <button onClick={() => setModalOpen(false)} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid var(--atm-glass-border)', borderRadius: 8, color: 'var(--t2)', fontFamily: 'var(--font-inter)', fontSize: 12, cursor: 'pointer' }}>
                  Zrušiť
                </button>
                <button onClick={() => setModalOpen(false)} style={{ padding: '8px 16px', background: '#ef4444', border: '1px solid #ef4444', borderRadius: 8, color: '#fff', fontFamily: 'var(--font-inter)', fontSize: 12, cursor: 'pointer' }}>
                  Odstrániť
                </button>
              </>
            )}
          >
            <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)', lineHeight: 1.55 }}>
              Konverzácia sa natrvalo odstráni z histórie. Túto akciu nie je možné vrátiť späť.
            </p>
          </AtmosphereModal>
        </div>
      </main>
    </div>
  );
}
