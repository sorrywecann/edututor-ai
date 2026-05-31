# Lipsync technológie — evaluácia a výber

**Projekt:** EduTutor.AI · Grant `09I05-03-V04-00072`
**Výstup:** č. 3 · §7.1 (Integrácia a validácia lipsync technológie)
**Verzia:** 1.0
**Dátum:** Máj 2026
**Spoločnosť:** SORRYWECAN s.r.o.

---

## 1. Kontext

EduTutor.AI je slovenský AI tutor s 3D MetaHuman avatarom. Lipsync — synchronizácia pohybu úst avatara s generovanou rečou — je centrálna časť produktu. Ak avatar pôsobí dôveryhodne, žiak ho akceptuje. Ak nepôsobí, celý produkt stráca kredibilitu bez ohľadu na kvalitu LLM odpovedí.

Pre Výstup 3 sme vyhodnotili tri zavedené externé lipsync technológie (Convai, Oculus LipSync, NeuroSync) a porovnali ich s vlastnou in-house implementáciou. Tento dokument zhŕňa, čo o každej alternatíve vieme z verejnej dokumentácie a vlastného code review, prečo sme zvolili in-house riešenie, a aký rigorous validačný protokol je pripravený na spustenie pre porovnanie perceptuálnej kvality (zatiaľ nevykonané).

---

## 2. Kritériá výberu

Kritériá boli odvodené priamo z grantových obmedzení a školského use-case:

| # | Kritérium | Prečo |
|---|-----------|--------|
| 1 | Natívna podpora slovenských fonémov | Pre slovenský produkt je kvalita SK lipsyncu central |
| 2 | Latencia < 100 ms end-to-end | Real-time avatar; nad 100 ms už pôsobí desync |
| 3 | Open-source / MIT-kompatibilná licencia | Grantová obligácia (Výstup 3, časť C) |
| 4 | Možnosť offline / on-premise nasadenia | Niektoré školy nemajú reliable internet; GDPR pre žiacke dáta |
| 5 | Vendor self-sufficiency (žiadny lock-in) | Zabezpečenie kontinuity v 5-10 ročnom horizonte |
| 6 | Native MetaHuman 52-channel ARKit output | MetaHuman je default rig avatara |
| 7 | Graceful fallback pri zlyhaní primárnej cesty | Resilience pri výpadku TTS providera alebo siete |

Kritériá 1, 3, 4, 5, 7 sú **objektívne overiteľné** z verejnej dokumentácie a license textov.
Kritériá 2 a 6 sú **dokumentovaným záväzkom** od vendora (overiteľné cez špecifikácie + benchmarks).

Iné aspekty — **perceptuálna prirodzenosť animácie pri slovenskej reči** — sa NEdajú overiť bez kontrolovaného testu s nezávislými ratermi. Pre to existuje navrhnutý protokol v §8.

---

## 3. Convai

**Čo je:** Convai (Convai Technologies Inc.) je etablovaná komerčná platforma pre AI postavy s integrovaným lipsync. SaaS API + pluginy pre Unreal Engine 5 a Unity. Používaná v stovkách komerčných projektov vrátane VR hier, kioskov a virtuálnych asistentov.

### Silné stránky

- **Production-grade integrácia** s MetaHuman cez oficiálny UE plugin
- **Multilingválny TTS** (vrátane slovenčiny v zozname podporovaných jazykov)
- **Stabilný team a kontinuálna podpora** — Convai aktívne maintainuje plugin
- **Real-time pipeline** s dokumentovanou latenciou pre cloud setup
- **Bohatá feature sada** — okrem lipsyncu aj character behavior, emotion modeling, conversation memory v rámci ich platformy

### Slabšie stránky pre náš use-case

- **Cloud-only architektúra** — vyžaduje stabilné internetové pripojenie a posielanie audio dát na ich servery (problém pre školy bez reliable internetu a pre GDPR/data residency)
- **Komerčná licencia** — pricing per minute audio + per-character usage; nekompatibilné s grantovou obligáciou open-source release
- **Vendor lock-in** — ich pipeline je proprietary; ak Convai zmení pricing alebo skončí, treba rebuild
- **Kvalita SK fonémov v lipsync** — Convai podporuje slovenčinu v TTS, ale ich lipsync model je trained primárne na anglických dátach; účinok na SK fonémy ako `ť`, `ď`, `ň`, diphthongy `ia/ie/iu/uo` **vyžaduje testovanie** (vidíme len ich marketing claims, nie nezávislé MOS výsledky)

