'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket, MessageSquare, Library, Cpu, Server, Mic,
  TrendingUp, Activity, Bot, Lightbulb, SlidersHorizontal,
  Sparkles, PlusCircle, Mic2, Terminal, Download,
  X, ChevronLeft, ChevronRight, type LucideIcon,
} from 'lucide-react';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

interface GuideSection {
  tag: string;
  title: string;
  lead: string;
  icon: LucideIcon;
  body: string[];
}

const SECTIONS: GuideSection[] = [
  {
    tag: '01', title: 'Začíname', icon: Rocket,
    lead: 'Spusti svoju prvú konverzáciu za pár sekúnd.',
    body: [
      'Otvor Konverzáciu z bočného panela — je to hlavná stránka platformy.',
      'Vyber si Databázu znalostí (ak je dostupná) — AI bude odpovedať na základe týchto dokumentov.',
      'Stlač guľu/avatara v strede obrazovky a začni hovoriť po slovensky.',
      'Stlač znova na ukončenie konverzácie — všetko sa uloží automaticky.',
    ],
  },
  {
    tag: '02', title: 'Konverzácia', icon: MessageSquare,
    lead: 'Hovor po slovensky — avatar počúva a odpovedá v reálnom čase.',
    body: [
      'Avatar funguje ako mikrofón. Jedným kliknutím začneš, ďalším ukončíš. Nič netreba držať.',
      'Kým hovoríš, avatar počúva. Kým AI odpovedá, synchronizuje pohyb pier (lipsync) v reálnom čase.',
      'Tvoja reč → text → odpoveď AI → zvuk + animácia avatara. Celý proces trvá ~1–3 sekundy.',
      'AI prispôsobuje tón — povzbudzuje, keď zápasíš, je hrdý, keď zvládneš ťažkú otázku.',
      'Konverzáciu okamžite ukončíš klávesou Esc.',
    ],
  },
  {
    tag: '03', title: 'Databáza znalostí (RAG)', icon: Library,
    lead: 'Nahraj dokumenty a AI odpovedá na ich základe.',
    body: [
      'Nahraj PDF, Word alebo .txt cez stránku „Databáza znalostí“.',
      'Pretiahni súbory do okna alebo ich vyber — spracovanie trvá niekoľko sekúnd.',
      'Chat: napíš otázku alebo použi hlas — AI odpovie na základe tvojich dokumentov.',
      'Štúdio: jedným klikom vygeneruješ zhrnutie, kľúčové body, kartičky, kvíz či podcast.',
      'AI automaticky vyberá najrelevantnejšie úryvky a používa ich ako kontext.',
      'Bez databázy AI odpovedá zo všeobecných znalostí — databáza je bonus pre špecifické témy.',
    ],
  },
  {
    tag: '04', title: 'Hardvérové nastavenie', icon: Cpu,
    lead: 'Detekcia hardvéru + jedno kliknutie na optimálnu konfiguráciu.',
    body: [
      'V bočnom paneli otvor Systém → Nastavenia.',
      '„Prehľad“ — detegovaný hardvér (RAM, CPU, GPU) a odporúčaná konfigurácia.',
      '„Detaily“ — parametre vybraných providerov pre tvoj profil.',
      '„Inštalácia“ — terminálové príkazy na doinštalovanie (Ollama, modely).',
      'Tlačidlo „Použiť“ prepne celú konfiguráciu (STT + LLM + TTS) na optimum pre tvoj hardvér.',
    ],
  },
  {
    tag: '05', title: 'Providery a lokálne modely', icon: Server,
    lead: 'Lokálne (Ollama), cloud aj vlastné LLM endpointy.',
    body: [
      'V Nastaveniach otvor záložku „Providery“.',
      'Zelená LOCAL = Ollama (offline, zadarmo), fialová CLOUD = OpenAI/Anthropic, modrá CUSTOM = tvoje.',
      'Pri každom modeli je „Použiť“ — okamžite prepne aktívny LLM bez reštartu.',
      '„+ Pridať vlastný LLM provider“ — 14 šablón (OpenRouter, Groq, Mistral, Gemini…).',
      'Vyber šablónu → URL a model sa vyplnia → doplň API kľúč → Uložiť a aktivovať.',
    ],
  },
  {
    tag: '06', title: 'Nastavenia hlasu', icon: Mic,
    lead: 'Vyber si hlas, STT a LLM priamo v konverzácii.',
    body: [
      'V konverzácii klikni na chip hlasu vľavo dole na rýchlu zmenu hlasu, databázy, STT a LLM.',
      'TTS hlasy: Lukáš/Viktória (Edge — zadarmo), Azure (presný lipsync + emócie), Piper (offline), OpenAI, Google.',
      'Azure dáva presnejší lipsync (±5 ms) a SSML emócie; Edge je zadarmo (±25 ms, lipsync stále funguje).',
      'STT: faster-whisper (CPU), mlx-whisper (Apple Silicon), Groq Whisper (cloud, ~0,1 s).',
      'Vlastný hlas si vytvoríš v Hlasovom štúdiu (klonovanie hlasu).',
    ],
  },
  {
    tag: '07', title: 'História a Pokrok', icon: TrendingUp,
    lead: 'Každá relácia uložená — sleduj pokrok a sériu.',
    body: [
      'História: každá konverzácia v bočnom paneli, najnovšie hore. Klik zobrazí celý prepis.',
      'Tlačidlo „+“ začne čistú novú konverzáciu (zmaže kontext predchádzajúcej).',
      'Stránka „Pokrok“ — počet konverzácií, počet výmen a denná séria.',
      'Dátum poslednej konverzácie ukazuje, kedy si bol naposledy aktívny.',
    ],
  },
  {
    tag: '08', title: 'Indikátor stavu', icon: Activity,
    lead: 'Živý stav modelov a pripojenia.',
    body: [
      'V bočnom paneli vidíš živý stav: aktívny LLM, STT a TTS provider.',
      'Zelená bodka = systém online, červená = backend offline.',
      'Hodnoty sa obnovujú každých 5 sekúnd a odzrkadľujú reálny stav.',
      'Po prepnutí providera sa zmena okamžite zobrazí aj tu.',
    ],
  },
  {
    tag: '09', title: 'Avatar a lipsync', icon: Bot,
    lead: 'MetaHuman avatar s lipsyncom a 9 emóciami.',
    body: [
      'Avatar (MetaHuman v Unreal Engine 5) sa pripája cez WebSocket k backendu.',
      'Backend posiela 9 emócií: neutral, joy, proud, encouraging, sadness, patient, curious, thinking, surprise.',
      'Visemes (14 slovenských tvarov úst) sa generujú z odpovedí v reálnom čase.',
      'Funguje s každým TTS providerom — Azure pridáva presnejšie časovanie.',
    ],
  },
  {
    tag: '10', title: 'Persona — osobnosť & prompt', icon: SlidersHorizontal,
    lead: 'Uprav, ako tutor znie — a edituj jeho systémový prompt.',
    body: [
      'Nastavenia → záložka „Persona“ — osobnosť aj prompt zmeníš kedykoľvek, nielen v onboardingu.',
      'Osobnosť: meno asistenta + slidery Formálnosť, Humor, Priamosť, Výrečnosť. Mení sa hneď a premietne sa do ⟨PERSONALITY⟩ bloku promptu.',
      'Systémový prompt: vyber režim, uprav „mozog“ tutora v editore a klikni Uložiť.',
      'Úpravy sa ukladajú ako override — originálny prompt zostáva nedotknutý; „Obnoviť pôvodný“ ho kedykoľvek vráti.',
      'Celý poskladaný prompt (master + personality + pamäť) si pozrieš v Pipeline / Prompt Inspectore.',
    ],
  },
  {
    tag: '11', title: 'Tipy a skratky', icon: Lightbulb,
    lead: 'Pre najlepší zážitok.',
    body: [
      'Esc — okamžite ukončí konverzáciu alebo zavrie okná.',
      'Tlačidlo „+“ — nová konverzácia s čistým kontextom.',
      'Úplne offline: lokálny Ollama + Piper TTS (internet netreba).',
      'Najvyššia kvalita: cloud LLM (OpenAI/Anthropic) + Azure TTS.',
      'Výkonný hardvér (RTX): lokálny Ollama gemma3:12b — ~1 s a beží offline.',
      'Esc zavrie aj Hardvérové nastavenia a Sprievodcu — nie len konverzáciu.',
    ],
  },
  {
    tag: '12', title: 'Voľba modelu', icon: Sparkles,
    lead: 'Lokálny alebo cloud — vyber raz, zmeň kedykoľvek.',
    body: [
      'Pri prvom spustení ti EduTutor pomôže vybrať LLM model.',
      'Vyber Lokálny (Ollama — Gemma 3, Llama, Qwen, Mistral) alebo Cloud (OpenAI, Anthropic, Groq, DeepSeek).',
      'Lokálny model beží offline a je zadarmo. Cloud potrebuje API kľúč.',
      'Voľbu zmeníš kedykoľvek v Nastaveniach → Hardvér.',
      'Onboarding sa zobrazí len raz; znovu ho otvoríš cez Nastavenia → „Spustiť úvod znova".',
    ],
  },
  {
    tag: '13', title: 'Nová konverzácia po reštarte', icon: PlusCircle,
    lead: 'Čistý štart pri každom spustení.',
    body: [
      'Pri každom novom spustení aplikácie sa otvorí čistá konverzácia.',
      'Predchádzajúce relácie nájdeš v Histórii v bočnom paneli.',
      'Klávesa „Nová" alebo „+" ti kedykoľvek vyresetuje kontext.',
      'Konverzácia sa autoukladá po každej výmene.',
      'F5 zachová aktuálnu konverzáciu; až zatvorenie okna ju ukončí.',
    ],
  },
  {
    tag: '14', title: 'TTS a STT — providery hlasu', icon: Mic2,
    lead: 'Vyber si, kto hovorí a kto počúva.',
    body: [
      'EduTutor podporuje viacero hlasových providerov.',
      'TTS (čítanie odpovedí): Edge TTS (zadarmo), Piper (offline), OmniVoice, ElevenLabs.',
      'STT (rozpoznávanie reči): faster-whisper (lokálne), Groq Whisper (cloud, rýchle).',
      'Každý sa vyberá samostatne v Nastaveniach → Hlas / Počúvanie.',
      'Aktívny provider vidíš v indikátore stavu vľavo dole.',
    ],
  },
  {
    tag: '15', title: 'Systémový prompt', icon: Terminal,
    lead: 'Uprav „mozog" tutora — pôvodný zostáva v zálohe.',
    body: [
      'V Nastaveniach → Mozog upravíš „mozog" tutora pre vybraný režim.',
      'Originál ostane vždy zachovaný — vrátiš ho tlačidlom „↺ Obnoviť pôvodný".',
      'Zmeny ukladá ako override — pôvodný prompt sa nezmaže.',
      'Persona (formálnosť, humor, priamosť, výrečnosť) sa nastaví samostatne v Persona záložke.',
      'Master prompt funguje so všetkými LLM providermi.',
    ],
  },
  {
    tag: '16', title: 'Inštalácia a desktop ikona', icon: Download,
    lead: 'Wizard ťa prevedie — odškrtni, čo nechceš.',
    body: [
      'Inštalačný wizard ťa prevedie krokmi: cesta, ikonky, jazyk.',
      '„Vytvoriť ikonu na ploche" je predvolene zapnuté — odškrtni, ak nechceš.',
      'Spustenie z plochy, Štartu alebo priamo zo zložky funguje rovnako.',
      'Backend (Python + Ollama + Wilbur) sa pripraví pri prvom štarte.',
      'Na odinštalovanie použi Štart → Aplikácie a funkcie → EduTutor.AI.',
    ],
  },
];

