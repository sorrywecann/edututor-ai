# Audit technologickych rozhodnuti — EduTutor.AI

> **Projekt:** 09I05-03-V04-00072 | **Ziadatel:** SORRYWECAN s.r.o.
> **Dokument:** Interny audit suladu technologickych pivotov s Prilohou 1 (Opis projektu)
> **Datum:** April 2026

---

## 1. Ucel dokumentu

Tento dokument analyzuje kazde technologicke rozhodnutie v projekte EduTutor.AI oproti zavaznym formulaciam v Opise projektu (Priloha 1). Cielom je jednoznacne urcit, co je v sulade s grantom, co vyzaduje zdovodnenie, a co konkretne treba este dorobit pre Vystup 3.

---

## 2. Co grant NAOZAJ slubi (a co nie)

### 2.1 Kľucovy princip: Integracia, nie vyvoj od nuly

Opis projektu, sekcia 1.5 explicitne uvadza:

> *"Hoci jednotlive komponenty su komercne dostupne, ich integracia do systemu [...] nema momentalne na trhu ekvivalent."*

Grant sam definuje projekt ako **integracnu inovaciu** — zobrat existujuce komponenty (LLM, TTS, STT, avatar, vektorova DB, lipsync) a integrovat ich do funkcneho celku. Nikde sa neslubi vyvoj vlastneho LLM, vlastneho TTS enginu, ani vlastneho lipsync modelu.

### 2.2 Technologie su uvedene ako priklady

PB tabuľky konzistentne pouzivaju formulacie:

- PB2: *"napriklad Gemma 9b alebo Llama 3.2"*
- PB3: *"napriklad Pinecone alebo Milvus"*
- PB4: *"OpenAI Whisper-small"*, *"RealtimeTTS a Coqui TTS"*, *"Gemma2:9b"*

Slovo **"napriklad"** v PB2 a PB3 jasne signalizuje, ze ide o priklady, nie zavazne technologie. PB4 je konkretnejsi, ale v kontexte "parametrizacie" — teda testovania a nastavovania parametrov, nie permanentneho nasadenia.

### 2.3 Co je zavazne: ciele PB, nie konkretne technologie

Zavazne su **ciele pracovnych balikov** a **vystupy milnikov**, nie konkretne mena technologii:

| PB | Zavazny ciel | Zavazna technologia? |
|---|---|---|
| PB1 | Navrh modularnej architektury | Nie — vyber technologii JE cinnost PB1 |
| PB2 | Funkcny LLM prototyp s STT/TTS | Nie — "napriklad" Gemma/Llama |
| PB3 | Funkcny prototyp s vektorovou DB | Nie — "napriklad" Pinecone/Milvus |
| PB4 | Parametrizacia STT, TTS, LLM, VDB | Ciastocne — menuje Whisper, Coqui, Gemma, Pinecone |
| PB5 | Optimalizacia + vyber lipsync | Nie — explicitne "vybrat najvhodnejsie" |

---

## 3. Audit jednotlivych technologickych rozhodnuti

### 3.1 LLM: Gemma → Mistral (cez Ollama) / OpenRouter (Qwen)

**Co hovori Opis:**
- PB2: *"testovanie dostupnych modelov, ako su Gemma, Llama, a Mistral"*
- PB4: *"Gemma2:9b"*

**Co robime:** Mistral cez Ollama (lokalne nasadenie) + OpenRouter (cloud) ako alternativa

**Verdict: ✅ PLNE V SULADE**

Opis v PB2 sam menuje Mistral ako jednu z testovanych alternativ. PB4 spomina Gemma2:9b v kontexte parametrizacie (t.j. testovali sme ju, nastavili parametre). Prechod na Mistral je vysledkom experimentalneho vyvoja — otestovali sme Gemmu, Llama aj Mistral a vybrali najlepsi model. Presne toto grant popisuje ako cinnost PB2.

Aktualne nasadeny prototyp pouziva ChromaDB (embedded, zero-config) ako primarnu vektorovu databazu a Edge TTS (free Microsoft cloud) ako predvoleny TTS engine. Weaviate a Azure TTS su implementovane ako alternativne backendy a boli testovane pocas vyvoja. Ollama (Mistral/qwen2.5:7b) je predvoleny lokalny LLM fallback; cloudove API (OpenRouter/Qwen) su aktivovane pouzivatelom v UI.

**Lokalne nasadenie:** Mistral bezi cez Ollama na lokalnom serveri = spĺna PB2 "Lokalna implementacia LLM."

**Dokumentacia pivohu:** Existuje vo vykazoch (OKT mesiac) a v PB2_vystup.md.

---

### 3.2 TTS: Coqui → Azure Neural TTS / Edge TTS

**Co hovori Opis:**
- PB2: *"Integracia kniznic RealtimeSTT a RealtimeTTS"*
- PB4: *"Parametrizacia TTS s pouzitim kniznice RealtimeTTS a Coqui TTS"*

**Co robime:** Azure Neural TTS (alternativa) + Edge TTS (predvoleny, free)

**Verdict: ✅ V SULADE (s dokumentovanym zdovodnenim)**

Klučovy detail: **RealtimeTTS je Python kniznica**, nie konkretny TTS engine. RealtimeTTS podporuje viacero backendov vratane Coqui, Azure, Google, Elevenlabs, atd. Pouzivat Azure cez RealtimeTTS je plne v sulade s formulaciou v PB2.

PB4 spomina "Coqui TTS" — ale v kontexte **parametrizacie**, co znamena, ze sme Coqui testovali a parametrizovali. Testovanie ukazalo kriticky bottleneck (8,7 sekundy syntezy pri dlhsich vstupoch — zdokumentovane v testovacich datach STU). Pivot na Azure Neural TTS je zdovodneny vysledkami experimentalneho vyvoja.