### Stav voči kritériám

| # | Kritérium | Convai stav |
|---|-----------|-------------|
| 1 | Natívna SK podpora | ⚠️ Čiastočná (TTS áno, lipsync model EN-centric) |
| 2 | Latencia <100ms | ❌ Cloud ~150-300ms typicky |
| 3 | MIT-kompatibilná licencia | ❌ Komerčná SaaS |
| 4 | Offline / on-premise | ❌ Nie |
| 5 | Vendor self-sufficiency | ❌ Vysoký lock-in |
| 6 | MetaHuman 52-ch ARKit | ✅ Áno (cez plugin) |
| 7 | Graceful fallback | ❌ Nedokumentované |

Convai by bol vhodný pre komerčný produkt s dobrým budgetom a internetovou infraštruktúrou. Pre slovenský grantový open-source projekt s on-premise školským deploymentom **nespĺňa základné architektonické constraints**.

---

## 4. Oculus LipSync (Meta)

**Čo je:** Open-source SDK od Oculus (Meta) pre real-time lipsync v VR aplikáciách. Originally pre Oculus Quest avatarov, ale použiteľné aj mimo VR. Trained na anglickej reči, 15 visemes (subset Disney/Preston Blair štandardu).

### Silné stránky

- **Bezplatné** (Meta SDK licence, free tier)
- **On-device** — žiadny network call, žiadny vendor lock-in pri behu
- **Vynikajúca latencia** (<50ms typically — best in class)
- **Maturita** — používané vo VR industry roky, well-tested codepath
- **Real-time CPU efficient** — bežia priamo na klientskom zariadení

### Slabšie stránky pre náš use-case

- **Trained iba na angličtine** — model rozumie EN fonetickej distribúcii; slovenské fonémy mimo EN inventáru (palatalizované `ť/ď/ň`, slovenské diphthongs) **nemajú garantované mapovanie**. Mohlo by ísť, ale **nevieme**, a Meta nevydáva oficiálny SK support
- **15 viseme set** — menej granulárny ako 14 SK + 52 ARKit mapping ktorý sme implementovali. Vyžaduje custom adapter pre MetaHuman
- **Proprietary licence** — Oculus SDK má vlastný licence text (free, ale nie MIT/Apache; nie jednoznačné, či open-source publish nášho stacku s linkom na túto knižnicu je v poriadku)
- **Budúcnosť SDK** — Meta Reality Labs reorganizácia v 2024 zanechala otázniky nad dlhodobou údržbou Oculus SDK-ov
- **MetaHuman integration** — vyžaduje custom rig adapter z 15 visemes na 52 ARKit kanálov; existujú komunitné riešenia, ale nie oficiálne

### Stav voči kritériám

| # | Kritérium | Oculus stav |
|---|-----------|-------------|
| 1 | Natívna SK podpora | ❌ Nie (EN-only training) |
| 2 | Latencia <100ms | ✅ <50ms typicky |
| 3 | MIT-kompatibilná licencia | ❌ Meta SDK proprietary |
| 4 | Offline / on-premise | ✅ Áno (on-device) |
| 5 | Vendor self-sufficiency | ⚠️ Stredný (Meta EOL risk) |
| 6 | MetaHuman 52-ch ARKit | ❌ Iba 15 visemes (potreba custom adapter) |
| 7 | Graceful fallback | ❌ Žiadny dokumentovaný |

Oculus LipSync je technicky najvyspelejšia z týchto troch alternatív (latencia, maturita, free), ale **trénovacie dáta sú EN-only** a **licence nie je open-source kompatibilná**. Pre slovenský open-source projekt nie je správne riešenie, aj keď samotná technika je excellent.

---

## 5. NeuroSync

**Čo je:** Modernejší startup (založený 2022-2023) s SaaS platformou pre AI-driven facial animation. Audio → 52-channel ARKit blendshapes priamo. Targetuje primárne MetaHuman a podobné rig systémy.

### Silné stránky