export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  const [active, setActive] = useState(0);

  const go = useCallback(
    (dir: number) => setActive((a) => Math.max(0, Math.min(SECTIONS.length - 1, a + dir))),
    [],
  );

  useEffect(() => { if (open) setActive(0); }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, go]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const section = SECTIONS[active];
  const Icon = section.icon;

  return (
    <div
      className="atm-hero"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 320,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'min(4vh, 40px) min(4vw, 48px)',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
        animation: 'atm-quote-fade 200ms ease both',
      }}
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.97, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
        style={{
          width: 'min(1080px, 100%)', height: 'min(680px, 100%)',
          display: 'flex', flexDirection: 'column',
          background: 'rgba(26, 20, 16, 0.82)',
          border: '1px solid var(--atm-glass-border)',
          borderRadius: 20, overflow: 'hidden',
          backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
          boxShadow: '0 32px 90px -24px rgba(0,0,0,0.75)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: '1px solid var(--atm-glass-border)', flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-inter)', fontSize: 15, fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em' }}>
              Sprievodca platformou
            </div>
            <div className="atm-micro" style={{ color: 'var(--t3)', marginTop: 3 }}>
              EduTutor · {SECTIONS.length} kapitol · ↑↓ na prepínanie
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Zavrieť"
            style={{
              width: 30, height: 30, borderRadius: 9,
              borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)',
              background: 'transparent', color: 'var(--t3)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-mid)'; e.currentTarget.style.color = 'var(--t1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)'; }}
          >
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        {/* Body — nav rail + content stage */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {/* Nav rail */}
          <nav style={{
            width: 270, flexShrink: 0, borderRight: '1px solid var(--atm-glass-border)',
            overflowY: 'auto', padding: '10px 10px 16px',
            background: 'rgba(245, 237, 216, 0.015)',
          }}>
            {SECTIONS.map((s, i) => {
              const NavIcon = s.icon;
              const isActive = i === active;
              return (
                <button
                  key={s.tag}
                  onClick={() => setActive(i)}
                  style={{
                    position: 'relative', width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', marginBottom: 2, borderRadius: 11, border: 'none', cursor: 'pointer',
                    textAlign: 'left', background: isActive ? 'var(--accent-soft)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--subtle)'; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {isActive && <span style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, borderRadius: 3, background: 'var(--accent)' }} />}
                  <span style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? 'rgba(var(--accent-r),0.18)' : 'var(--surface)',
                    color: isActive ? 'var(--accent)' : 'var(--t2)',
                    border: `1px solid ${isActive ? 'rgba(var(--accent-r),0.3)' : 'var(--atm-glass-border)'}`,
                    transition: 'all 0.15s',
                  }}>
                    <NavIcon size={16} strokeWidth={1.9} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--t1)' : 'var(--t2)', letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.title}
                    </span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-jetbrains)', fontSize: 9, color: isActive ? 'var(--accent)' : 'var(--t3)', flexShrink: 0 }}>
                    {s.tag}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Content stage */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '32px 40px 36px' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
              >
                <div style={{
                  width: 60, height: 60, borderRadius: 16, marginBottom: 20,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(var(--accent-r),0.14)', border: '1px solid rgba(var(--accent-r),0.28)',
                  color: 'var(--accent)',
                }}>
                  <Icon size={28} strokeWidth={1.8} />
                </div>

                <div className="atm-micro" style={{ color: 'var(--atm-dot-active)', marginBottom: 8 }}>
                  Kapitola {section.tag}
                </div>
                <h2 style={{ fontFamily: 'var(--font-inter)', fontSize: 26, fontWeight: 600, color: 'var(--t1)', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.15 }}>
                  {section.title}
                </h2>
                <p style={{ fontSize: 14.5, color: 'var(--t2)', lineHeight: 1.55, margin: '10px 0 26px', maxWidth: 560 }}>
                  {section.lead}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {section.body.map((line, j) => (
                    <motion.div
                      key={j}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: 0.04 + j * 0.05, ease: 'easeOut' }}
                      style={{
                        display: 'flex', gap: 14, alignItems: 'flex-start',
                        padding: '12px 15px', borderRadius: 11,
                        background: 'rgba(245, 237, 216, 0.03)', border: '1px solid var(--atm-glass-border)',
                      }}
                    >
                      <span style={{
                        flexShrink: 0, width: 22, height: 22, borderRadius: 7, marginTop: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(var(--accent-r),0.12)', color: 'var(--accent)',
                        fontFamily: 'var(--font-jetbrains)', fontSize: 10, fontWeight: 600,
                      }}>
                        {j + 1}
                      </span>
                      <span style={{ fontSize: 13.5, color: 'var(--t2)', lineHeight: 1.6, letterSpacing: '-0.005em' }}>
                        {line}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Footer — prev/next + step dots */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 22px', borderTop: '1px solid var(--atm-glass-border)', flexShrink: 0,
        }}>
          <button
            onClick={() => go(-1)}
            disabled={active === 0}
            style={{ ...navBtn, opacity: active === 0 ? 0.35 : 1, cursor: active === 0 ? 'default' : 'pointer' }}
          >
            <ChevronLeft size={14} strokeWidth={2} /> Späť
          </button>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {SECTIONS.map((_, i) => (
              <button
                key={i}
                onClick={() => setActive(i)}
                aria-label={`Kapitola ${i + 1}`}
                style={{
                  width: i === active ? 22 : 7, height: 7, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer',
                  background: i === active ? 'var(--accent)' : 'var(--border-mid)',
                  transition: 'all 0.2s ease',
                }}
              />
            ))}
          </div>

          {active === SECTIONS.length - 1 ? (
            <button onClick={onClose} style={{ ...navBtn, background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
              Hotovo
            </button>
          ) : (
            <button onClick={() => go(1)} style={navBtn}>
              Ďalej <ChevronRight size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '8px 16px', borderRadius: 9,
  background: 'var(--raised)',
  borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-mid)',
  color: 'var(--t1)', fontSize: 12.5, fontWeight: 500, fontFamily: 'var(--font-inter)',
  cursor: 'pointer', transition: 'all 0.15s',
};