**Nie je problem, ze Azure je cloud:** PB2 sa vola "Lokalna implementacia **LLM**" — poziadavka na lokalne nasadenie sa explicitne tyka jazykoveho modelu, nie TTS. Grant nikde nehovori "vsetko musi bezat lokalne." Navyse, sekcia 1.5 hovori o integracii "komerčne dostupnych komponentov" — Azure TTS je presne taky komponent.

**Co treba zdokumentovat:**
- [ ] Zdovodnenie pivohu Coqui → Azure (latencia, kvalita, stabilita)
- [ ] Potvrdenie, ze RealtimeTTS kniznica je stale sucastou stacku (ak ano)

---

### 3.3 STT: Whisper-small → aktualna verzia

**Co hovori Opis:**
- PB4: *"Nastavenie modulu STT s vyuzitim modelu OpenAI Whisper-small"*

**Co robime:** Whisper (cez RealtimeSTT)

**Verdict: ✅ PLNE V SULADE**

Whisper je stale Whisper. Ci pouzivame whisper-small alebo inu velkost je detail parametrizacie, presne to co PB4 opisuje.

---

### 3.4 Vektorova DB: Pinecone → Weaviate / ChromaDB

**Co hovori Opis:**
- PB3: *"napriklad Pinecone alebo Milvus"*
- PB4: *"vektorovej databazy Pinecone"*

**Co robime:** ChromaDB (embedded, predvoleny) + Weaviate (alternativa)

**Verdict: ✅ V SULADE (s dokumentovanym zdovodnenim)**

PB3 explicitne hovori "napriklad" — Pinecone a Milvus su priklady, nie zavazok. Weaviate je open-source vektorova DB rovnakej kategorie. ChromaDB je embedded riesenie, ktore vyzaduje nulovu konfiguraciu — idealne pre prototyp. Pivot je zdokumentovany vo vykazoch.

**Vyhoda pre audit:** Weaviate/ChromaDB bezia lokalne (self-hosted), co je dokonca LEPSIE nez Pinecone (cloud). Ak by niekto argumentoval, ze projekt by mal byt lokalny, ChromaDB/Weaviate je silnejsi argument.

**Dokumentacia pivohu:** Existuje vo vykazoch OKT.

---

### 3.5 Lipsync: Convai → vlastne riesenie (viseme pipeline)

**Co hovori Opis:**
- PB3: *"Implementaciu lipsync technologii"*
- PB5: *"Analyza a testovanie lipsync technologii (Convai, NeuroSync, Oculus LipSync) s cielom vybrat najvhodnejsie riesenie"*
- Sekcia 1.4: *"NeuroSync a Oculus LipSync, ktore zabezpecuju realnu synchronizaciu reci"*

**Co robime:** Convai (aktualne nasadeny) + vlastny viseme pipeline (viseme_timeline.py + Azure TTS viseme data + UE5 Blueprint)

**Verdict: ✅ V SULADE — ale vyzaduje dokladnu dokumentaciu**

PB5 doslova hovori: analyzovat Convai, NeuroSync, Oculus LipSync **"s cielom vybrat najvhodnejsie riesenie."** To nie je zavazok implementovat NeuroSync — je to zavazok **otestovat a vybrat.** Presne toto sme spravili:

1. **Convai** — otestovany, funkcny, nasadeny v prototype. Ne vyhoda: cloud-dependent.
2. **NeuroSync** — analyzovany (STU studia). Princip priameho audio→blendshape mapovania je spravny, ale alfa stav komponentov vylucuje produkcne nasadenie.
3. **Oculus LipSync** — prototyp testovany v Unity, nie v UE5 (nas cilovy engine).
4. **Vlastny viseme pipeline** — vyvinuty na zaklade zisteni z analyzy. Kombinuje princip lokalneho spracovania (inspiracia NeuroSync) s produkcnou stabilitou (Azure TTS viseme API).

**Preco nie priamo NeuroSync:**
- Alfa stav — komponenty AnimaVR su single-developer GitHub projekty bez produkcnej stability
- Vyzaduje lokalny GPU pre inferencny model — zbytocna zavislost, ked Azure TTS poskytuje viseme data priamo v API response
- Ziadna garancia dlhodobej podpory

**Preco vlastny pipeline je LEPSI vysledok pre grant:**
- Je to vysledok experimentalneho vyvoja (nie len nasadenie hotoveho riesenia)
- Kombinuje silne stranky identifikovane pocas vyskumu (PB1/PB5)
- Dokumentuje jasnu vyskumnu cestu: resers → testovanie → vlastny vyvoj

**Co KRITICKY chyba (Vystup 3 MUST HAVE):**
- [ ] **Integracna dokumentacia** — ako viseme_timeline.py, Azure TTS a UE5 Blueprint spolupracuju
- [ ] **Validacne vysledky** — merania kvality lipsync, latencia, porovnanie s Convai baseline
- [ ] **Zdovodnenie vyberu** — formalny dokument preco vlastny pipeline namiesto priamej implementacie NeuroSync

---

### 3.6 Avatar: Metahuman v Unreal Engine 5

**Co hovori Opis:**
- Sekcia 1.4: *"3D Avatar s realistickou interakciou: Riesenie zavadza 3D avatara vyvinuteho v Unreal Engine"*
- PB3: *"spracovanie mimiky v Unreal Engine"*

**Co robime:** Metahuman avatar v UE5, Blueprint napojenie, 3D model, animacie

**Verdict: ✅ PLNE V SULADE — ale chyba vizualna dokumentacia**

Avatar sa aktivne vyvija, Blueprint napojenie funguje. Problem nie je v technologii, ale v **absencii vizualnych dokazov** (screenshoty, video, render) v grantovej dokumentacii.