- **Native ARKit 52-channel output** — najlepšia integrácia s MetaHuman zo všetkých troch alternatív
- **Modern audio-driven approach** — používa transformer-based model namiesto klasického viseme mappingu
- **Aktívne maintainovaný** — startup s recent funding, časté updaty
- **Reasonable cloud latency** (~150-200ms)

### Slabšie stránky pre náš use-case

- **SaaS subscription model** — pricing per minute audio + per-user; nákladné pre školské nasadenie v škále
- **Cloud-only** — rovnaký GDPR/internet problém ako Convai
- **Komerčná licencia** — nekompatibilné s open-source releaserom
- **Mladá firma** — vyšší existenciálny risk (startup, mohli by skončiť alebo byť acquired)
- **Slovak training data** — neznámy stav; model je trained primárne na anglickom datasete, slovenské fonémy **vyžadujú testovanie**

### Stav voči kritériám

| # | Kritérium | NeuroSync stav |
|---|-----------|----------------|
| 1 | Natívna SK podpora | ❌ Nie (EN-trained) |
| 2 | Latencia <100ms | ⚠️ Cloud ~150-200ms |
| 3 | MIT-kompatibilná licencia | ❌ SaaS |
| 4 | Offline / on-premise | ❌ Nie |
| 5 | Vendor self-sufficiency | ❌ Vysoký lock-in + startup risk |
| 6 | MetaHuman 52-ch ARKit | ✅ Native |
| 7 | Graceful fallback | ❌ Nedokumentované |

NeuroSync má najlepšiu MetaHuman integráciu z týchto troch, ale rovnaké SaaS/cloud/licence obmedzenia ako Convai. Z hľadiska technickej kvality výstupu pre angličtinu by mohol byť excellent — pre slovenčinu **opäť nevieme bez testu**.

---

## 6. EduTutor in-house lipsync

**Čo je:** Vlastná implementácia v `tutor-service/app/services/viseme_timeline.py` + `audio2lipsync/` modul. Tri-úrovňová stratégia s graceful fallback, slovensky špecifické fonetické pravidlá, native 52-channel ARKit output.

### Architektonické rozhodnutia

**Trojstupňová stratégia podľa dostupnosti TTS metadata:**

```
Tier 1 — Azure phoneme timestamps (±5 ms)
       → from_azure_phonemes() → priame phoneme-to-viseme mapping

Tier 2 — Edge TTS WordBoundary events (±50 ms)
       → word-anchored viseme generation + slovak grapheme rules

Tier 3 — Žiadne TTS metadata
       → from_text() pure slovak grapheme analysis (±25 ms)

Vo všetkých troch tieroch:
  → Slovak phonetic rules (devoicing, palatalization, diphthongs)
  → Coarticulation blend + trailing silence pad
  → 14 SK visemes → 52 ARKit channels
  → 9 emotion presets aditívne overlay
  → AvatarCommand JSON broadcast cez WebSocket
```

### Slovenská fonetická logika

V `viseme_timeline.py:523-584` implementované:

- **Devoicing** — znelá spoluhláska pred neznelou (napr. `v` v `vs`) získava redukovanú weight (0.7 → 0.56)
- **Palatalizácia** — `t/d/n` pred `e/i/í` mapuje na `ť/ď/ň` ekvivalent (DD viseme + weight bump pre vizuálnu plnosť)
- **Diphthongy** — `ia/ie/iu/uo` produkujú dva contiguous visemes namiesto single (40 ms + 50 ms timing)
- **Slabikotvorné konsonanty** — `vlk`, `prst` rozpoznávané ako vowel-like
- **Affrikáty** — `c`, `dz` ako dvojfrámové sekvencie (stop + fricative)

### Silné stránky

- **Open-source MIT** — kompatibilné s grantovou obligáciou
- **Offline-capable** — Tier 3 nepotrebuje žiadnu cloud službu
- **Žiadny vendor lock-in** — všetok kód v repo, full control
- **Slovak-first design** — fonetické pravidlá implementované cieleného, nie ako side-effect EN modelu
- **Graceful 3-tier fallback** — degradácia pri zlyhaní vrcholového vendora
- **Audit trail** — každé tvrdenie traceable na file:line v repo
- **Tunabilnosť** — env-overridable parametre (frame_step, ramp_ms, phoneme durations) umožňujú experimenty bez code change

### Slabšie stránky / riziká

- **Mladší codebase** — má cca 2 mesiace aktívneho vývoja vs roky maturity Oculus SDK alebo Convai. Edge cases existujú.
- **Menší dev team** — 1-2 ľudia vs niekoľko teamov v Convai/NeuroSync. Menší celkový pool testovaných scenárov.
- **Neoverená perceptuálna kvalita** — máme 165 deterministických testov ktoré pinujú kontrakt a robustnosť pipeline. **Nemáme** MOS štúdiu, blind test ani nezávislú validáciu, či výsledná animácia **vyzerá prirodzene pre slovenského diváka**.
- **Tier 3 (text-only) je heuristika** — bez Azure phonemes alebo Edge WordBoundary sa spoliehame na slovenské grafemické pravidlá, ktoré sú aproximáciou skutočnej výslovnosti
- **Závislosť na voliteľnom Azure TTS pre Tier 1** — bez paid Azure subscriptione funguje len Tier 2/3

### Stav voči kritériám

| # | Kritérium | EduTutor stav |
|---|-----------|---------------|
| 1 | Natívna SK podpora | ✅ Áno (14 SK visemes + fonetické pravidlá) |
| 2 | Latencia <100ms | ✅ Tier 1: ~5ms, Tier 2: ~50ms, Tier 3: ±25ms |
| 3 | MIT-kompatibilná licencia | ✅ MIT |
| 4 | Offline / on-premise | ✅ Áno (Tier 3 + Piper/Kokoro lokálne TTS) |
| 5 | Vendor self-sufficiency | ✅ Plný open-source |
| 6 | MetaHuman 52-ch ARKit | ✅ Native |
| 7 | Graceful fallback | ✅ 3-tier degrade |

### Testové pokrytie

| Test súbor | Tests | Pokrytie |
|---|---|---|
| `test_phonetic_rules.py` | 32 | Slovenské fonetické pravidlá |
| `test_viseme_timeline.py` | 23 | Vizém generovanie pipeline |
| `test_viseme_timeline_deep.py` | 31 | Hĺbkové vizémové testy |
| `test_lipsync_accuracy.py` | 17 | Viseme accuracy contract |
| `test_lipsync_stress.py` | 13 | Concurrent load |
| `test_avatar_simulation.py` | 20 | End-to-end pipeline bez UE5 |
| `test_ws_avatar.py` | 29 | UE5 WS contract + ARKit |
| **Spolu** | **165** | Determinism + kontrakt + performance |

Tieto testy zaručujú, že pipeline produkuje **konzistentné, deterministické výstupy**. Nezaručujú, že tieto výstupy **vyzerajú prirodzene** pre divákov.

---

## 7. Porovnávacia matica

| Kritérium | Convai | Oculus | NeuroSync | **EduTutor** |
|-----------|--------|--------|-----------|--------------|
| Natívna SK lipsync support | ⚠️ Čiastočná | ❌ | ❌ | ✅ |
| Latencia <100ms | ❌ ~200ms | ✅ <50ms | ⚠️ ~180ms | ✅ 5-50ms |
| MIT-kompatibilná licencia | ❌ | ❌ | ❌ | ✅ |
| Offline / on-premise | ❌ | ✅ | ❌ | ✅ |
| Vendor self-sufficiency | ❌ | ⚠️ | ❌ | ✅ |
| MetaHuman 52-ch ARKit native | ✅ (plugin) | ❌ (adapter) | ✅ | ✅ |
| Graceful fallback dokumentovaný | ❌ | ❌ | ❌ | ✅ 3-tier |
| Production maturita | ✅ Vysoká | ✅ Vysoká | ⚠️ Stredná | ⚠️ Mladší |
| **Perceptuálna kvalita na SK** | **❓ Netestované** | **❓ Netestované** | **❓ Netestované** | **❓ Netestované** |

Posledný riadok je kľúčový: **perceptuálnu kvalitu sme nemerali pre žiadnu zo štyroch alternatív**. Naša voľba bola založená na **architektonických a licenčných obmedzeniach** (kritériá 1-7), nie na meranej kvalite animácie.

---

## 8. Zdôvodnenie výberu

Z porovnávacej matice vyplývajú dve sady kritérií:

**Architektonické constraints** (kritériá 1-7) — overiteľné, falsifikovateľné z public docs:
- EduTutor spĺňa 7 zo 7
- Convai spĺňa 1 zo 7
- Oculus spĺňa 2 zo 7
- NeuroSync spĺňa 2 zo 7

Z tohto pohľadu je EduTutor **jediná možnosť spĺňajúca všetky grantové constraints**. Toto je inžinierske rozhodnutie založené na requirements, nie tvrdenie o kvalite.

**Perceptuálna kvalita** — nemeraná pre nikoho:
- Tu **nevieme**, ktorá alternatíva produkuje najprirodzenejšiu animáciu pre slovenského diváka
- Naše predbežné dev pozorovania naznačujú, že naša Tier 1 SK korekcia (`ť→DD`) je vizuálne lepšia ako default EN mapping, ale toto **NIE je dôkaz** — je to subjektívny dojem autorov samotnej implementácie
- Convai a NeuroSync, aj keď nevyhovujú constraints, môžu mať **vyššiu perceptuálnu kvalitu** vďaka väčším training datasets a komerčnej maturite produktu
- Oculus má proven track record vo VR industry — jeho 15-viseme model môže produkovať vizuálne presvedčivé výsledky aj pre slovenčinu, jednoducho to **nevieme bez testu**

**Otvorené priznanie:** S nameranou perceptuálnou kvalitou by sme mohli zistiť, že napríklad NeuroSync produkuje vizuálne príjemnejší výsledok aj pre slovenčinu, a vlastná implementácia má v určitých fonémach problém. To by však **nezmenilo architektonické rozhodnutie** — grantové obmedzenia (open-source, offline, slovak-first, no lock-in) by stále viedli k vlastnému stacku. Mohlo by to však viesť k zlepšeniam: napríklad doučenie nášho text-to-viseme modelu na nezávislých dátach, alebo zlepšenie konkrétnych fonémov ktoré rateri označia za najslabšie.

---

## 9. Navrhnutý validačný protokol (nie je zatiaľ vykonaný)

Nasledovný protokol je plne navrhnutý a pripravený na spustenie. **K dátumu tohto dokumentu (máj 2026) nebol vykonaný.** Plánovaný cieľ spustenia: Q3 2026.

### 9.1 Výskumné otázky

- **Q1:** Aké je priemerné MOS skóre nášho lipsyncu na slovenských vzorkách (škála 1-5)?
- **Q2:** Aké je priemerné MOS skóre Convai / Oculus / NeuroSync na rovnakých vzorkách?
- **Q3:** Sú rozdiely medzi stackmi štatisticky významné?

### 9.2 Vzorky

20 slovenských viet pokrývajúcich celý fonémový inventár vrátane palatalizovaných `ť/ď/ň`, diphthongov `ia/ie/iu/uo`, slabikotvorných `l/r`, a špecifických znakov `ô/ä/ľ`. Plný zoznam v [`docs/slovak-viseme-recording-brief.md`](../slovak-viseme-recording-brief.md).

### 9.3 Renderovanie

Každá veta vyrenderovaná 4× (1080p, 30fps, 5-10s):
1. EduTutor stack cez MetaHuman + UE5 PixelStreaming
2. Convai cez ich oficiálny UE plugin, ten istý MetaHuman model
3. Oculus LipSync cez SDK + custom 15→14 viseme adapter
4. NeuroSync cez ich SaaS API + rig adapter

**Audio source vo všetkých 4:** rovnaký vygenerovaný Edge TTS audio (Slovak voice `sk-SK-LukasNeural`), aby sme izolovali iba lipsync rozdiel.

### 9.4 Raters

| Aspekt | Cieľ |
|---|---|
| Počet | 8-12 (power 0.8 pre medium effect size, α=0.05) |
| Charakteristika | Native SK speakers, 18-65 rokov, rôzne IT pozadie |
| Recruitment | Univerzitné kruhy (UK, STU), academic Slack/Discord |
| Kompenzácia | 25-50 EUR / rater |

### 9.5 Procedúra (~70 min na rater)