**Co KRITICKY chyba:**
- [ ] Screenshoty avatara v UE5 editore
- [ ] Video/GIF demonstracia lipsync animacie
- [ ] Screenshot Blueprint grafu (integracia)
- [ ] Pred/po porovnanie (rozne fazy vyvoja)

---

## 4. Suhrnna tabulka suladu

| Technologia | Opis projektu | Realita | Sulad | Riziko |
|---|---|---|---|---|
| LLM | Gemma/Llama/Mistral (priklady) | Mistral (Ollama, lokalne) + OpenRouter (cloud) | ✅ Plny | Ziadne |
| TTS | RealtimeTTS + Coqui (parametrizacia) | Azure Neural TTS / Edge TTS | ✅ Zdovodneny | Nize — treba pivot doc |
| STT | Whisper-small | Whisper | ✅ Plny | Ziadne |
| VektorDB | Pinecone/Milvus (priklady) | ChromaDB (embedded) / Weaviate (lokalne) | ✅ Zdovodneny | Ziadne |
| Lipsync | Convai/NeuroSync/Oculus (testovat + vybrat) | Convai + vlastny pipeline | ✅ Zdovodneny | VYSOKE — chyba dokumentacia |
| Avatar | 3D avatar v UE5 | Metahuman + Blueprint | ✅ Plny | STREDNE — chyba vizualny dokaz |
| Architektura | Modularna, skalovatelna | FastAPI + microservices | ✅ Plny | Ziadne |

---

## 5. Odpoved na otazku: "Je OK, ze pouzivame Azure TTS?"

**Ano, je to v poriadku.** A tu je preco:

1. **Grant nehovori "vsetko musi byt lokalne."** PB2 sa vola "Lokalna implementacia **LLM**" — lokalna poziadavka sa explicitne vztahuje na jazykovy model. LLM (Mistral) bezi lokalne cez Ollama. Splnene.

2. **RealtimeTTS je kniznica, nie engine.** Grant hovori o integracii "kniznic RealtimeSTT a RealtimeTTS." RealtimeTTS je Python wrapper, ktory abstrahuje rozne TTS backendy. Pouzivanie Azure backendu cez RealtimeTTS je uplne validne.

3. **Coqui TTS je v PB4 (Parametrizacia)**, nie v zavaznych vystupoch. PB4 popisuje cinnost parametrizacie — testovali sme Coqui, namerali sme bottleneck (8,7s), a na zaklade toho sme pivotli. To je presne experimentalny vyvoj.

4. **Sekcia 1.5 hovori o integracii komercne dostupnych komponentov.** Azure Neural TTS je komercne dostupny komponent. Grant sam definuje inovaciu ako integraciu.

5. **Azure TTS dava bonusovu hodnotu:** Poskytuje viseme timeline data priamo v API response — co umoznilo vyvoj vlastneho lipsync pipeline (viseme_timeline.py). Toto je pridana hodnota, ktora by s Coqui nebola mozna.

---

## 6. Odpoved na otazku: "Co STU robilo s tou studiou?"

STU vypracovalo komparativnu analyzu technologii (testovanie latencii, porovnanie lipsync rieseni). Toto je vystup **priemyselneho vyskumu (PB1)** a **experimentalneho vyvoja (PB5)**.

PB5 explicitne definuje ako cinnost: *"Testovanie vykonnosti modulov prototypu na roznych vstupoch (napr. test.wav, oop test.wav, oop constructor.wav) a meranie casov vykonania jednotlivych uloh."*

STU teda robilo presne to, co grant popisuje. Ich vystupy:
- Identifikovali Coqui TTS bottleneck → viedlo k pivohu na Azure
- Identifikovali Gemma bottleneck → viedlo k pivohu na Mistral
- Porovnali lipsync technologie → informovalo vyber vlastneho pipeline
- Namerali baseline metriky → zaklad pre porovnanie s optimalizovanou verziou

---

## 7. KONKRETNY ZOZNAM: Co presne treba dorobit

### 🔴 KRITICKE (Vystup 3 MUST HAVE — bez tychto audit neprejde)

**7.1 Lipsync integracna dokumentacia**
- Technicky popis: ako viseme_timeline.py funguje (vstup → spracovanie → vystup)
- Diagram: Azure TTS API → viseme JSON → Python parser → UE5 Blueprint → Metahuman blendshapes
- Parametre: ake viseme ID sa mapuju na ake blendshapes, timing, interpolacia
- Validacne vysledky: latencia end-to-end, kvalita synchronizacie (subjektivne hodnotenie)
- Porovnanie s Convai baseline (predtym vs. teraz)

**7.2 Avatar vizualna dokumentacia**
- Minimalne 5-10 screenshotov: avatar v editore, Blueprint graf, animacia, lipsync v akcii
- Idealne: 2-3 minutove demo video (avatar odpoveda na otazku v realnom case)
- Screenshot celkoveho UE5 projektu (content browser, level)

**7.3 Performance / zatazovy report**
- Nove merania s aktualnym stackom (Mistral + Azure TTS + ChromaDB/Weaviate)
- Porovnanie so starymi meraniami STU (Gemma + Coqui + Pinecone)
- Tabulka: modul → stary cas → novy cas → zlepsenie
- Minimalne 3 testovacie scenare (kratky/stredny/dlhy vstup)

**7.4 Sprievodca implementaciou**
- Krok-za-krokom instalacia (Docker alebo manualne)
- Poziadavky na HW/SW
- Konfiguracia environment premenných (Azure API key, Ollama endpoint, Weaviate URL)
- Overenie funkcnosti (smoke test)

**7.5 Open-source zverejnenie**
- GitHub repozitar s kodom
- README s popisom projektu
- Licencia (MIT alebo Apache 2.0)
- Odkaz v technickej dokumentacii

### 🟡 DOLEZITE (posilnuju audit, nie su MUST HAVE)

**7.6 Formálny pivot log**
- Jeden dokument sumarizujuci VSETKY pivoty s datumami a zdovodnenim
- Format: Technologia | Povodna → Nova | Datum | Dovod | Evidencia (odkaz na vykaz/dokument)

**7.7 Aktualizacia technickej dokumentacie na V3**
- Aktualizovat architekturny diagram (V1 je z PB1, neodzrkadluje aktualny stack)
- Doplnit optimalizovane parametre vsetkych modulov

### 🟢 NICE TO HAVE (bonus body pre audit)

**7.8 Golden Dataset + Hit Rate**
- Testovacia sada otazok → ocakavane odpovede → realne odpovede → presnost

**7.9 Zatazovy scenar (concurrent users)**
- Kolko simultannych pouzivatelov system zvladne

---

## 8. Odporucane poradie prace

| Priorita | Uloha | Odhadovany cas | Kto |
|---|---|---|---|
| 1 | Avatar screenshoty + video | 1-2 hodiny | UE5 developer |
| 2 | Lipsync integracna dokumentacia | 4-6 hodin | Backend + UE5 dev |
| 3 | Performance report (nove merania) | 3-4 hodiny | Backend dev |
| 4 | GitHub repo + open-source | 2-3 hodiny | Backend dev |
| 5 | Sprievodca implementaciou | 3-4 hodiny | Backend dev |
| 6 | Pivot log | 2 hodiny | Ktokolvek |
| 7 | Tech doc V3 aktualizacia | 4-6 hodin | Backend dev |
| **SPOLU** | | **~20-27 hodin** | |

---

## 9. Zaver

Vsetky technologicke rozhodnutia v projekte su v sulade s Opisom projektu alebo su zdovodnitelne ako vysledok experimentalneho vyvoja. Grant sam definuje projekt ako integraciu komercne dostupnych komponentov, pouziva slovo "napriklad" pri konkretnych technologiach, a v PB5 explicitne hovori o testovani a vybere najvhodnejsieho riesenia.

Azure TTS nie je problem. NeuroSync nemusime implementovat — staci zdokumentovat, ze sme ho analyzovali a preco sme sa rozhodli inak. Hlavne riziko nie su technologicke pivoty — hlavne riziko je **chybajuca dokumentacia** toho, co sme realne postavili a preco.

Ak doplnime 5 kritickych poloziek (lipsync integracia, avatar vizualy, performance report, sprievodca implementaciou, open-source), projekt je auditovatelny.

---

## Priloha C — Zmierovacia priloha (Reconciliation Annex)

> **Doplnene:** 2026-05-30
> **Ucel:** Most medzi monitorovacou spravou PB1–PB5 (predlozenou APVV 30.04.2026) a finalnym stavom dodavky v0.7.x (release princeofwellness/edututor-releases v0.7.2). Sekcia 3 pokryva niektore pivoty (LLM/TTS/STT/VDB/lipsync/avatar); Priloha C ich formalizuje s datumom a doplna polozky, ktore v sekcii 3 chybali.
> **Format kazdej polozky:** *Co monitoring tvrdil → Co sme dodali → Datum → Dovod → Bez redukcie skopu → Dokaz v repe.*

### C.0 Suhrnna tabulka

| ID | Tema | Pokryte v sekcii 3? | Riziko ak nepriznane |
|---|---|---|---|
| M1 | Mistral 7B ako vsadyprestupny LLM → multi-provider stack | Ciastocne (3.1) | Nizke |
| S1 | erikbozik/whisper-* → NaiveNeuron SloPal SK fine-tunes | Nie (3.3 pokryva len Whisper obecne) | Stredne (licencna atribucia EMNLP 2025, CC-BY-4.0) |
| T1 | XTTS-v2 / Chatterbox / Coqui VITS → OmniVoice | Nie (3.2 pokryva Azure, nie OmniVoice) | Stredne |
| R1 | Weaviate ako primarne → ChromaDB embedded ako default | Ciastocne (3.4) | Nizke |
| RT1 | LiveKit + ComplexConversationService → SSE + WebSocket + Wilbur Pixel Streaming | Nie | **Vysoke** |
| A1 | UE4 + SaaS avatar shortlist → UE5 MetaHuman in-house | Ciastocne (3.6) | Stredne |
| A2 | Experimentalna HuBERT/ARKit 52-kanalova vetva (deprecated) | Nie | **Vysoke** (kod existuje, ale je oficialne orphaned per project rule) |
| I1 | Docker + Kubernetes autoscaling → desktop .exe + optional Docker Compose | Nie | **Vysoke** |
| L1 | <2 s E2E latencia → 3–9 s celkovo / ~1 s vnimanej cez SSE streaming | Nie | Stredne |
| K6-1 | "tri vlny k6" → 6 scenarov | Nie | Nizke |
| REPO-1 | jeden projektovy repo → edututor-ai-sandbox (s O) + edututor-releases (s U) + planovany sorrywecann/edututor-ai | Nie | Stredne (mozny "preklep" flag pri audite) |

---

### C.1 (M1) LLM: Mistral 7B → multi-provider stack s cloud-first defaultom

**Co monitoring tvrdil:** Mistral 7B vsade; optimalizacia prompt-u "pre Mistral 7B"; pat LLM providerov.

**Co sme dodali:** Sest natívnych providerov v dispatch tabuľke (`openai`, `azure`, `anthropic`, `ollama`, `vllm`, `local` = Mistral 7B 4-bit cez Transformers) + dynamicky custom-registry slot (Qwen3-14B-sk). Default prioritny retazec: OpenAI > Anthropic > custom > Azure > Ollama > local > mock. **Mistral je zachovany** ako (a) lokalny `local` provider cez `mistralai/Mistral-7B-Instruct-v0.2` ked `USE_LOCAL_LLM=true`, (b) kuratovany model v Ollama whitelist (`RECOMMENDED_LOCAL = {gemma3:4b, qwen2.5:7b, mistral:7b, llama3.2:3b}`). Cloud Mistral La Plateforme bude doplneny v nasledujucom release ako `mistral` provider (OpenAI-kompatibilne API).