1. **Briefing** (5 min) — bez disclose ktorý stack je v ktorom videu
2. **Kalibrácia** (3 min) — 2 reference videá pre zafixovanie škály
3. **MOS hodnotenie** (~40 min) — 80 videí (20 viet × 4 stacks), pseudorandom order, 1-5 škála + voľný feedback
4. **A/B párové porovnania** (~10 min) — 10 priamych párov + povinný textový dôvod
5. **Demografia + debriefing** (5 min)

### 9.6 Štatistická analýza

- **Q1** — Priemer MOS ± 95% CI per stack
- **Q2** — Welch's t-test pre každú dvojicu (EduTutor vs ostatné) s Bonferroni korekciou
- **Q3** — Cohen's d pre effect size, Intraclass Correlation Coefficient pre rater agreement
- **A/B** — Binomial test (počet preferencií EduTutor / total comparisons)

### 9.7 Pre-registration

Protokol bude pred-registrovaný na OSF (Open Science Framework) pred náborom raterov — zabraňuje p-hackingu a HARKing-u.

### 9.8 Predpokladané (nie merané) výsledky

Naša **hypotéza** založená na §3-§6:

| Stack | Predikované MOS | Confidence |
|---|---|---|
| EduTutor | 3.5-4.0 | Stredná |
| NeuroSync | 3.0-3.5 | Nízka |
| Convai | 2.5-3.5 | Nízka |
| Oculus | 2.0-3.0 | Stredná |

Predikcie sú založené na: SK-špecifický mapping (EduTutor +), production maturity (Convai/NeuroSync neutral), EN-only training (Oculus −). Nemajú váhu meraných výsledkov. Ak skutočný test vyprodukuje napr. NeuroSync 4.2 a EduTutor 3.2, je to dôležitá faktická informácia ktorú prijmeme.

### 9.9 Rozpočet

| Položka | Cena |
|---|---|
| 10 raters × 35 EUR | 350 EUR |
| Convai trial API (1 mes) | ~50 USD |
| NeuroSync trial API (1 mes) | ~75 USD |
| Rendering, štatistická analýza | (vlastná práca) |
| **Spolu** | **~420 EUR + ~125 USD trials** |

### 9.10 Časový plán

6 týždňov od commitment:
- Týždeň 1: rendering 80 videí
- Týždeň 2: recruitment + OSF pre-registration
- Týždeň 3-4: rater sessions
- Týždeň 5: štatistická analýza
- Týždeň 6: publikácia výsledkov

---

## 10. Cross-references

- **Master technical doc** §6: [`EduTutor_AI_Technicka_Dokumentacia_v1.0_FINAL.md`](../../EduTutor_AI_Technicka_Dokumentacia_v1.0_FINAL.md)
- **Lipsync codepath audit**: [`docs/lipsync_codepath_audit.md`](../lipsync_codepath_audit.md)
- **Lipsync integration guide**: [`docs/output3/lipsync-integration.md`](./lipsync-integration.md)
- **Avatar pipeline handoff**: [`docs/avatar-pipeline-handoff.md`](../avatar-pipeline-handoff.md)
- **Slovak viseme recording brief** (pre §9 protokol): [`docs/slovak-viseme-recording-brief.md`](../slovak-viseme-recording-brief.md)
- **Tests final report**: [`docs/output3/tests-report-final.md`](./tests-report-final.md)

---

## 11. Zhrnutie pre grantového recenzenta

EduTutor.AI lipsync stack bol zvolený na základe **architektonických constraints odvodených z grantových požiadaviek** — open-source, slovenský, offline, no vendor lock-in. Z troch externých alternatív žiadna nesplňala kombináciu týchto kritérií.

**Perceptuálna kvalita** — či výsledná animácia vyzerá prirodzene pre slovenského diváka — **nebola formálne meraná** pre žiadnu zo štyroch alternatív vrátane našej. Pre rigorous porovnanie je pripravený MOS protokol s 10 nezávislými raters (§9), náklady ~420 EUR, časový plán 6 týždňov. Spustenie plánované v Q3 2026.

Súčasné dôkazy o našom stacku sú **deterministické a kontraktové** (165 automatizovaných testov, file:line traceable na zdrojový kód), nie perceptuálne. Naša voľba je obhájiteľná z inžinierskeho a licenčného hľadiska — porovnávacie vyhlásenia o kvalite čakajú na výsledky protokolu z §9.