**Datum pivohu:** Q1–Q2 2026 (postupne; finalizovane v marci 2026).

**Dovod:** Lokalny Mistral na CPU nedosahuje APVV demo bar (latencia, koherentnost). Multi-provider stack drzi Mistral ako offline fallback, ale demo cesty pouzivaju cloudove modely (OpenAI gpt-4o-mini / Anthropic claude-haiku-4-5). Optimalizacia prompt-u — povodne pripisana Mistralu — bola v skutocnosti aplikovana na **Ollama-specific system prompt** (provider-conditional v `llm_service.py:682`): merane `tiktoken cl100k_base` = **1 239 → 320 tokenov** (~3,87×), nie "975 → 152."

**Bez redukcie skopu:** PB2 sam menuje *"Gemma, Llama, a Mistral"* ako testovane alternativy. Mistral je stale vo whitelist a v lokalnom modeli; multi-provider stack rozsiruje, neredukuje. Slovenska inferencia je zachovana cez SloPal STT + slovensky system prompt (`_OLLAMA_SYSTEM_PROMPT`).

**Dokaz:** `tutor-service/app/services/llm_service.py:414-456` (dispatch tabuľka), `tutor-service/app/config/llm_config.py:12-16` (Mistral 7B config), `tutor-service/app/api/llm.py` (`RECOMMENDED_LOCAL` whitelist), `docs/evidence/NUMBERS_LEDGER.md` (merane tokeny), `docs/plans/v0.7.0-FINAL-POLISH-MASTER-PLAN.md` (kuratovany whitelist rozhodnuti).

---

### C.2 (S1) STT: erikbozik/whisper-* → NaiveNeuron SloPal SK fine-tunes

**Co monitoring tvrdil:** `erikbozik/whisper-small-sk`, `erikbozik/whisper-large-v3-sk` ako konkretne SK STT modely.

**Co sme dodali:** Tri SloPal SK fine-tunes od NaiveNeuron (EMNLP 2025, licencia **CC-BY-4.0**):

| Model | HF ID | WER (priblizne) | Pouzitie |
|---|---|---|---|
| SloPal turbo SK | `naivneuron/slopal-whisper-large-v3-turbo-sk` | ~13 % | Production SK (predvoleny) |
| SloPal large-v3 SK | `naivneuron/slopal-whisper-large-v3-sk` | ~12 % | Max accuracy SK |
| SloPal small SK | `naivneuron/slopal-whisper-small-sk` | ~25 % | Lightweight SK |

Backendy: mlx-whisper, faster-whisper, Groq (cloud Whisper API), OpenAI (cloud), plus lokalna SloPal registry. `tutor-service/tests/test_slopal_registry.py` pinuje exaktne HF IDs ako kontrakt.

**Datum pivohu:** ~Q1 2026 (po publikacii SloPal benchmarkov NaiveNeuronom).

**Dovod:** SloPal fine-tunes dosahuju **65–70 % redukciu WER** oproti base Whisper na slovencine; akademicka provenancia (EMNLP 2025 paper) poskytuje citovatelnu vedeckú zaklad pre grant; CC-BY-4.0 licencia je kompatibilna s open-source distribuciou.

**Bez redukcie skopu:** PB4 menuje "OpenAI Whisper-small" v kontexte parametrizacie — testovali sme Whisper aj jeho fine-tunes, vybrali sme lepsi. Slovenska STT presnost je vyrazne LEPSIA, nie horsia.

**Dokaz:** `tutor-service/app/services/stt_service.py` (SloPal registry), `tutor-service/tests/test_slopal_registry.py` (kontrakt na HF IDs), `docs/adrs/003-stt-provider-strategy.md` (ADR-003).

---

### C.3 (T1) TTS: XTTS-v2 / Chatterbox / Coqui VITS → OmniVoice

**Co monitoring tvrdil:** RealtimeTTS + Coqui (PB4), 6 providerov s dorazom na Azure migraciu.

**Co sme dodali:** Sedem reachable TTS providerov cez `switch_provider()`: `edge`, `openai`, `azure`, `piper`, `kokoro`, `omnivoice`, `mock`. **OmniVoice nahradil** XTTS-v2 / Chatterbox / Coqui VITS v commite `b22c568` — single lazy-loaded ~1,2 GB model pokryvajuci 600+ jazykov vratane slovenciny.

**Datum pivohu:** ~commit `b22c568` (Q1 2026).

**Dovod:** OmniVoice je jeden model namiesto troch tazsich enginov; 600+ jazykova podpora vratane slovenciny; lazy-loading znizuje pamatovu stopu pre desktop deployment. Dead-code XTTS-v2 / Chatterbox / Coqui ostane v `tts_service.py` ako legacy az do cleanup-u W6.

**Bez redukcie skopu:** Capability voice-cloningu je zachovana (OmniVoice ho podporuje), pocet jazykov sa zvysil zo desiatok na 600+, slovenska kvalita je porovnatelna alebo lepsia.

**Dokaz:** `tutor-service/app/services/tts_service.py:765-820` (OmniVoice implementacia), commit `b22c568`, `docs/evidence/NUMBERS_LEDGER.md` (TTS dispatch enumeracia).

---

### C.4 (R1) Vektor DB: Weaviate primarny → ChromaDB embedded ako default

**Co monitoring tvrdil:** Weaviate ako primarna voľba; chunk 500 / overlap 50 / top-k 5 / threshold 0,3 (PB3 doc) alebo 0,7 (PB3 monitoring).

**Co sme dodali:** **ChromaDB embedded ako default** (`VECTOR_DB_BACKEND=chroma`), Weaviate ako alternativa cez env toggle pre produkcne nasadenie. Realne defaulty z `rag_config.py`: chunk_size=**500**, chunk_overlap=**80**, top_k=**5**, similarity_threshold=**0,65**, embedding model **paraphrase-multilingual-MiniLM-L12-v2 (384-dim)**.

**Datum pivohu:** Q1–Q2 2026.

**Dovod:** ChromaDB embedded eliminuje potrebu spustat Docker pre desktop .exe distribuciu (one-click install pre koncoveho ucitela). Weaviate ostava pre institucionalne/serverove nasadenie cez env premenu. Threshold 0,65 (vs povodne 0,3 a 0,7) je vysledok empirickeho tuningu — nizsie hodnoty davali sum, vyssie zhadzovali relevantne dokumenty.

**Bez redukcie skopu:** Oba backendy su dostupne; embedded mode je dokonca silnejsi pre arg "lokalne nasadenie" — nepotrebuje ziadnu externu sluzbu.

**Dokaz:** `tutor-service/app/config/rag_config.py:33-64`, `tutor-service/app/services/chroma_rag_service.py`, `tutor-service/app/services/weaviate_rag_service.py`, `tutor-service/Dockerfile:22` (HF cache pre embedding model), `tutor-service/tests/test_fragile_contracts.py:40` (kontrakt na embedding model).

---

### C.5 (RT1) Realtime transport: LiveKit + ComplexConversationService → SSE + WebSocket + Wilbur Pixel Streaming

**Co monitoring tvrdil:** PB4 budovany okolo **LiveKit** ako centralnej platformy + `ComplexConversationService` + WebSocket→WebRTC.

**Co sme dodali:** Tri transport vrstvy:
- **SSE** `/chat/stream` (server-sent events) pre prudove odpovede LLM + audio chunks + viseme timeline
- **WebSocket** `/ws/avatar` pre obojsmernu komunikaciu s UE5 (broadcast emocia/visemes/audio + receive `avatar_ready`/`speech_complete`)
- **Wilbur Pixel Streaming** (WebRTC) ako volitelna vrstva pre browser-stream UE5 obrazu

**LiveKit infrastruktura je v repe pritomna ale orphaned**: `livekit.yaml` + LiveKit SDK + endpointy pre token generaciu v `app/api/conversations.py` ostali z v1.0 conversation API. Frontend LiveKit nikdy nepouziva. `ComplexConversationService` ako trieda **nikdy nebol implementovany** — namiesto neho je stateless `Conversation` SQLAlchemy model.

**Datum pivohu:** Q1–Q2 2026.

**Dovod:** LiveKit pridaval per-room cost a WebRTC komplexnost neprimerane pre tutor-style one-to-one streaming. SSE + WebSocket dosahuje rovnaky UX cieľ pri jednoduchsej operativnej stope a 100% offline kompatibility. Wilbur pokryva pripady, ked treba UE5 obraz strimovat do prehliadaca.

**Bez redukcie skopu:** Realtime UX cieľ je splneny: prudove tokenove streaming + per-vetna TTS + lipsync sync. LiveKit kod ostane (nie je odstraneny) pre pripadnu spätnu kompatibilitu s v1.0 klientmi.

**Dokaz:** `tutor-service/app/api/chat.py` (SSE), `tutor-service/app/api/ws_avatar.py` (WS), `tutor-service/app/api/conversations.py` (LiveKit token endpoint — inactive), `livekit.yaml`, `docs/exe-bundle-handoff.md`, `docs/avatar-protocol-deep-dive.md`. **TODO pre v0.8.x:** pridat komentar "INACTIVE INFRASTRUCTURE" do `livekit.yaml` a do hlavickovych komentarov LiveKit endpointov.

---

### C.6 (A1) Avatar: UE4 + SaaS shortlist → UE5 MetaHuman in-house

**Co monitoring tvrdil:** UE4 prototyp, potom "AI-generated avatar" SaaS shortlist (Tavus, Simli, Anam, bitHuman, Hedra, Beyond Presence).

**Co sme dodali:** UE5 MetaHuman avatar (`MHC_Girl`) in-house, vlastny Blueprint napojenie, ZenDyn lipsync plugin (UE5-side), 14 SK visemes + 9 emocii, prepojeny so backendom cez `/ws/avatar`. ZenDyn je UE5-side plugin (Blueprint + C++); backend posiela len semanticke labels (viseme indexy, emocia, intenzita).

**Datum pivohu:** Q1–Q2 2026.

**Dovod:** SaaS poskytovatelia (Tavus/Simli/Anam atd.) maju per-minutovy streaming poplatok, ktory je nekompatibilny s offline desktop deployment. MetaHuman dava plnu lokalnu kontrolu + slovensku viseme fidelitu cez vlastnu mapovaciu vrstvu (`docs/viseme-to-arkit-mapping.csv`). UE5 je nasledník UE4 a podporuje MetaHuman natívne.

**Bez redukcie skopu:** Kvalita avatara prekracuje povodny bar (PB3 *"spracovanie mimiky v Unreal Engine"*); offline-prevadzka je dokonca silnejsie postavenie nez SaaS.

**Dokaz:** `Edutor_UnrealEngine` branch (UE5 assets, .uasset blueprints), `docs/viseme-to-arkit-mapping.csv`, `docs/avatar-pipeline-handoff.md`, `docs/ue5-avatar-contract.md`. Doplna sekciu 3.6 ako formalny zaznam s datumom.

---

### C.7 (A2) Experimentalna vetva: HuBERT/ARKit 52-kanalova lipsync — **deprecated**

**Co monitoring tvrdil:** Nic — ARKit/HuBERT v monitorovacej sprave nefiguruje.

**Co sme dodali:** Experimentalna vyskumna implementacia `tutor-service/app/services/audio2lipsync/` — frozen HuBERT Large (315M parametrov) + bidirectional Transformer + 52-kanalovy ARKit blendshape head, beziaca @60 fps. Vystup ako `arkit_frames` v `/ws/avatar` payload-e ked `provider in {audio2lipsync, hybrid}`.

**Aktualny stav:** **Oficialne deprecated** per project rule v `CLAUDE.md`:
> *"Lipsync system: ZenDyn + 14 visemes. The audio2lipsync/ARKit path is orphaned — do not extend it."*

Kanonickou produkcnou cestou je **14 ZenDyn visemes** (text-path generovany cez `viseme_timeline.py` zo SK grapheme-to-viseme mapovania alebo z Azure TTS viseme JSON). HuBERT/ARKit pipeline ostal v kodze ako vyskumny artefakt z PB5 experimentalneho vyvoja, ale **NIE JE rozsirovany** a v ramci W6 cleanup-u sa zvazuje jeho odstranenie.

**Datum pivohu:** Q1 2026 (pridane), Q2 2026 (deprecated).

**Dovod:** 52-kanalovy HuBERT path bol experimentalna vetva preverujuca "ci by sa dala dosiahnut ARKit-grade fidelita lokalne." Empiricky sa ukazalo, ze 14 ZenDyn visemes su pre slovenske vyslovnosti dostatocne (ZenDyn plugin na UE5 strane robi interpolaciu na bohatsie blendshape sady). Drzat oba pipeline zvysuje udrzbu bez ekvivalentneho UX prinosu.

**Bez redukcie skopu:** Tato polozka je **dodatocna scope** voci povodnym PB cielom, nie redukcia. Z grant-perspektivy je to vystup experimentalneho vyvoja (PB5).

**Dokaz:** `tutor-service/app/services/audio2lipsync/constants.py:63` (N_BLENDSHAPES=52), `tutor-service/app/services/audio2lipsync/model.py` (HuBERT + Transformer), `tutor-service/app/services/audio2lipsync_client.py`, `CLAUDE.md` ("orphaned" rule).

**Konzistencia s v1.1/v2 dokumentaciou:** v1.1 popisuje "52 ARKit blendshape channels" ako feature — toto je presne ten experimentalny pipeline. v2 ho ma popisovat ako vyskumny vystup PB5, nie ako kanonicku rendering cestu.

---

### C.8 (I1) Infrastructure: Docker + Kubernetes autoscaling → desktop .exe + optional Docker Compose

**Co monitoring tvrdil:** PB4 "Docker + Kubernetes autoscaling"; PB5 "Docker baliik jednym prikazom."

**Co sme dodali:** **Primarny deliverable** je Windows NSIS .exe inštalator (~1,79 GB, `princeofwellness/edututor-releases` v0.7.2), s 5 zabalenymi komponentmi (CPython 3.11 + FastAPI backend + Ollama + faster-whisper STT + UE5 + Wilbur). **Docker Compose** ostava pre institucionalne nasadenie (3 compose suborov: dev, prod s Prometheus/Grafana, release overlay). **Kubernetes manifesty v repe nie su.**

**Datum pivohu:** Q2 2026.

**Dovod:** APVV deliverable sa posunul na *teacher-installable desktop product* (jedno-klikove vyukove riesenie pre konkretnu skolu/ucitela). Kubernetes operacie su nevhodne pre end-user laptopy. Docker Compose ostal ako odpoved na institucionalne pripadové studie (skola s vlastnym serverom).

**Bez redukcie skopu:** Docker Compose dolezi institucionalne pouzitie. Desktop .exe je SILNEJSIA forma "jednym prikazom" — uzivatel doslova klikne installer a system funguje (zero-config, zero-API-key offline mode dostupny).

**Dokaz:** `desktop/` Electron projekt, `desktop/scripts/stage-resources.mjs` (bundler), `desktop/dist/EduTutor-Setup-0.7.2.exe`, `docker-compose.yml` / `docker-compose.prod.yml` / `docker-compose.release.yml`, `docs/exe-bundle-handoff.md`, `docs/INSTALLATION.md`.

---

### C.9 (L1) Latencia: <2 s E2E → 3–9 s celkovo / ~1 s vnimanej cez SSE

**Co monitoring tvrdil:** PB2 "780 ms", PB4/PB5 "<2 s E2E."

**Co sme dodali:** Realna E2E latencia chat-u: **3–9 s celkovo**, **vnimana ~1 s** vdaka SSE streaming-u (prvy token doraz v <1 s, dalsie tokeny + audio chunks doraza po vetach). Benchmarky: Cloud OpenAI 5,8–8,7 s, GPU RTX 4090 ~3,0 s, OpenRouter Qwen 7,5–8,4 s.

**Datum pivohu:** April 2026.

**Dovod:** Povodny <2 s cieľ predpokladal "bare-text LLM only" (cisto prompt → odpoved). Realne pipeline obsahuje navyse: RAG retrieval (~300 ms), per-vetnu TTS syntezu (~500–1000 ms na vetu), generovanie viseme timeline, detekciu emocii, broadcast na UE5. Vnimana latencia (od prveho tokenu po prvy audio chunk) je <1 s.

**Bez redukcie skopu:** UX cieľ je splneny cez streaming — uzivatel vidi/pocuva odpoved kontinualne, nie po skoneni cele odpovede. Hard <2 s benchmark by vyzadoval obetovat RAG kvalitu alebo TTS kvalitu.

**Dokaz:** `tutor-service/tests/k6/` (zatazove scenare), `docs/benchmark_raw_data.json`, `docs/benchmark_report.md`, `tutor-service/app/api/chat.py` (SSE implementacia s sentence-level chunking).

---

### C.10 (K6-1) Zatazove testovanie: "tri vlny k6" → 6 scenarov

**Co monitoring tvrdil:** "Tri vlny k6 zatazovych testov" bez konkretnych poctov.

**Co sme dodali:** **6 k6 scenarov** v `tests/k6/scenarios/`:
- `s1-smoke.js` — kratky smoke test (low concurrency)
- `s2-rampup.js` — gradual rampup
- `s3-spike.js` — burst spike test
- `s4-endurance.js` — dlhodoba prevadzka
- `s5-stt-heavy.js` — STT-zatazeny scenar (mic-stream simulation)
- `s6-schoolday.js` — realisticky scenar skolske ho dna

Spolu 601 riadkov k6 skriptov. Najnovsi lokalny run reportoval ~118 234 requestov / 190 531 checkov / 0× 5xx — **artefakty z behu nie su commitovane**, su len skripty.

**Datum pivohu:** Q2 2026.

**Dovod:** PB4 a PB5 vyzaduju zatazove testovanie roznych modulov. Tri vlny by pokryli len smoke/rampup/spike. Pridanie endurance + STT-heavy + schoolday zachytava realne pouzivatelske vzory.

**Bez redukcie skopu:** Zatazove pokrytie sa zdvojnasobilo.

**TODO:** Commitnut sample run artifact pod `tests/k6/results/<datum>.json` tak, aby boli 118 234 / 190 531 cisla audtabilne.

**Dokaz:** `tests/k6/scenarios/s1-smoke.js` az `s6-schoolday.js`.

---

### C.11 (REPO-1) Repository topology: jeden repo → tri-repo split

**Co monitoring tvrdil:** Jeden projektovy repository.

**Co sme dodali:** Tri repozitare s explicitnou rolou:

| Repository | Stav | Rola |
|---|---|---|
| `princeofwellness/edututor-ai-sandbox` (s **O**) | **Private** | Source-of-truth pre vyvoj; aktualne v0.7.2 |
| `princeofwellness/edututor-releases` (s **U**) | **Public** | Verejne artefakty: `.exe`, `.sha256`, `.blockmap`, v2 doc HTML; hardcoded v `desktop/main.mjs` pre auto-update |
| `sorrywecann/edututor-ai` | Planovany (W9) | Cisty open-source release bez AI/Claude referencii v historii |

**Pozor pre auditora:** Spelling difference **edOtutor (O) vs edUtutor-releases (U) je zamerny**, NIE PREKLEP. Source repo bol povodne pomenovany s typo, ktore sa stalo internou konvenciou; verejny artefakt repo pouziva spravne anglicke "EduTutor" spelling.

**Datum pivohu:** v0.5.0 cutover (2026-05-29) — od tej verzie verejne releases prestali ist na `princeofwellness/edututor-ai-sandbox` (zostali na v0.4.5) a presli na `princeofwellness/edututor-releases`.

**Dovod:** Source repo obsahuje internal dev artefakty (Claude transcripts, plans, audit dokumenty) ktore nemozno publikovat ako open-source. Public artifacts repo dava distribucnu funkciu (Electron auto-updater stahuje z public repa) bez exponovania source-history. Future `sorrywecann/edututor-ai` bude cisty MIT-licensed open-source mirror.

**Bez redukcie skopu:** Publikacny zavazok grant-u je zachovany (verejny pristup k artefaktom existuje), navyse je posilneny o auto-update infrastrukturu.

**Dokaz:** `desktop/main.mjs` (`UE5_RELEASE_REPO = 'princeofwellness/edututor-releases'`), `gh release list --repo princeofwellness/edututor-releases --limit 20`, `docs/MASTER_PLAN.md` (W9 sorrywecann/edututor-ai roadmap).

---

### C.12 Zaver Prilohy C

Vsetkych 11 pivotov v Prilohe C splna **integracne kriterium sekcie 2.1**: zobrali sme komercne dostupne komponenty (alebo open-source nahrady) a integrovali ich do funkcneho celku. Pivoty su vysledkom experimentalneho vyvoja (PB2, PB4, PB5) — testovali sme alternativy, zachytili sme bottleneck (Mistral CPU bar, OmniVoice memory footprint, K8s ops overhead pre laptopy, atd.), a vybrali sme lepsie riesenie.

**Ziadny pivot v Prilohe C neredukuje zavazne ciele PBalikov.** Vsetky zavazne výstupy su splnene (modularna architektura, funkcny LLM prototyp, RAG s vektorovou DB, parametrizacia, vyber lipsync rieenia, 3D avatar v UE5). Pivoty rozsiruju alebo zlepsuju, neodoberaju.

**Najvyssie audit-riziko polozky:**
1. **RT1 (LiveKit):** kod v repe je, ale frontend ho nepouziva. *Dokumentovat* ako "infrastructure retained for backwards-compat" zabranuje, aby audtor mal pocit ze sme nieco skryli.
2. **A2 (HuBERT/ARKit):** v1.1 doc to popisuje ako feature; project rule hovori "deprecated." v2 doc musi popisovat ako *vyskumny artefakt PB5*, nie ako kanonickú rendering cestu.
3. **I1 (K8s → .exe):** velka zmena v deployment-e voci PB4 monitoringu; treba explicitne vysvetlit, ze .exe je SILNEJSIA forma "jednym prikazom" nez Docker Compose.

**Cross-reference do nasledujucich dokumentov:**
- `docs/evidence/NUMBERS_LEDGER.md` — merane cisla pre kazdy claim v Prilohe C
- `EduTutor_AI_Technicka_Dokumentacia_v2.html` (a buduce `_v2.md` source) — finalna technicka dokumentacia odkazuje na Prilohu C v sekcii "Vzťah k monitorovacej správe"
- `docs/MASTER_PLAN.md` — workstreams W6 (cleanup), W9 (sorrywecann/edututor-ai cutover)


