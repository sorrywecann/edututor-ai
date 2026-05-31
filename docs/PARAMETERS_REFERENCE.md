# EduTutor.AI -- Master Parameter Reference

**Verzia:** v0.2  **Datum:** maj 2026
**Ucel:** Exhaustive katalog vsetkych konfiguracnych parametrov projektu.
Pre per-tier .env profily vid [`deploy/profiles/`](../deploy/profiles/).

## 1. Spôsob citania

| Stlpec | Vyznam |
|---|---|
| Parameter | Presny env var alebo `module.attribute` nazov |
| Default | Hodnota v zdrojovom kode / .env.example |
| Range/Values | Validne rozsahy alebo enum hodnoty |
| Tier | L (light 8GB) , M (macbook 16GB) , S (server 32GB+) , * (any) |
| Source | file:// link na zdrojovy riadok |

Sekcie 2-14 maju format SUROVA TABULKA → DETAIL BLOCKS. Surova tabulka sluzi ako quick reference; detail bloky vysvetluju dovody a override scenare.

---

## 2. LLM

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `OPENAI_API_KEY` | `` (unset) | `sk-proj-...` | * | `.env.example:10` |
| `OPENAI_MODEL` | `gpt-4o-mini` | napr. `gpt-4o`, `gpt-4o-mini` | * | `.env.example:11` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | URL (https://...) | * | `.env.example:14`; `llm_service.py:90` |
| `ANTHROPIC_API_KEY` | `` (unset) | `sk-ant-...` | * | `.env.example:19` |
| `ANTHROPIC_MODEL` | `claude-haiku-4-5-20251001` | `claude-haiku-4-5-*`, `claude-sonnet-4-*` | * | `.env.example:20` |
| `GROQ_API_KEY` | `` (unset) | `gsk_...` | * | `.env.example:23` |
| `OLLAMA_URL` | `http://localhost:11434/v1` | URL (http://...) | M/S | `.env.example:30` |
| `OLLAMA_MODEL` | `qwen2.5:7b` | napr. `gemma3:12b`, `mistral:latest` | M/S | `.env.example:31` |
| `VLLM_URL` | `http://localhost:8001/v1` | URL (http://...) | S | `.env.example:35` |
| `VLLM_MODEL` | `Qwen/Qwen2.5-32B-Instruct-AWQ` | lubovolny HF model | S | `.env.example:36` |
| `CUSTOM_LLM_QWEN3_URL` | `` (unset) | URL (http://...) | M/S | `.env.example:43` |
| `CUSTOM_LLM_QWEN3_KEY` | `ollama` | lubovolny string | M/S | `.env.example:44` |
| `CUSTOM_LLM_QWEN3_MODEL` | `qwen3-14b-sk` | lubovolny model ID | M/S | `.env.example:45` |
| `CUSTOM_LLM_DEEPSEEK_URL` | `https://api.deepseek.com/v1` | URL (https://...) | * | `tutor-service/.env:59` |
| `CUSTOM_LLM_DEEPSEEK_KEY` | `` (unset) | `sk-...` | * | `tutor-service/.env:60` |
| `CUSTOM_LLM_DEEPSEEK_MODEL` | `deepseek-chat` | `deepseek-chat`, `deepseek-reasoner` | * | `tutor-service/.env:61` |
| `CUSTOM_LLM_OPENROUTER_URL` | `https://openrouter.ai/api/v1` | URL (https://...) | * | `tutor-service/.env:24` |
| `CUSTOM_LLM_OPENROUTER_KEY` | `` (unset) | `sk-or-v1-...` | * | `tutor-service/.env:25` |
| `CUSTOM_LLM_OPENROUTER_MODEL` | `openai/gpt-4o-mini` | napr. `openai/gpt-4o`, `anthropic/claude-sonnet-4` | * | `tutor-service/.env:26` |
| `AZURE_LLM_API_KEY` | `` (unset) | Azure API key | * | `.env.example:156` |
| `AZURE_LLM_ENDPOINT` | `` (unset) | URL (https://...openai.azure.com) | * | `.env.example:157` |
| `AZURE_LLM_MODEL` | `gpt-4o` | napr. `gpt-4o`, `gpt-4o-mini` | * | `.env.example:158` |
| `CLAUDE_MODEL` | `claude-haiku-4-5-20251001` | legacy alias pre `ANTHROPIC_MODEL` | * | `.env.example:162` |
| `USE_LOCAL_LLM` | `false` | `true`/`false` | M/S | `.env.example:166` |
| `LLM_MODEL_NAME` (pydantic) | `mistralai/Mistral-7B-Instruct-v0.2` | lubovolny HF model ID | M/S | `tutor-service/app/config/llm_config.py:15` |
| `LLM_QUANTIZATION` (pydantic) | `4bit` | `4bit`, `8bit`, `none` | M/S | `tutor-service/app/config/llm_config.py:19` |
| `LLM_TEMPERATURE` (pydantic) | `0.6` | `0.0`--`2.0` | * | `tutor-service/app/config/llm_config.py:24` |
| `LLM_TOP_K` (pydantic) | `40` | `1`--`100` | * | `tutor-service/app/config/llm_config.py:30` |
| `LLM_TOP_P` (pydantic) | `0.9` | `0.0`--`1.0` | * | `tutor-service/app/config/llm_config.py:31` |
| `LLM_MAX_NEW_TOKENS` (pydantic) | `1024` | `1`--`4096` | * | `tutor-service/app/config/llm_config.py:34` |
| `LLM_REPETITION_PENALTY` (pydantic) | `1.1` | `1.0`--`2.0` | M/S | `tutor-service/app/config/llm_config.py:37` |
| `LLM_DO_SAMPLE` (pydantic) | `true` | `true`/`false` | * | `tutor-service/app/config/llm_config.py:40` |
| `LLM_CONTEXT_WINDOW` (pydantic) | `4096` | `>=1` | M/S | `tutor-service/app/config/llm_config.py:45` |
| `LLM_USE_FLASH_ATTENTION` (pydantic) | `true` | `true`/`false` | S | `tutor-service/app/config/llm_config.py:114` |
| `LLM_DEVICE_MAP` (pydantic) | `auto` | `auto`, `cuda:0`, `cpu` | M/S | `tutor-service/app/config/llm_config.py:117` |
| `LLM_TORCH_DTYPE` (pydantic) | `float16` | `float16`, `bfloat16`, `float32` | M/S | `tutor-service/app/config/llm_config.py:120` |
| `LLM_PROVIDER_AUTO_SELECT` (runtime) | `openai` (auto) | Priorita: openai > anthropic > custom:* > azure > ollama > local > mock | * | `tutor-service/app/services/llm_service.py:121-137` |

### Detailné parametre

#### `OPENAI_API_KEY`
- **Default:** `` (unset — must be configured)
- **Range:** OpenAI API key string `sk-proj-...`
- **Tier:** * (any)
- **Why this default:** Bez API kľúča sa OpenAI provider neaktivuje; backend padá na fallback (Anthropic → Groq → Ollama → mock). Tým sa neporušia text-only deployi alebo offline inštalácie. Defaultne nenastavené, lebo veľa lokálnych nasadení nepotrebuje OpenAI vôbec — Ollama je primárna lokálna voľba a Anthropic je aktuálny produkčný provider.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav ak chceš najlepšiu chat kvalitu bez GPU; alternatíva — `GROQ_API_KEY` (free tier, rýchlejší cold start).
  - **Tier M (macbook):** Voliteľné; Ollama na M1/M2/M3 je primárna voľba pre súkromie a offline prácu.
  - **Tier S (server):** Nastav iba pri "burst" scenároch — vLLM/Qwen3-14B-sk je primárna voľba pre produkciu.
- **Related:** `OPENAI_MODEL`, `OPENAI_BASE_URL`, `LLM_PROVIDER_AUTO_SELECT`
- **Source:** [`.env.example:10`](../.env.example), [`tutor-service/app/services/llm_service.py:121`](../tutor-service/app/services/llm_service.py)

---

#### `OPENAI_MODEL`
- **Default:** `gpt-4o-mini`
- **Range:** `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, alebo akýkoľvek OpenAI chat model
- **Tier:** * (any)
- **Why this default:** `gpt-4o-mini` je najlacnejší OpenAI model s dostatočnou kvalitou pre tutoring dialóg. `gpt-4o` je 10-20x drahší bez merateľného zlepšenia pre slovenský výukový kontext. Default šetrí náklady pri prototypovaní.
- **Override scenarios:**
  - **Tier L (laptop):** Zmeň na `gpt-4o` ak potrebuješ komplexné vysvetlenia alebo multi-step reasoning pre pokročilé témy.
  - **Tier M (macbook):** Ponechaj `gpt-4o-mini` alebo prepni na Ollama — OpenAI je záloha.
  - **Tier S (server):** Zvyčajne nepotrebné; vLLM/Qwen3 je primárny.
- **Related:** `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `ANTHROPIC_MODEL`
- **Source:** [`.env.example:11`](../.env.example)

---

#### `OPENAI_BASE_URL`
- **Default:** `https://api.openai.com/v1`
- **Range:** URL (https://...)
- **Tier:** * (any)
- **Why this default:** Štandardný OpenAI API endpoint. Zmeniteľné pre kompatibilné API (napr. Azure OpenAI, LiteLLM proxy, lokálny OpenAI-compatible server). Default zachováva priame spojenie s OpenAI bez proxy.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `http://localhost:11434/v1` pre Ollama s OpenAI-compatible API — bez zmeny kódu.
  - **Tier M (macbook):** Nastav na LiteLLM proxy URL ak chceš jednotný endpoint pre viacero providerov.
  - **Tier S (server):** Nastav na Azure OpenAI endpoint (`https://<resource>.openai.azure.com/openai/deployments/<deployment>/`) pre enterprise nasadenie.
- **Related:** `OPENAI_API_KEY`, `OPENAI_MODEL`, `OLLAMA_URL`
- **Source:** [`.env.example:14`](../.env.example), [`tutor-service/app/services/llm_service.py:90`](../tutor-service/app/services/llm_service.py)

---

#### `ANTHROPIC_API_KEY`
- **Default:** `` (unset)
- **Range:** Anthropic API key `sk-ant-...`
- **Tier:** * (any)
- **Why this default:** Anthropic provider je aktuálne primárny produkčný LLM (Claude Haiku 4.5). Kľúč je nenastavený v `.env.example` z bezpečnostných dôvodov — každý deploy musí explicitne nastaviť vlastný kľúč. Bez kľúča backend automaticky preskočí Anthropic a skúsi ďalší provider v poradí.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav pre najlepšiu kvalitu bez lokálneho GPU; Claude Haiku je rýchly a lacný.
  - **Tier M (macbook):** Odporúčané ako záloha k Ollama — pri výpadku lokálneho modelu sa automaticky prepne.
  - **Tier S (server):** Nastav pre burst scenáre alebo ako fallback k vLLM.
- **Related:** `ANTHROPIC_MODEL`, `CLAUDE_MODEL`, `LLM_PROVIDER_AUTO_SELECT`
- **Source:** [`.env.example:19`](../.env.example)

---

#### `ANTHROPIC_MODEL`
- **Default:** `claude-haiku-4-5-20251001`
- **Range:** `claude-haiku-4-5-*`, `claude-sonnet-4-*`, `claude-opus-4-*`
- **Tier:** * (any)
- **Why this default:** Claude Haiku 4.5 je aktuálne nasadený model v produkčnom systéme. Haiku je najrýchlejší a najlacnejší z Claude rodiny — vhodný pre real-time tutoring kde latencia je dôležitejšia ako maximálna presnosť. Sonnet/Opus sú 3-10x drahšie.
- **Override scenarios:**
  - **Tier L (laptop):** Zmeň na `claude-sonnet-4-5-20251001` pre komplexné matematické alebo vedecké vysvetlenia.
  - **Tier M (macbook):** Ponechaj Haiku; Ollama je primárna voľba.
  - **Tier S (server):** Zvyčajne nepotrebné; vLLM je primárny.
- **Related:** `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`
- **Source:** [`.env.example:20`](../.env.example)

---

#### `GROQ_API_KEY`
- **Default:** `` (unset)
- **Range:** Groq API key `gsk_...`
- **Tier:** * (any)
- **Why this default:** Groq je voliteľný provider s extrémne rýchlou inferenciou (LPU hardware). Nenastavený defaultne lebo nie je primárny provider — slúži ako lacná alternatíva k OpenAI pre Tier L deployi bez GPU. Free tier Groq je vhodný pre prototypovanie.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav ako primárny cloud provider ak nemáš OpenAI/Anthropic kľúč — Groq free tier je dostatočný pre demo.
  - **Tier M (macbook):** Voliteľné; Ollama je primárna.
  - **Tier S (server):** Zvyčajne nepotrebné.
- **Related:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `LLM_PROVIDER_AUTO_SELECT`
- **Source:** [`.env.example:23`](../.env.example)

---

#### `OLLAMA_URL`
- **Default:** `http://localhost:11434/v1`
- **Range:** URL (http://...)
- **Tier:** M/S
- **Why this default:** Ollama štandardne počúva na porte 11434. Default URL predpokladá lokálne nasadenie na rovnakom stroji ako backend. Pre Docker Compose nasadenie treba zmeniť na `http://ollama:11434/v1` (service name).
- **Override scenarios:**
  - **Tier M (macbook):** Ponechaj default pre lokálny Ollama; zmeň na `http://ollama:11434/v1` ak beží v Docker Compose.
  - **Tier S (server):** Nastav na IP/hostname dedikovaného Ollama servera ak beží na separátnom stroji.
- **Related:** `OLLAMA_MODEL`, `USE_LOCAL_LLM`, `VLLM_URL`
- **Source:** [`.env.example:30`](../.env.example)

---

#### `OLLAMA_MODEL`
- **Default:** `qwen2.5:7b`
- **Range:** `gemma3:12b`, `mistral:latest`, `llama3.2:3b`, akýkoľvek Ollama model tag
- **Tier:** M/S
- **Why this default:** Qwen2.5:7b je dobrý kompromis medzi kvalitou a rýchlosťou na M1/M2 MacBook (16GB RAM). Beží plynulo bez swapovania. Pre slovenčinu je Qwen2.5 lepší ako Mistral 7B vďaka väčšiemu multilingválnemu tréningovému datasetu.
- **Override scenarios:**
  - **Tier M (macbook):** Zmeň na `gemma3:12b` pre lepšiu kvalitu na M2 Pro/Max (32GB+); `llama3.2:3b` pre rýchlosť na 8GB.
  - **Tier S (server):** Zmeň na `qwen2.5:32b` alebo použi `VLLM_MODEL` namiesto Ollama.
- **Related:** `OLLAMA_URL`, `CUSTOM_LLM_QWEN3_MODEL`, `VLLM_MODEL`
- **Source:** [`.env.example:31`](../.env.example)

---

#### `VLLM_URL`
- **Default:** `http://localhost:8001/v1`
- **Range:** URL (http://...)
- **Tier:** S
- **Why this default:** vLLM štandardne počúva na porte 8001 (odlišný od Ollama 11434 aby mohli bežať súčasne). Default predpokladá lokálne nasadenie. Pre produkčný server s GPU je vLLM primárna voľba pre vysokú priepustnosť.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `http://vllm:8001/v1` pre Docker Compose; na `http://<gpu-server-ip>:8001/v1` pre vzdialený GPU server.
- **Related:** `VLLM_MODEL`, `OLLAMA_URL`, `CUSTOM_LLM_QWEN3_URL`
- **Source:** [`.env.example:35`](../.env.example)

---

#### `VLLM_MODEL`
- **Default:** `Qwen/Qwen2.5-32B-Instruct-AWQ`
- **Range:** Akýkoľvek HuggingFace model ID kompatibilný s vLLM
- **Tier:** S
- **Why this default:** Qwen2.5-32B-AWQ je odporúčaný model pre server tier — AWQ kvantizácia umožňuje beh na 2x A100 80GB alebo 1x H100. 32B parametrov poskytuje výrazne lepšiu kvalitu ako 7B modely pri slovenskom texte. AWQ je rýchlejší ako GPTQ pri porovnateľnej kvalite.
- **Override scenarios:**
  - **Tier S (server):** Zmeň na `Qwen/Qwen2.5-14B-Instruct-AWQ` pre single A100 40GB; na `Qwen/Qwen3-14B-sk` pre slovensky fine-tuned model.
- **Related:** `VLLM_URL`, `CUSTOM_LLM_QWEN3_MODEL`
- **Source:** [`.env.example:36`](../.env.example)

---

#### `CUSTOM_LLM_QWEN3_URL`
- **Default:** `` (unset)
- **Range:** URL (http://...)
- **Tier:** M/S
- **Why this default:** Qwen3-14B-sk je slovensky fine-tuned model nasadený cez vLLM alebo Ollama. URL je nenastavené lebo model nie je súčasťou štandardného deployu — vyžaduje manuálne stiahnutie a nasadenie. Keď je nastavené, provider auto-select ho uprednostní pred generickým Qwen2.5.
- **Override scenarios:**
  - **Tier M (macbook):** Nastav na `http://localhost:11434/v1` ak beží Qwen3-sk cez Ollama.
  - **Tier S (server):** Nastav na `http://localhost:8001/v1` ak beží cez vLLM na GPU.
- **Related:** `CUSTOM_LLM_QWEN3_KEY`, `CUSTOM_LLM_QWEN3_MODEL`, `VLLM_URL`
- **Source:** [`.env.example:43`](../.env.example)

---

#### `CUSTOM_LLM_QWEN3_KEY`
- **Default:** `ollama`
- **Range:** Akýkoľvek string (API key alebo placeholder)
- **Tier:** M/S
- **Why this default:** Ollama nevyžaduje skutočný API kľúč — akceptuje akýkoľvek non-empty string. Default `ollama` je konvencia pre lokálne OpenAI-compatible servery. Pre vLLM bez autentifikácie funguje rovnako.
- **Override scenarios:**
  - **Tier S (server):** Nastav na skutočný API kľúč ak vLLM beží s `--api-key` parametrom pre bezpečnosť.
- **Related:** `CUSTOM_LLM_QWEN3_URL`, `CUSTOM_LLM_QWEN3_MODEL`
- **Source:** [`.env.example:44`](../.env.example)

---

#### `CUSTOM_LLM_QWEN3_MODEL`
- **Default:** `qwen3-14b-sk`
- **Range:** Akýkoľvek model ID registrovaný v Ollama/vLLM
- **Tier:** M/S
- **Why this default:** `qwen3-14b-sk` je interný identifikátor slovensky fine-tuned modelu. Musí zodpovedať názvu modelu tak, ako ho vidí Ollama (`ollama list`) alebo vLLM (`/v1/models`).
- **Override scenarios:**
  - **Tier M (macbook):** Zmeň na presný tag z `ollama list` — napr. `qwen3-14b-sk:latest`.
  - **Tier S (server):** Zmeň na HF model ID ak vLLM načítava priamo z HuggingFace.
- **Related:** `CUSTOM_LLM_QWEN3_URL`, `CUSTOM_LLM_QWEN3_KEY`
- **Source:** [`.env.example:45`](../.env.example)

---

#### `CUSTOM_LLM_DEEPSEEK_URL`
- **Default:** `https://api.deepseek.com/v1`
- **Range:** URL (https://...)
- **Tier:** * (any)
- **Why this default:** DeepSeek API je OpenAI-compatible — rovnaký klient, iný endpoint. Default URL je oficiálny DeepSeek API endpoint. Provider je voliteľný a aktivuje sa len keď je nastavený `CUSTOM_LLM_DEEPSEEK_KEY`.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav kľúč pre lacnú alternatívu k OpenAI — DeepSeek-chat je cenovo výhodný pre dlhé konverzácie.
- **Related:** `CUSTOM_LLM_DEEPSEEK_KEY`, `CUSTOM_LLM_DEEPSEEK_MODEL`
- **Source:** [`tutor-service/.env:59`](../tutor-service/.env)

---

#### `CUSTOM_LLM_DEEPSEEK_KEY`
- **Default:** `` (unset)
- **Range:** DeepSeek API key `sk-...`
- **Tier:** * (any)
- **Why this default:** Nenastavené lebo DeepSeek nie je primárny provider. Aktivuje sa explicitne pre scenáre kde je cena prioritou (DeepSeek je výrazne lacnejší ako GPT-4o).
- **Override scenarios:**
  - **Tier L (laptop):** Nastav pre lacný cloud LLM bez GPU požiadaviek.
- **Related:** `CUSTOM_LLM_DEEPSEEK_URL`, `CUSTOM_LLM_DEEPSEEK_MODEL`
- **Source:** [`tutor-service/.env:60`](../tutor-service/.env)

---

#### `CUSTOM_LLM_DEEPSEEK_MODEL`
- **Default:** `deepseek-chat`
- **Range:** `deepseek-chat`, `deepseek-reasoner`
- **Tier:** * (any)
- **Why this default:** `deepseek-chat` je všeobecný model vhodný pre tutoring. `deepseek-reasoner` (R1) je pomalší ale lepší pre matematické úlohy — vhodný pre STEM predmety.
- **Override scenarios:**
  - **Tier L (laptop):** Zmeň na `deepseek-reasoner` pre matematiku/fyziku kde step-by-step reasoning je dôležitý.
- **Related:** `CUSTOM_LLM_DEEPSEEK_KEY`, `CUSTOM_LLM_DEEPSEEK_URL`
- **Source:** [`tutor-service/.env:61`](../tutor-service/.env)

---

#### `CUSTOM_LLM_OPENROUTER_URL`
- **Default:** `https://openrouter.ai/api/v1`
- **Range:** URL (https://...)
- **Tier:** * (any)
- **Why this default:** OpenRouter je agregátor LLM providerov s jednotným OpenAI-compatible API. Default URL je oficiálny endpoint. Aktivuje sa len keď je nastavený `CUSTOM_LLM_OPENROUTER_KEY`.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav kľúč pre prístup k stovkám modelov cez jeden endpoint — vhodné pre experimentovanie.
- **Related:** `CUSTOM_LLM_OPENROUTER_KEY`, `CUSTOM_LLM_OPENROUTER_MODEL`
- **Source:** [`tutor-service/.env:24`](../tutor-service/.env)

---

#### `CUSTOM_LLM_OPENROUTER_KEY`
- **Default:** `` (unset)
- **Range:** OpenRouter API key `sk-or-v1-...`
- **Tier:** * (any)
- **Why this default:** Nenastavené lebo OpenRouter nie je primárny provider. Vhodný pre A/B testovanie rôznych modelov bez zmeny infraštruktúry.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav pre prístup k free-tier modelom cez OpenRouter (napr. Llama 3.1 8B zadarmo).
- **Related:** `CUSTOM_LLM_OPENROUTER_URL`, `CUSTOM_LLM_OPENROUTER_MODEL`
- **Source:** [`tutor-service/.env:25`](../tutor-service/.env)

---

#### `CUSTOM_LLM_OPENROUTER_MODEL`
- **Default:** `openai/gpt-4o-mini`
- **Range:** Akýkoľvek OpenRouter model slug (napr. `anthropic/claude-sonnet-4`, `meta-llama/llama-3.1-8b-instruct:free`)
- **Tier:** * (any)
- **Why this default:** `openai/gpt-4o-mini` je lacný a spoľahlivý model dostupný cez OpenRouter. Default zachováva konzistentné správanie s priamym OpenAI providerom.
- **Override scenarios:**
  - **Tier L (laptop):** Zmeň na `meta-llama/llama-3.1-8b-instruct:free` pre bezplatné testovanie.
- **Related:** `CUSTOM_LLM_OPENROUTER_KEY`, `CUSTOM_LLM_OPENROUTER_URL`
- **Source:** [`tutor-service/.env:26`](../tutor-service/.env)

---

#### `AZURE_LLM_API_KEY`
- **Default:** `` (unset)
- **Range:** Azure OpenAI API key
- **Tier:** * (any)
- **Why this default:** Azure OpenAI je enterprise provider — vyžaduje Azure subscription a deployment. Nenastavené defaultne lebo väčšina nasadení používa priamy OpenAI alebo Anthropic. Vhodné pre organizácie s Azure enterprise zmluvou a GDPR požiadavkami na dátovú rezidenciu.
- **Override scenarios:**
  - **Tier S (server):** Nastav pre enterprise nasadenie s Azure data residency (EU region) — dôležité pre GDPR compliance v školskom prostredí.
- **Related:** `AZURE_LLM_ENDPOINT`, `AZURE_LLM_MODEL`
- **Source:** [`.env.example:156`](../.env.example)

---

#### `AZURE_LLM_ENDPOINT`
- **Default:** `` (unset)
- **Range:** URL (https://...openai.azure.com)
- **Tier:** * (any)
- **Why this default:** Nenastavené lebo Azure endpoint je unikátny pre každý Azure resource. Formát: `https://<resource-name>.openai.azure.com/openai/deployments/<deployment-name>/`.
- **Override scenarios:**
  - **Tier S (server):** Nastav spolu s `AZURE_LLM_API_KEY` pre enterprise Azure nasadenie.
- **Related:** `AZURE_LLM_API_KEY`, `AZURE_LLM_MODEL`
- **Source:** [`.env.example:157`](../.env.example)

---

#### `AZURE_LLM_MODEL`
- **Default:** `gpt-4o`
- **Range:** `gpt-4o`, `gpt-4o-mini`, akýkoľvek Azure deployment name
- **Tier:** * (any)
- **Why this default:** `gpt-4o` je najčastejší Azure OpenAI deployment pre produkčné použitie. V Azure kontexte toto pole zodpovedá deployment name, nie model name.
- **Override scenarios:**
  - **Tier S (server):** Nastav na presný deployment name z Azure portálu — musí zodpovedať `<deployment-name>` v endpoint URL.
- **Related:** `AZURE_LLM_API_KEY`, `AZURE_LLM_ENDPOINT`
- **Source:** [`.env.example:158`](../.env.example)

---

#### `CLAUDE_MODEL`
- **Default:** `claude-haiku-4-5-20251001`
- **Range:** Akýkoľvek Claude model ID (legacy alias)
- **Tier:** * (any)
- **Why this default:** Legacy alias pre `ANTHROPIC_MODEL` — zachovaný pre spätnu kompatibilitu so staršími `.env` súbormi. Nové nasadenia by mali používať `ANTHROPIC_MODEL`. Oba parametre sú čítané rovnakým kódom; `ANTHROPIC_MODEL` má prednosť.
- **Override scenarios:**
  - Neodporúča sa nastavovať — použi `ANTHROPIC_MODEL` namiesto toho.
- **Related:** `ANTHROPIC_MODEL`, `ANTHROPIC_API_KEY`
- **Source:** [`.env.example:162`](../.env.example)
- **Notes:** Deprecated alias. Použi `ANTHROPIC_MODEL`.

---

#### `USE_LOCAL_LLM`
- **Default:** `false`
- **Range:** `true`/`false`
- **Tier:** M/S
- **Why this default:** `false` zachováva cloud-first správanie — backend sa pokúsi o cloud provider pred lokálnym. Nastavenie na `true` presmeruje auto-select logiku na Ollama/vLLM ako primárnu voľbu. Vhodné pre offline nasadenia alebo nasadenia s dôrazom na súkromie.
- **Override scenarios:**
  - **Tier M (macbook):** Nastav na `true` pre plne offline tutoring — všetky požiadavky idú cez Ollama.
  - **Tier S (server):** Nastav na `true` pre air-gapped školské siete bez internetu.
- **Related:** `OLLAMA_URL`, `OLLAMA_MODEL`, `VLLM_URL`, `LLM_PROVIDER_AUTO_SELECT`
- **Source:** [`.env.example:166`](../.env.example)

---

#### `LLM_MODEL_NAME` (pydantic)
- **Default:** `mistralai/Mistral-7B-Instruct-v0.2`
- **Range:** Akýkoľvek HuggingFace model ID
- **Tier:** M/S
- **Why this default:** Mistral 7B bol pôvodný lokálny model pred integráciou Ollama/vLLM. Tento parameter je pre priame HuggingFace Transformers načítanie (nie cez Ollama API). V praxi sa používa zriedka — Ollama/vLLM sú preferované pre jednoduchšiu správu modelov.
- **Override scenarios:**
  - **Tier M (macbook):** Zmeň na `google/gemma-2-9b-it` ak chceš priame HF načítanie bez Ollama.
  - **Tier S (server):** Zvyčajne nepotrebné — použi `VLLM_MODEL`.
- **Related:** `LLM_QUANTIZATION`, `LLM_DEVICE_MAP`, `OLLAMA_MODEL`
- **Source:** [`tutor-service/app/config/llm_config.py:15`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_QUANTIZATION` (pydantic)
- **Default:** `4bit`
- **Range:** `4bit`, `8bit`, `none`
- **Tier:** M/S
- **Why this default:** 4-bit kvantizácia (bitsandbytes) umožňuje beh 7B modelu na 6GB VRAM namiesto 14GB. Pre MacBook s unified memory je 4bit kľúčový pre beh bez swapovania. Kvalita je mierne nižšia ako `none` ale rozdiel je v tutoring kontexte zanedbateľný.
- **Override scenarios:**
  - **Tier M (macbook):** Zmeň na `8bit` pre lepšiu kvalitu ak máš 32GB+ unified memory.
  - **Tier S (server):** Nastav na `none` pre plnú presnosť na A100/H100 s dostatkom VRAM.
- **Related:** `LLM_MODEL_NAME`, `LLM_TORCH_DTYPE`, `LLM_DEVICE_MAP`
- **Source:** [`tutor-service/app/config/llm_config.py:19`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_TEMPERATURE` (pydantic)
- **Default:** `0.6`
- **Range:** `0.0`--`2.0`
- **Tier:** * (any)
- **Why this default:** `0.6` je kompromis medzi deterministickosťou (0.0) a kreativitou (1.0+). Pre tutoring je dôležité aby odpovede boli konzistentné a fakticky správne — príliš vysoká teplota zvyšuje halucinácie. `0.6` zachováva prirodzený jazykový štýl bez nadmernej variability.
- **Override scenarios:**
  - **Tier L (laptop):** Zníž na `0.3` pre fakticky náročné predmety (matematika, história); zvýš na `0.8` pre kreatívne písanie.
  - **Tier S (server):** Ponechaj default; fine-tuning teploty je na úrovni learning mode konfigurácie.
- **Related:** `LLM_TOP_P`, `LLM_TOP_K`, `LLM_DO_SAMPLE`
- **Source:** [`tutor-service/app/config/llm_config.py:24`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_TOP_K` (pydantic)
- **Default:** `40`
- **Range:** `1`--`100`
- **Tier:** * (any)
- **Why this default:** Top-K=40 obmedzuje výber na 40 najpravdepodobnejších tokenov pri každom kroku. Znižuje pravdepodobnosť nezmyselných výstupov bez nadmerného obmedzenia slovnej zásoby. Štandardná hodnota pre inštruktážne modely.
- **Override scenarios:**
  - **Tier L (laptop):** Zníž na `20` pre konzistentnejšie odpovede; zvýš na `60` pre bohatší jazyk.
- **Related:** `LLM_TOP_P`, `LLM_TEMPERATURE`, `LLM_DO_SAMPLE`
- **Source:** [`tutor-service/app/config/llm_config.py:30`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_TOP_P` (pydantic)
- **Default:** `0.9`
- **Range:** `0.0`--`1.0`
- **Tier:** * (any)
- **Why this default:** Nucleus sampling s p=0.9 zachytí 90% pravdepodobnostnej hmoty tokenov. Kombinuje sa s Top-K — platí prísnejší z oboch filtrov. `0.9` je štandardná hodnota odporúčaná väčšinou model kariet pre inštruktážne modely.
- **Override scenarios:**
  - **Tier L (laptop):** Zníž na `0.85` pre faktické predmety; ponechaj `0.9` pre konverzačný štýl.
- **Related:** `LLM_TOP_K`, `LLM_TEMPERATURE`
- **Source:** [`tutor-service/app/config/llm_config.py:31`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_MAX_NEW_TOKENS` (pydantic)
- **Default:** `1024`
- **Range:** `1`--`4096`
- **Tier:** * (any)
- **Why this default:** 1024 tokenov je dostatočných pre väčšinu tutoring odpovedí (cca 750 slov). Vyššia hodnota zvyšuje latenciu a náklady. Pre cloud providery (OpenAI/Anthropic) tento parameter mapuje na `max_tokens` v API požiadavke.
- **Override scenarios:**
  - **Tier L (laptop):** Zníž na `512` pre rýchlejšie odpovede pri jednoduchých otázkach.
  - **Tier S (server):** Zvýš na `2048` pre dlhé vysvetlenia alebo generovanie cvičení.
- **Related:** `LLM_CONTEXT_WINDOW`, `LLM_TEMPERATURE`
- **Source:** [`tutor-service/app/config/llm_config.py:34`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_REPETITION_PENALTY` (pydantic)
- **Default:** `1.1`
- **Range:** `1.0`--`2.0`
- **Tier:** M/S
- **Why this default:** Penalizácia 1.1 mierne znižuje pravdepodobnosť opakovania rovnakých fráz. Pre lokálne modely (Ollama/vLLM) je repetition penalty dôležitá — open-source modely majú väčšiu tendenciu k opakovaniu ako GPT-4o. Pre cloud API (OpenAI/Anthropic) tento parameter nemá efekt.
- **Override scenarios:**
  - **Tier M (macbook):** Zvýš na `1.2` ak lokálny model opakuje vety; zníž na `1.0` ak odpovede sú príliš "skákavé".
- **Related:** `LLM_TEMPERATURE`, `LLM_DO_SAMPLE`
- **Source:** [`tutor-service/app/config/llm_config.py:37`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_DO_SAMPLE` (pydantic)
- **Default:** `true`
- **Range:** `true`/`false`
- **Tier:** * (any)
- **Why this default:** `true` aktivuje stochastické vzorkovanie (temperature/top-k/top-p majú efekt). `false` by použilo greedy decoding — deterministické ale monotónne odpovede. Pre tutoring je prirodzená variabilita žiaduca.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `false` pre plne deterministické odpovede pri testovaní/debugovaní.
- **Related:** `LLM_TEMPERATURE`, `LLM_TOP_K`, `LLM_TOP_P`
- **Source:** [`tutor-service/app/config/llm_config.py:40`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_CONTEXT_WINDOW` (pydantic)
- **Default:** `4096`
- **Range:** `>=1`
- **Tier:** M/S
- **Why this default:** 4096 tokenov je bezpečný default pre väčšinu 7B modelov. Moderné modely (Qwen2.5, Llama 3.2) podporujú 32K-128K kontextové okno, ale väčší kontext zvyšuje pamäťové nároky. Pre tutoring konverzácie je 4096 dostatočných pre ~10 výmen.
- **Override scenarios:**
  - **Tier M (macbook):** Zvýš na `8192` pre Qwen2.5:7b (podporuje 32K); na `32768` pre dlhé dokumentové RAG sessiony.
  - **Tier S (server):** Nastav podľa modelu — Qwen2.5-32B podporuje 128K.
- **Related:** `LLM_MAX_NEW_TOKENS`, `memory.MAX_TURNS`
- **Source:** [`tutor-service/app/config/llm_config.py:45`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_USE_FLASH_ATTENTION` (pydantic)
- **Default:** `true`
- **Range:** `true`/`false`
- **Tier:** S
- **Why this default:** Flash Attention 2 výrazne znižuje pamäťové nároky a zvyšuje rýchlosť pre dlhé sekvencie na CUDA GPU. Defaultne `true` pre server tier kde CUDA je predpokladaná. Na CPU alebo Apple Silicon nemá efekt (automaticky ignorované).
- **Override scenarios:**
  - **Tier S (server):** Nastav na `false` ak Flash Attention nie je nainštalovaný (`pip install flash-attn` zlyhá na niektorých CUDA verziách).
- **Related:** `LLM_DEVICE_MAP`, `LLM_TORCH_DTYPE`
- **Source:** [`tutor-service/app/config/llm_config.py:114`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_DEVICE_MAP` (pydantic)
- **Default:** `auto`
- **Range:** `auto`, `cuda:0`, `cpu`
- **Tier:** M/S
- **Why this default:** `auto` nechá HuggingFace Accelerate automaticky rozdeliť model medzi dostupné zariadenia (GPU/CPU). Pre single-GPU server je `auto` ekvivalentné `cuda:0`. Pre MacBook s MPS je `auto` správna voľba.
- **Override scenarios:**
  - **Tier M (macbook):** Ponechaj `auto`; MPS backend sa aktivuje automaticky.
  - **Tier S (server):** Nastav na `cuda:0` pre explicitné priradenie k prvej GPU; `cuda:0,1` pre multi-GPU.
- **Related:** `LLM_TORCH_DTYPE`, `LLM_USE_FLASH_ATTENTION`
- **Source:** [`tutor-service/app/config/llm_config.py:117`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_TORCH_DTYPE` (pydantic)
- **Default:** `float16`
- **Range:** `float16`, `bfloat16`, `float32`
- **Tier:** M/S
- **Why this default:** `float16` je štandardný dtype pre GPU inferenciu — dobrý kompromis medzi presnosťou a pamäťou. `bfloat16` je lepší pre tréning a niektoré Ampere+ GPU architektúry. `float32` je príliš pamäťovo náročný pre produkciu.
- **Override scenarios:**
  - **Tier M (macbook):** Zmeň na `float32` pre MPS backend ak `float16` spôsobuje NaN hodnoty (známy problém na niektorých M1 konfiguráciách).
  - **Tier S (server):** Zmeň na `bfloat16` pre A100/H100 — lepšia numerická stabilita pri dlhých sekvenciách.
- **Related:** `LLM_DEVICE_MAP`, `LLM_QUANTIZATION`
- **Source:** [`tutor-service/app/config/llm_config.py:120`](../tutor-service/app/config/llm_config.py)

---

#### `LLM_PROVIDER_AUTO_SELECT` (runtime)
- **Default:** `openai` (auto — závisí od nastavených kľúčov)
- **Range:** Priorita: `openai` > `anthropic` > `custom:*` > `azure` > `ollama` > `local` > `mock`
- **Tier:** * (any)
- **Why this default:** Auto-select logika prechádza providermi v poradí priority a vyberie prvý s platným kľúčom/URL. Aktuálne produkčné nasadenie beží s Anthropic (Claude Haiku 4.5) ako primárnym providerom. Mock provider je posledná záchrana — vráti priateľskú chybovú správu namiesto 500. Viď [ADR-001](adrs/001-asymmetric-DI.md) pre DI architektúru.
- **Override scenarios:**
  - Nie je priamo konfigurovateľné cez env — ovládané nastavením/nenastavením príslušných kľúčov.
- **Related:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_URL`, `USE_LOCAL_LLM`
- **Source:** [`tutor-service/app/services/llm_service.py:121-137`](../tutor-service/app/services/llm_service.py)

---

## 3. STT

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `STT_PROVIDER` | `` (auto-detect) | `mlx-whisper-turbo`, `mlx-whisper-large-v3`, `faster-whisper-sk-small`, `faster-whisper-large-v3`, `whisper-medical-Cardiologist`, `whisper-medical-Pulmonologist`, `whisper-medical-General`, `groq-whisper` | * | `.env.example:59`; `tutor-service/app/services/stt_service.py:117-225` |
| `USE_LOCAL_STT` | `false` | `true`/`false` | M/S | `.env.example:167`; `tutor-service/.env:31` |
| `WHISPER_MODEL_ID` | `erikbozik/whisper-small-sk` | lubovolny HF whisper model ID | M/S | `tutor-service/.env:32` |
| `STT_AUTO_DETECT_APPLE_SILICON` (runtime) | `mlx-whisper-turbo` | ak `import mlx_whisper` uspeje | M | `tutor-service/app/services/stt_service.py:287-288` |
| `STT_AUTO_DETECT_CUDA` (runtime) | `faster-whisper-large-v3` | ak `import faster_whisper` + CUDA | S | `tutor-service/app/services/stt_service.py:293-294` |
| `STT_AUTO_DETECT_CPU` (runtime) | `faster-whisper-sk-small` | fallback pre CPU-only | L/M | `tutor-service/app/services/stt_service.py:301-302` |
| `faster-whisper compute_type (CUDA)` | `float16` | `float16`, `int8_float16` | S | `tutor-service/app/services/stt_service.py:402` |
| `faster-whisper compute_type (CPU)` | `int8` | `int8`, `int8_float16` | L/M | `tutor-service/app/services/stt_service.py:406` |
| `STT_AZURE_SPEECH_KEY` | `` (unset) | Azure Speech API key | * | `.env.example:70` |
| `STT_AZURE_SPEECH_REGION` | `westeurope` | Azure region | * | `.env.example:71` |

### Detailné parametre

#### `STT_PROVIDER`
- **Default:** `` (auto-detect)
- **Range:** `mlx-whisper-turbo`, `mlx-whisper-large-v3`, `faster-whisper-sk-small`, `faster-whisper-large-v3`, `whisper-medical-Cardiologist`, `whisper-medical-Pulmonologist`, `whisper-medical-General`, `groq-whisper`
- **Tier:** * (any)
- **Why this default:** Prázdny string spustí auto-detekciu: Apple Silicon → `mlx-whisper-turbo`, CUDA → `faster-whisper-large-v3`, CPU → `faster-whisper-sk-small`. Auto-detekcia eliminuje potrebu manuálnej konfigurácie pre väčšinu nasadení. Explicitné nastavenie je potrebné len pre špecializované scenáre (medicínske modely, Groq cloud STT).
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `groq-whisper` pre cloud STT bez lokálneho modelu (vyžaduje `GROQ_API_KEY`).
  - **Tier M (macbook):** Nastav na `mlx-whisper-large-v3` pre vyššiu presnosť na M2 Pro/Max.
  - **Tier S (server):** Nastav na `faster-whisper-large-v3` pre maximálnu presnosť na CUDA GPU.
- **Related:** `USE_LOCAL_STT`, `WHISPER_MODEL_ID`, `GROQ_API_KEY`
- **Source:** [`.env.example:59`](../.env.example), [`tutor-service/app/services/stt_service.py:117-225`](../tutor-service/app/services/stt_service.py)

---

#### `USE_LOCAL_STT`
- **Default:** `false`
- **Range:** `true`/`false`
- **Tier:** M/S
- **Why this default:** `false` zachováva cloud-first správanie pre STT. Nastavenie na `true` presmeruje na lokálny Whisper model (cez `WHISPER_MODEL_ID`). Pre väčšinu nasadení je auto-detekcia (`STT_PROVIDER` prázdny) lepšia voľba ako tento flag.
- **Override scenarios:**
  - **Tier M (macbook):** Nastav na `true` pre plne offline STT — kombinuj s `WHISPER_MODEL_ID=erikbozik/whisper-small-sk`.
  - **Tier S (server):** Nastav na `true` pre air-gapped nasadenie.
- **Related:** `STT_PROVIDER`, `WHISPER_MODEL_ID`
- **Source:** [`.env.example:167`](../.env.example), [`tutor-service/.env:31`](../tutor-service/.env)

---

#### `WHISPER_MODEL_ID`
- **Default:** `erikbozik/whisper-small-sk`
- **Range:** Akýkoľvek HuggingFace Whisper model ID
- **Tier:** M/S
- **Why this default:** `erikbozik/whisper-small-sk` je slovensky fine-tuned Whisper Small model — výrazne lepší pre slovenčinu ako generický `openai/whisper-small`. Small veľkosť (244M parametrov) beží rýchlo aj na CPU. Stiahne sa automaticky z HuggingFace pri prvom spustení.
- **Override scenarios:**
  - **Tier M (macbook):** Zmeň na `erikbozik/whisper-medium-sk` pre lepšiu presnosť na M2 Pro (ak existuje).
  - **Tier S (server):** Zmeň na `openai/whisper-large-v3` pre maximálnu presnosť na CUDA GPU.
- **Related:** `USE_LOCAL_STT`, `STT_PROVIDER`, `HF_HOME`
- **Source:** [`tutor-service/.env:32`](../tutor-service/.env)

---

#### `STT_AUTO_DETECT_APPLE_SILICON` (runtime)
- **Default:** `mlx-whisper-turbo` (ak `import mlx_whisper` uspeje)
- **Range:** Automaticky detekovaný
- **Tier:** M
- **Why this default:** MLX Whisper Turbo je optimalizovaný pre Apple Neural Engine — 3-5x rýchlejší ako CPU Whisper na M1/M2/M3. Auto-detekcia cez `import mlx_whisper` je bezpečná — ak knižnica nie je nainštalovaná, fallback pokračuje bez chyby.
- **Override scenarios:**
  - Nie je priamo konfigurovateľné — ovládané inštaláciou `mlx-whisper` balíčka.
- **Related:** `STT_PROVIDER`, `STT_AUTO_DETECT_CUDA`
- **Source:** [`tutor-service/app/services/stt_service.py:287-288`](../tutor-service/app/services/stt_service.py)

---

#### `STT_AUTO_DETECT_CUDA` (runtime)
- **Default:** `faster-whisper-large-v3` (ak `import faster_whisper` + CUDA)
- **Range:** Automaticky detekovaný
- **Tier:** S
- **Why this default:** Faster Whisper Large v3 na CUDA je najrýchlejší a najpresnejší open-source STT pre slovenčinu. CTranslate2 backend je 4x rýchlejší ako pôvodný Whisper pri rovnakej presnosti.
- **Override scenarios:**
  - Nie je priamo konfigurovateľné — ovládané dostupnosťou CUDA a `faster-whisper` balíčka.
- **Related:** `STT_PROVIDER`, `STT_AUTO_DETECT_CPU`
- **Source:** [`tutor-service/app/services/stt_service.py:293-294`](../tutor-service/app/services/stt_service.py)

---

#### `STT_AUTO_DETECT_CPU` (runtime)
- **Default:** `faster-whisper-sk-small` (fallback pre CPU-only)
- **Range:** Automaticky detekovaný
- **Tier:** L/M
- **Why this default:** CPU fallback používa Small model pre prijateľnú latenciu na CPU (cca 2-5s pre 10s audio). Large v3 na CPU by trvalo 30-60s — nepoužiteľné pre real-time tutoring.
- **Override scenarios:**
  - Nie je priamo konfigurovateľné — aktivuje sa keď nie je dostupné MLX ani CUDA.
- **Related:** `STT_PROVIDER`, `STT_AUTO_DETECT_APPLE_SILICON`
- **Source:** [`tutor-service/app/services/stt_service.py:301-302`](../tutor-service/app/services/stt_service.py)

---

#### `faster-whisper compute_type (CUDA)`
- **Default:** `float16`
- **Range:** `float16`, `int8_float16`
- **Tier:** S
- **Why this default:** `float16` je štandardný dtype pre CUDA inferenciu — maximálna presnosť pri rozumnej pamäti. `int8_float16` (mixed precision) je rýchlejší ale mierne menej presný — vhodný pre high-throughput scenáre.
- **Override scenarios:**
  - **Tier S (server):** Zmeň na `int8_float16` pre 2x vyššiu priepustnosť pri miernom znížení presnosti.
- **Related:** `faster-whisper compute_type (CPU)`, `STT_PROVIDER`
- **Source:** [`tutor-service/app/services/stt_service.py:402`](../tutor-service/app/services/stt_service.py)

---

#### `faster-whisper compute_type (CPU)`
- **Default:** `int8`
- **Range:** `int8`, `int8_float16`
- **Tier:** L/M
- **Why this default:** `int8` kvantizácia je nevyhnutná pre rozumnú rýchlosť na CPU — bez nej by inferencia trvala minúty. CPU nepodporuje `float16` natívne; `int8` je najrýchlejší dostupný dtype.
- **Override scenarios:**
  - **Tier L (laptop):** Ponechaj `int8` — iné možnosti sú pomalšie alebo nepodporované.
- **Related:** `faster-whisper compute_type (CUDA)`, `STT_PROVIDER`
- **Source:** [`tutor-service/app/services/stt_service.py:406`](../tutor-service/app/services/stt_service.py)

---

#### `STT_AZURE_SPEECH_KEY`
- **Default:** `` (unset)
- **Range:** Azure Speech API key
- **Tier:** * (any)
- **Why this default:** Azure Speech je cloud STT provider — voliteľný, nenastavený defaultne. Vhodný pre enterprise nasadenia kde je Azure Speech súčasťou existujúcej Azure subscription. Lokálne Whisper modely sú preferované pre súkromie a offline použitie.
- **Override scenarios:**
  - **Tier S (server):** Nastav pre enterprise nasadenie s Azure Speech — lepšia slovenčina ako generický Whisper v niektorých doménach.
- **Related:** `STT_AZURE_SPEECH_REGION`, `STT_PROVIDER`
- **Source:** [`.env.example:70`](../.env.example)

---

#### `STT_AZURE_SPEECH_REGION`
- **Default:** `westeurope`
- **Range:** Azure region string
- **Tier:** * (any)
- **Why this default:** `westeurope` je najbližší Azure región pre slovenské nasadenia — minimálna latencia pre EU používateľov. Dôležité aj pre GDPR — dáta zostávajú v EU.
- **Override scenarios:**
  - **Tier S (server):** Zmeň na `northeurope` alebo `germanywestcentral` ak máš Azure resource v inom regióne.
- **Related:** `STT_AZURE_SPEECH_KEY`
- **Source:** [`.env.example:71`](../.env.example)

---

## 4. TTS

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `USE_EDGE_TTS` | `true` | `true`/`false` | * | `.env.example:65`; `tutor-service/app/services/tts_service.py:118` |
| `EDGE_TTS_VOICE` | `sk-SK-LukasNeural` | lubovolne Edge TTS voice ID | * | `.env.example:66`; `tutor-service/app/services/tts_service.py:123` |
| `TTS_PROVIDER` (pydantic) | `edge` (auto) | `edge`, `openai`, `azure`, `piper`, `kokoro`, `omnivoice`, `google`, `mock` | * | `tutor-service/app/config/tts_config.py:15`; `tutor-service/app/services/tts_service.py:121-141` |
| `TTS_OPENAI_TTS_VOICE` (pydantic) | `nova` | `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer` | * | `tutor-service/app/config/tts_config.py:20` |
| `TTS_OPENAI_TTS_MODEL` (pydantic) | `tts-1` | `tts-1`, `tts-1-hd` | * | `tutor-service/app/config/tts_config.py:24` |
| `AZURE_SPEECH_KEY` | `` (unset) | Azure Speech API key | * | `.env.example:70`; `tutor-service/app/config/tts_config.py:29` |
| `AZURE_SPEECH_REGION` | `westeurope` | Azure region | * | `.env.example:71`; `tutor-service/app/config/tts_config.py:32` |
| `GOOGLE_APPLICATION_CREDENTIALS` | `credentials.json` (project root) | filesystem cesta k JSON | * | `.env.example:74`; `tutor-service/app/services/tts_service.py:103-105` |
| `TTS_VOICE_NAME` (pydantic) | `sk-SK-LukasNeural` | lubovolne voice ID | * | `tutor-service/app/config/tts_config.py:35` |
| `TTS_SPEECH_RATE` (pydantic) | `1.0` | `0.5`--`2.0` | * | `tutor-service/app/config/tts_config.py:36` |
| `TTS_PITCH` (pydantic) | `0%` | `-50%` az `+50%` | * | `tutor-service/app/config/tts_config.py:37` |
| `TTS_OUTPUT_FORMAT` (pydantic) | `audio-24khz-48kbitrate-mono-mp3` | Azure audio format | * | `tutor-service/app/config/tts_config.py:40` |
| `TTS_SAMPLE_RATE` (pydantic) | `24000` | Hz | * | `tutor-service/app/config/tts_config.py:43` |
| `TTS_ENABLE_SSML` (pydantic) | `true` | `true`/`false` | * | `tutor-service/app/config/tts_config.py:46` |
| `TTS_ENABLE_VISEME` (pydantic) | `true` | `true`/`false` | * | `tutor-service/app/config/tts_config.py:47` |
| `TTS_DEFAULT_EMOTION` (pydantic) | `friendly` | lubovolny SSML emotion tag | * | `tutor-service/app/config/tts_config.py:52` |
| `XTTS_LANGUAGE` | `cs` | ISO 639-1 kod | M/S | `tutor-service/app/services/tts_service.py:92` |
| `OMNIVOICE_LANGUAGE` | `sk` | ISO 639-1 kod | M/S | `.env.example:248`; `tutor-service/app/services/tts_service.py:95` |
| `PIPER_MODELS_PATH` (runtime) | `./models/piper/` | filesystem cesta | M/S | `tutor-service/app/services/tts_service.py:112-113` |
| `OMNIVOICE_REFS_DIR` (runtime) | `./models/omnivoice/references/` | filesystem cesta | M/S | `tutor-service/app/api/voice_clones.py:30` |

### Detailné parametre

#### `USE_EDGE_TTS`
- **Default:** `true`
- **Range:** `true`/`false`
- **Tier:** * (any)
- **Why this default:** Edge TTS (Microsoft) je primárny TTS provider — bezplatný, nevyžaduje API kľúč, podporuje slovenčinu (`sk-SK-LukasNeural`). Beží cez `edge-tts` Python balíček bez lokálneho modelu. Ideálny pre všetky tiery ako základný provider.
- **Override scenarios:**
  - **Tier L (laptop):** Ponechaj `true` — Edge TTS je najjednoduchší spôsob ako mať funkčný TTS bez konfigurácie.
  - **Tier S (server):** Nastav na `false` ak chceš použiť OmniVoice alebo Azure TTS ako primárny provider.
- **Related:** `EDGE_TTS_VOICE`, `TTS_PROVIDER`
- **Source:** [`.env.example:65`](../.env.example), [`tutor-service/app/services/tts_service.py:118`](../tutor-service/app/services/tts_service.py)

---

#### `EDGE_TTS_VOICE`
- **Default:** `sk-SK-LukasNeural`
- **Range:** Akýkoľvek Edge TTS voice ID (napr. `sk-SK-ViktoriaNeural`, `cs-CZ-AntoninNeural`)
- **Tier:** * (any)
- **Why this default:** `sk-SK-LukasNeural` je mužský slovenský hlas — prirodzený, zrozumiteľný, vhodný pre tutoring. Microsoft Neural voices sú výrazne lepšie ako staršie TTS hlasy. Lukas je default lebo bol prvý testovaný slovenský hlas s dobrými výsledkami.
- **Override scenarios:**
  - **Tier L (laptop):** Zmeň na `sk-SK-ViktoriaNeural` pre ženský hlas; na `cs-CZ-AntoninNeural` pre česky hovoriaceho tutora.
  - **Tier S (server):** Ponechaj default alebo nastav podľa preferencií cieľovej skupiny.
- **Related:** `USE_EDGE_TTS`, `TTS_VOICE_NAME`
- **Source:** [`.env.example:66`](../.env.example), [`tutor-service/app/services/tts_service.py:123`](../tutor-service/app/services/tts_service.py)

---

#### `TTS_PROVIDER` (pydantic)
- **Default:** `edge` (auto)
- **Range:** `edge`, `openai`, `azure`, `piper`, `kokoro`, `omnivoice`, `google`, `mock`
- **Tier:** * (any)
- **Why this default:** `edge` je default lebo Edge TTS je bezplatný a nevyžaduje konfiguráciu. Provider dispatch je implementovaný cez dict-dispatch tabuľku (viď [ADR-002](adrs/002-dict-dispatch.md)) — pridanie nového providera je jedna riadka v tabuľke. OmniVoice nahradil XTTS-v2/Chatterbox/Coqui VITS v commite `b22c568`.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `openai` pre vyššiu kvalitu (vyžaduje `OPENAI_API_KEY`).
  - **Tier M (macbook):** Nastav na `omnivoice` pre lokálne voice cloning bez cloud API.
  - **Tier S (server):** Nastav na `azure` pre enterprise TTS s SSML podporou a viseme streamingom.
- **Related:** `USE_EDGE_TTS`, `EDGE_TTS_VOICE`, `OMNIVOICE_LANGUAGE`
- **Source:** [`tutor-service/app/config/tts_config.py:15`](../tutor-service/app/config/tts_config.py), [`tutor-service/app/services/tts_service.py:121-141`](../tutor-service/app/services/tts_service.py)

---

#### `TTS_OPENAI_TTS_VOICE` (pydantic)
- **Default:** `nova`
- **Range:** `alloy`, `echo`, `fable`, `onyx`, `nova`, `shimmer`
- **Tier:** * (any)
- **Why this default:** `nova` je ženský hlas s prirodzeným konverzačným štýlom — vhodný pre tutoring. OpenAI TTS hlasy sú anglické; pre slovenský text produkujú akceptovateľnú výslovnosť ale nie natívnu. Edge TTS `sk-SK-LukasNeural` je lepší pre slovenčinu.
- **Override scenarios:**
  - **Tier L (laptop):** Zmeň na `onyx` pre mužský hlas; `alloy` pre neutrálny.
- **Related:** `TTS_OPENAI_TTS_MODEL`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/config/tts_config.py:20`](../tutor-service/app/config/tts_config.py)

---

#### `TTS_OPENAI_TTS_MODEL` (pydantic)
- **Default:** `tts-1`
- **Range:** `tts-1`, `tts-1-hd`
- **Tier:** * (any)
- **Why this default:** `tts-1` je rýchlejší a lacnejší ako `tts-1-hd`. Pre real-time tutoring je latencia dôležitejšia ako maximálna audio kvalita. `tts-1-hd` je vhodný pre nahrávky alebo prezentácie kde latencia nie je kritická.
- **Override scenarios:**
  - **Tier L (laptop):** Zmeň na `tts-1-hd` pre vyššiu audio kvalitu ak latencia nie je problém.
- **Related:** `TTS_OPENAI_TTS_VOICE`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/config/tts_config.py:24`](../tutor-service/app/config/tts_config.py)

---

#### `AZURE_SPEECH_KEY`
- **Default:** `` (unset)
- **Range:** Azure Speech API key
- **Tier:** * (any)
- **Why this default:** Azure TTS je enterprise provider s najlepšou SSML podporou a viseme streamingom pre UE5 avatar. Nenastavený defaultne lebo vyžaduje Azure subscription. Pre produkčné nasadenie s UE5 avatárom je Azure TTS odporúčaný provider.
- **Override scenarios:**
  - **Tier S (server):** Nastav pre produkčné nasadenie s UE5 avatárom — Azure poskytuje viseme events natívne, čo zlepšuje lipsync kvalitu.
- **Related:** `AZURE_SPEECH_REGION`, `TTS_PROVIDER`, `TTS_ENABLE_VISEME`
- **Source:** [`.env.example:70`](../.env.example), [`tutor-service/app/config/tts_config.py:29`](../tutor-service/app/config/tts_config.py)

---

#### `AZURE_SPEECH_REGION`
- **Default:** `westeurope`
- **Range:** Azure region string
- **Tier:** * (any)
- **Why this default:** `westeurope` je najbližší Azure región pre slovenské nasadenia. Rovnaký dôvod ako `STT_AZURE_SPEECH_REGION` — minimálna latencia a GDPR compliance.
- **Override scenarios:**
  - **Tier S (server):** Zmeň podľa umiestnenia Azure Speech resource.
- **Related:** `AZURE_SPEECH_KEY`, `STT_AZURE_SPEECH_REGION`
- **Source:** [`.env.example:71`](../.env.example), [`tutor-service/app/config/tts_config.py:32`](../tutor-service/app/config/tts_config.py)

---

#### `GOOGLE_APPLICATION_CREDENTIALS`
- **Default:** `credentials.json` (project root)
- **Range:** Filesystem cesta k JSON súboru
- **Tier:** * (any)
- **Why this default:** Google Cloud TTS vyžaduje service account JSON credentials. Default cesta `credentials.json` v project roote je konvencia pre lokálny vývoj. Pre produkciu by mal byť súbor mimo repozitára alebo nahradený Workload Identity.
- **Override scenarios:**
  - **Tier S (server):** Nastav na absolútnu cestu k credentials súboru; alebo použi Google Workload Identity namiesto JSON súboru.
- **Related:** `TTS_PROVIDER`
- **Source:** [`.env.example:74`](../.env.example), [`tutor-service/app/services/tts_service.py:103-105`](../tutor-service/app/services/tts_service.py)
- **Notes:** Nikdy necommituj `credentials.json` do repozitára — je v `.gitignore`.

---

#### `TTS_VOICE_NAME` (pydantic)
- **Default:** `sk-SK-LukasNeural`
- **Range:** Akýkoľvek voice ID (provider-specific)
- **Tier:** * (any)
- **Why this default:** Pydantic config alias pre `EDGE_TTS_VOICE` — zachováva konzistentné pomenovanie naprieč providermi. Hodnota sa použije ako fallback ak provider-specific voice nie je nastavený.
- **Override scenarios:**
  - Nastav rovnako ako `EDGE_TTS_VOICE` pre konzistentnosť.
- **Related:** `EDGE_TTS_VOICE`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/config/tts_config.py:35`](../tutor-service/app/config/tts_config.py)

---

#### `TTS_SPEECH_RATE` (pydantic)
- **Default:** `1.0`
- **Range:** `0.5`--`2.0`
- **Tier:** * (any)
- **Why this default:** `1.0` je normálna rýchlosť reči. Pre tutoring je prirodzená rýchlosť optimálna — príliš rýchlo znižuje porozumenie, príliš pomaly je otravné. Žiaci si môžu rýchlosť nastaviť cez UI (ak je implementované).
- **Override scenarios:**
  - **Tier L (laptop):** Zníž na `0.85` pre pomalšie vysvetlenia pre mladších žiakov.
- **Related:** `TTS_PITCH`, `EDGE_TTS_VOICE`
- **Source:** [`tutor-service/app/config/tts_config.py:36`](../tutor-service/app/config/tts_config.py)

---

#### `TTS_PITCH` (pydantic)
- **Default:** `0%`
- **Range:** `-50%` až `+50%`
- **Tier:** * (any)
- **Why this default:** `0%` je prirodzená výška hlasu bez úprav. SSML pitch adjustment je provider-specific — funguje pre Azure a Edge TTS, ignorované pre iné. Zmena výšky bez dôvodu znižuje prirodzenosť hlasu.
- **Override scenarios:**
  - Zvyčajne nemeň — úprava výšky hlasu je estetická voľba bez funkčného dopadu.
- **Related:** `TTS_SPEECH_RATE`, `TTS_ENABLE_SSML`
- **Source:** [`tutor-service/app/config/tts_config.py:37`](../tutor-service/app/config/tts_config.py)

---

#### `TTS_OUTPUT_FORMAT` (pydantic)
- **Default:** `audio-24khz-48kbitrate-mono-mp3`
- **Range:** Azure audio format string
- **Tier:** * (any)
- **Why this default:** 24kHz/48kbps MP3 je dobrý kompromis medzi kvalitou a veľkosťou pre streaming. Vyššia bitrate (96kbps) by zvýšila latenciu prvého audio chunku. Mono je dostatočné pre reč — stereo by zdvojnásobilo dátový tok bez zlepšenia zrozumiteľnosti.
- **Override scenarios:**
  - **Tier S (server):** Zmeň na `audio-24khz-96kbitrate-mono-mp3` pre vyššiu audio kvalitu ak sieť to dovolí.
- **Related:** `TTS_SAMPLE_RATE`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/config/tts_config.py:40`](../tutor-service/app/config/tts_config.py)

---

#### `TTS_SAMPLE_RATE` (pydantic)
- **Default:** `24000`
- **Range:** Hz (napr. `16000`, `22050`, `24000`, `44100`)
- **Tier:** * (any)
- **Why this default:** 24kHz je štandardná vzorkovacia frekvencia pre reč — dostatočná pre zrozumiteľnosť, nižšia ako 44.1kHz hudby. Zodpovedá `TTS_OUTPUT_FORMAT` nastaveniu. Viseme timeline je kalibrovaná pre 24kHz audio.
- **Override scenarios:**
  - Zmeň len ak meníš `TTS_OUTPUT_FORMAT` — musia byť konzistentné.
- **Related:** `TTS_OUTPUT_FORMAT`, `EDU_VISEME_FRAME_STEP_MS`
- **Source:** [`tutor-service/app/config/tts_config.py:43`](../tutor-service/app/config/tts_config.py)

---

#### `TTS_ENABLE_SSML` (pydantic)
- **Default:** `true`
- **Range:** `true`/`false`
- **Tier:** * (any)
- **Why this default:** SSML (Speech Synthesis Markup Language) umožňuje kontrolu nad výslovnosťou, pauzami a emóciami. Pre tutoring je SSML dôležitý — umožňuje zdôrazniť kľúčové pojmy a pridať prirodzené pauzy. Funguje pre Azure a Edge TTS; ignorované pre iné providery.
- **Override scenarios:**
  - Nastav na `false` len ak SSML spôsobuje problémy s konkrétnym providerom.
- **Related:** `TTS_DEFAULT_EMOTION`, `TTS_PITCH`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/config/tts_config.py:46`](../tutor-service/app/config/tts_config.py)

---

#### `TTS_ENABLE_VISEME` (pydantic)
- **Default:** `true`
- **Range:** `true`/`false`
- **Tier:** * (any)
- **Why this default:** Viseme events sú potrebné pre UE5 avatar lipsync. `true` aktivuje viseme generovanie — buď natívne z Azure TTS alebo cez `viseme_timeline.py` pre iné providery. Bez viseme avatar nemá lipsync animáciu. Viď [ADR-005](adrs/005-ue5-protocol-v21.md).
- **Override scenarios:**
  - Nastav na `false` len pre text-only nasadenia bez UE5 avatára — šetrí výpočtový čas.
- **Related:** `TTS_ENABLE_SSML`, `UE5_BROADCAST_DELAY_MS`, `LIPSYNC_PROVIDER`
- **Source:** [`tutor-service/app/config/tts_config.py:47`](../tutor-service/app/config/tts_config.py)

---

#### `TTS_DEFAULT_EMOTION` (pydantic)
- **Default:** `friendly`
- **Range:** Akýkoľvek SSML emotion tag (provider-specific)
- **Tier:** * (any)
- **Why this default:** `friendly` je neutrálny, pozitívny tón vhodný pre tutoring. SSML emotion tagy sú provider-specific — Azure podporuje `friendly`, `cheerful`, `empathetic` atď. Pre Edge TTS a iné providery je tento parameter ignorovaný.
- **Override scenarios:**
  - Zmeň na `cheerful` pre motivačné správy; `empathetic` pre situácie kde žiak robí chyby.
- **Related:** `TTS_ENABLE_SSML`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/config/tts_config.py:52`](../tutor-service/app/config/tts_config.py)

---

#### `XTTS_LANGUAGE`
- **Default:** `cs`
- **Range:** ISO 639-1 kód
- **Tier:** M/S
- **Why this default:** XTTS-v2 nepodporuje slovenčinu (`sk`) — Czech (`cs`) je najbližší fonetický a gramatický ekvivalent (vzájomne zrozumiteľné jazyky). Produkuje výrazne lepšiu výslovnosť slovenského textu ako angličtina. Viď [KNOWN_ISSUES.md](KNOWN_ISSUES.md) pre detaily.
- **Override scenarios:**
  - Nemeň bez testovania — `sk` nie je v XTTS-v2 zozname podporovaných jazykov a spôsobí chybu.
- **Related:** `OMNIVOICE_LANGUAGE`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/services/tts_service.py:92`](../tutor-service/app/services/tts_service.py)
- **Notes:** XTTS-v2 je legacy provider — OmniVoice je preferovaný od commitu `b22c568`.

---

#### `OMNIVOICE_LANGUAGE`
- **Default:** `sk`
- **Range:** ISO 639-1 kód
- **Tier:** M/S
- **Why this default:** OmniVoice (náhrada za XTTS-v2/Chatterbox/Coqui VITS od commitu `b22c568`) natívne podporuje slovenčinu. Default `sk` je správna hodnota pre slovenský tutoring. Rozdiel oproti XTTS: OmniVoice má `sk` v zozname podporovaných jazykov, takže nie je potrebný `cs` workaround.

  **Pozor na rozdiel kód vs .env.example:** Kódový default v [`tutor-service/app/services/tts_service.py:95`](../tutor-service/app/services/tts_service.py) je `sk`. Súbor [`.env.example:248`](../.env.example) dokumentuje parameter ale nemá explicitnú hodnotu — ak `.env.example` neobsahuje `OMNIVOICE_LANGUAGE=sk`, kódový default `sk` platí. **Odporúčanie:** Explicitne nastav `OMNIVOICE_LANGUAGE=sk` v `.env` pre jasnosť. *[Appendix B parameter — viď Appendix B]*
- **Override scenarios:**
  - **Tier M (macbook):** Nastav na `cs` ak chceš česky hovoriaceho tutora pre česky hovoriacich žiakov.
  - **Tier S (server):** Ponechaj `sk` pre slovenský tutoring.
- **Related:** `XTTS_LANGUAGE`, `TTS_PROVIDER`, `OMNIVOICE_REFS_DIR`
- **Source:** [`.env.example:248`](../.env.example), [`tutor-service/app/services/tts_service.py:95`](../tutor-service/app/services/tts_service.py)

---

#### `PIPER_MODELS_PATH` (runtime)
- **Default:** `./models/piper/`
- **Range:** Filesystem cesta
- **Tier:** M/S
- **Why this default:** Piper TTS je offline neural TTS — modely sa stiahnu raz a uložia lokálne. Default cesta `./models/piper/` je relatívna k working directory backendu. Piper je rýchly a nevyžaduje GPU — vhodný pre Tier L/M offline nasadenia.
- **Override scenarios:**
  - **Tier M (macbook):** Nastav na absolútnu cestu ak modely sú na externom disku.
  - **Tier S (server):** Nastav na `/data/models/piper/` pre Docker volume mount.
- **Related:** `TTS_PROVIDER`, `HF_HOME`
- **Source:** [`tutor-service/app/services/tts_service.py:112-113`](../tutor-service/app/services/tts_service.py)

---

#### `OMNIVOICE_REFS_DIR` (runtime)
- **Default:** `./models/omnivoice/references/`
- **Range:** Filesystem cesta
- **Tier:** M/S
- **Why this default:** OmniVoice voice cloning vyžaduje referenčné audio súbory (5-30s vzorky hlasu). Default cesta je relatívna k working directory. Adresár musí existovať pred spustením OmniVoice providera.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `/data/models/omnivoice/references/` pre Docker volume mount.
- **Related:** `OMNIVOICE_LANGUAGE`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/api/voice_clones.py:30`](../tutor-service/app/api/voice_clones.py)

---

## 5. RAG

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `VECTOR_DB_BACKEND` | `chroma` | `chroma`, `weaviate` | * | `.env.example:85`; `tutor-service/app/config/rag_config.py:17` |
| `CHROMA_PERSIST_PATH` | `./data/chroma` | filesystem cesta | * | `.env.example:86`; `tutor-service/app/services/chroma_rag_service.py:28` |
| `WEAVIATE_URL` | `http://localhost:8080` | URL (http://...) | S | `.env.example:181`; `tutor-service/app/config/rag_config.py:23` |
| `WEAVIATE_API_KEY` | `` (unset) | API kluc | S | `tutor-service/app/config/rag_config.py:26` |
| `RAG_COLLECTION_NAME` (pydantic) | `EduTutorKnowledge` | lubovolny string | S | `tutor-service/app/config/rag_config.py:29` |
| `RAG_EMBEDDING_MODEL` (pydantic) | `paraphrase-multilingual-MiniLM-L12-v2` | lubovolny SentenceTransformer model | M/S | `tutor-service/app/config/rag_config.py:33` |
| `RAG_EMBEDDING_DIMENSION` (pydantic) | `384` | `>=1` | M/S | `tutor-service/app/config/rag_config.py:37` |
| `RAG_USE_OPENAI_EMBEDDINGS` (pydantic) | `false` | `true`/`false` (vyzaduje `OPENAI_API_KEY`) | * | `tutor-service/app/config/rag_config.py:40` |
| `RAG_OPENAI_EMBEDDING_MODEL` (pydantic) | `text-embedding-3-small` | `text-embedding-3-small`, `text-embedding-3-large` | * | `tutor-service/app/config/rag_config.py:43` |
| `RAG_CHUNK_SIZE` (pydantic) | `500` | `100`--`2000` | * | `tutor-service/app/config/rag_config.py:48` |
| `RAG_CHUNK_OVERLAP` (pydantic) | `80` | `0`--`500` | * | `tutor-service/app/config/rag_config.py:51` |
| `RAG_TOP_K_RESULTS` (pydantic) | `5` | `1`--`20` | * | `tutor-service/app/config/rag_config.py:56` |
| `RAG_SIMILARITY_THRESHOLD` (pydantic) | `0.65` | `0.0`--`1.0` | * | `tutor-service/app/config/rag_config.py:59` |
| `RAG_SIMILARITY_METRIC` (pydantic) | `cosine` | `cosine`, `dot`, `euclidean` | * | `tutor-service/app/config/rag_config.py:65` |
| `RAG_FILTER_METADATA` (pydantic) | `true` | `true`/`false` | * | `tutor-service/app/config/rag_config.py:70` |
| `RAG_BATCH_SIZE` (pydantic) | `100` | `>=1` | S | `tutor-service/app/config/rag_config.py:75` |
| `RAG_TIMEOUT_SECONDS` (pydantic) | `30` | `>=1` | S | `tutor-service/app/config/rag_config.py:76` |
| `RAG_SIMILARITY_THRESHOLD` (.env alias) | `0.35` | `0.0`--`1.0` | * | `.env.example:90` (Poznamka: .env.example `0.35` vs kodovy default `0.65` v `rag_config.py:59`; env pre-emptne pre pisanie `.env`) |

### Detailné parametre

#### `VECTOR_DB_BACKEND`
- **Default:** `chroma`
- **Range:** `chroma`, `weaviate`
- **Tier:** * (any)
- **Why this default:** ChromaDB je embedded vector databáza — beží v rovnakom procese ako backend, nevyžaduje separátny server. Pre prototyp a Tier L/M nasadenia je to ideálne. Weaviate je distribuovaná databáza pre Tier S produkčné nasadenia s vysokou záťažou.
- **Override scenarios:**
  - **Tier L (laptop):** Ponechaj `chroma` — žiadna externá závislosť.
  - **Tier S (server):** Zmeň na `weaviate` pre horizontálne škálovanie a pokročilé filtrovanie.
- **Related:** `CHROMA_PERSIST_PATH`, `WEAVIATE_URL`, `RAG_COLLECTION_NAME`
- **Source:** [`.env.example:85`](../.env.example), [`tutor-service/app/config/rag_config.py:17`](../tutor-service/app/config/rag_config.py)

---

#### `CHROMA_PERSIST_PATH`
- **Default:** `./data/chroma`
- **Range:** Filesystem cesta
- **Tier:** * (any)
- **Why this default:** Relatívna cesta k working directory backendu. ChromaDB ukladá embeddingy na disk — bez persist path by sa dáta stratili pri reštarte. `./data/chroma` je konvencia pre lokálny vývoj; pre Docker je potrebný volume mount.
- **Override scenarios:**
  - **Tier L (laptop):** Ponechaj default; adresár sa vytvorí automaticky.
  - **Tier S (server):** Nastav na `/data/chroma` pre Docker volume mount — zabezpečí perzistenciu pri reštarte kontajnera.
- **Related:** `VECTOR_DB_BACKEND`, `MEMORY_PERSIST_PATH`
- **Source:** [`.env.example:86`](../.env.example), [`tutor-service/app/services/chroma_rag_service.py:28`](../tutor-service/app/services/chroma_rag_service.py)

---

#### `WEAVIATE_URL`
- **Default:** `http://localhost:8080`
- **Range:** URL (http://...)
- **Tier:** S
- **Why this default:** Weaviate štandardne počúva na porte 8080. Default predpokladá lokálne nasadenie. Aktivuje sa len keď `VECTOR_DB_BACKEND=weaviate`.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `http://weaviate:8080` pre Docker Compose; na `http://<weaviate-server>:8080` pre vzdialený server.
- **Related:** `WEAVIATE_API_KEY`, `VECTOR_DB_BACKEND`
- **Source:** [`.env.example:181`](../.env.example), [`tutor-service/app/config/rag_config.py:23`](../tutor-service/app/config/rag_config.py)

---

#### `WEAVIATE_API_KEY`
- **Default:** `` (unset)
- **Range:** Weaviate API key
- **Tier:** S
- **Why this default:** Lokálny Weaviate nevyžaduje API kľúč. Pre Weaviate Cloud (WCS) alebo produkčný Weaviate s autentifikáciou je kľúč potrebný.
- **Override scenarios:**
  - **Tier S (server):** Nastav pre Weaviate Cloud alebo produkčný Weaviate s `--authentication-apikey-enabled`.
- **Related:** `WEAVIATE_URL`, `VECTOR_DB_BACKEND`
- **Source:** [`tutor-service/app/config/rag_config.py:26`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_COLLECTION_NAME` (pydantic)
- **Default:** `EduTutorKnowledge`
- **Range:** Akýkoľvek string
- **Tier:** S
- **Why this default:** Pomenovaná kolekcia pre Weaviate backend. Pre ChromaDB je kolekcia tiež pomenovaná ale menej kritická. Zmena názvu po inicializácii vyžaduje migráciu dát — ponechaj default pre nové nasadenia.
- **Override scenarios:**
  - **Tier S (server):** Zmeň pre multi-tenant nasadenia kde každý tenant má vlastnú kolekciu.
- **Related:** `VECTOR_DB_BACKEND`, `WEAVIATE_URL`
- **Source:** [`tutor-service/app/config/rag_config.py:29`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_EMBEDDING_MODEL` (pydantic)
- **Default:** `paraphrase-multilingual-MiniLM-L12-v2`
- **Range:** Akýkoľvek SentenceTransformer model ID
- **Tier:** M/S
- **Why this default:** `paraphrase-multilingual-MiniLM-L12-v2` je multilingválny embedding model — podporuje slovenčinu, češtinu a 50+ ďalších jazykov. MiniLM-L12 je rýchly (12 vrstiev) a produkuje 384-dimenzionálne embeddingy. Stiahne sa automaticky z HuggingFace.
- **Override scenarios:**
  - **Tier M (macbook):** Zmeň na `intfloat/multilingual-e5-large` pre vyššiu kvalitu embeddingov (väčší model, pomalší).
  - **Tier S (server):** Zmeň na `BAAI/bge-m3` pre state-of-the-art multilingválne embeddingy.
- **Related:** `RAG_EMBEDDING_DIMENSION`, `RAG_USE_OPENAI_EMBEDDINGS`
- **Source:** [`tutor-service/app/config/rag_config.py:33`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_EMBEDDING_DIMENSION` (pydantic)
- **Default:** `384`
- **Range:** `>=1`
- **Tier:** M/S
- **Why this default:** 384 dimenzií zodpovedá výstupu `paraphrase-multilingual-MiniLM-L12-v2`. Musí byť konzistentné s `RAG_EMBEDDING_MODEL` — zmena modelu bez zmeny dimenzie spôsobí chybu pri ukladaní do ChromaDB/Weaviate.
- **Override scenarios:**
  - Zmeň vždy spolu s `RAG_EMBEDDING_MODEL`: `intfloat/multilingual-e5-large` → 1024; `BAAI/bge-m3` → 1024; `text-embedding-3-small` → 1536.
- **Related:** `RAG_EMBEDDING_MODEL`, `RAG_USE_OPENAI_EMBEDDINGS`
- **Source:** [`tutor-service/app/config/rag_config.py:37`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_USE_OPENAI_EMBEDDINGS` (pydantic)
- **Default:** `false`
- **Range:** `true`/`false` (vyžaduje `OPENAI_API_KEY`)
- **Tier:** * (any)
- **Why this default:** `false` zachováva lokálne embeddingy — bez cloud API, bez nákladov, bez latencie sieťového volania. OpenAI embeddingy (`text-embedding-3-small`) sú kvalitnejšie ale každý embedding call stojí peniaze a pridáva latenciu.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `true` ak nemáš GPU pre lokálne embeddingy a chceš vyššiu kvalitu RAG.
  - **Tier S (server):** Ponechaj `false` — lokálne embeddingy sú rýchlejšie pre high-throughput.
- **Related:** `RAG_OPENAI_EMBEDDING_MODEL`, `RAG_EMBEDDING_MODEL`, `OPENAI_API_KEY`
- **Source:** [`tutor-service/app/config/rag_config.py:40`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_OPENAI_EMBEDDING_MODEL` (pydantic)
- **Default:** `text-embedding-3-small`
- **Range:** `text-embedding-3-small`, `text-embedding-3-large`
- **Tier:** * (any)
- **Why this default:** `text-embedding-3-small` je lacnejší a rýchlejší ako `large` pri porovnateľnej kvalite pre väčšinu RAG úloh. `large` (3072 dimenzií) je vhodný pre veľmi veľké knowledge bases kde presnosť retrieval je kritická.
- **Override scenarios:**
  - Zmeň na `text-embedding-3-large` len ak `small` produkuje zlé RAG výsledky pre špecifickú doménu.
- **Related:** `RAG_USE_OPENAI_EMBEDDINGS`, `RAG_EMBEDDING_DIMENSION`
- **Source:** [`tutor-service/app/config/rag_config.py:43`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_CHUNK_SIZE` (pydantic)
- **Default:** `500`
- **Range:** `100`--`2000`
- **Tier:** * (any)
- **Why this default:** 500 tokenov je dobrý kompromis pre tutoring dokumenty — dostatočne veľký pre kontext, dostatočne malý pre presný retrieval. Príliš veľké chunky znižujú presnosť retrieval (veľa irelevantného textu); príliš malé strácajú kontext.
- **Override scenarios:**
  - **Tier L (laptop):** Zníž na `300` pre kratšie, presnejšie chunky pri malých knowledge bases.
  - **Tier S (server):** Zvýš na `800` pre dlhé akademické texty kde kontext je dôležitý.
- **Related:** `RAG_CHUNK_OVERLAP`, `RAG_TOP_K_RESULTS`
- **Source:** [`tutor-service/app/config/rag_config.py:48`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_CHUNK_OVERLAP` (pydantic)
- **Default:** `80` (kód) / `120` (`.env.example`)
- **Range:** `0`--`500`
- **Tier:** * (any)
- **Why this default:** Overlap 80 tokenov zabraňuje strate kontextu na hraniciach chunkov. `.env.example` odporúča `120` (vyšší overlap) — toto je zámerný rozdiel: `.env.example` je konzervatívnejší pre produkciu. **Odporúčanie: použi `120` z `.env.example` pre lepší retrieval.** *[Appendix B parameter — viď Appendix B]*
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `50` pre rýchlejšie indexovanie pri malých knowledge bases.
  - **Tier S (server):** Nastav na `120` (`.env.example` hodnota) pre produkčnú kvalitu.
- **Related:** `RAG_CHUNK_SIZE`, `RAG_TOP_K_RESULTS`
- **Source:** [`tutor-service/app/config/rag_config.py:51`](../tutor-service/app/config/rag_config.py), [`.env.example:88`](../.env.example)

---

#### `RAG_TOP_K_RESULTS` (pydantic)
- **Default:** `5`
- **Range:** `1`--`20`
- **Tier:** * (any)
- **Why this default:** 5 výsledkov je dostatočných pre väčšinu tutoring otázok — poskytuje dostatok kontextu bez zahltenia LLM kontextového okna. Viac výsledkov zvyšuje recall ale znižuje presnosť a pridáva tokeny do LLM promptu.
- **Override scenarios:**
  - **Tier L (laptop):** Zníž na `3` pre rýchlejšie odpovede a menší LLM prompt.
  - **Tier S (server):** Zvýš na `8` pre komplexné otázky vyžadujúce viac zdrojov.
- **Related:** `RAG_SIMILARITY_THRESHOLD`, `RAG_CHUNK_SIZE`
- **Source:** [`tutor-service/app/config/rag_config.py:56`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_SIMILARITY_THRESHOLD` (pydantic)
- **Default:** `0.65` (kód) / `0.35` (`.env.example`)
- **Range:** `0.0`--`1.0`
- **Tier:** * (any)
- **Why this default:** Kódový default `0.65` je prísny — vracia len vysoko relevantné výsledky. `.env.example` hodnota `0.35` je menej prísna — vracia viac výsledkov aj pri nižšej podobnosti. **Odporúčanie: použi `0.35` z `.env.example` pre lepší recall pri slovenských textoch** — slovenčina má menší embedding priestor ako angličtina, takže prísny threshold môže vynechať relevantné chunky. *[Appendix B parameter — viď Appendix B]*
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `0.35` (`.env.example` hodnota) pre lepší recall.
  - **Tier S (server):** Nastav na `0.5` pre kompromis medzi recall a presnosťou.
- **Related:** `RAG_TOP_K_RESULTS`, `RAG_SIMILARITY_METRIC`
- **Source:** [`tutor-service/app/config/rag_config.py:59`](../tutor-service/app/config/rag_config.py), [`.env.example:90`](../.env.example)

---

#### `RAG_SIMILARITY_METRIC` (pydantic)
- **Default:** `cosine`
- **Range:** `cosine`, `dot`, `euclidean`
- **Tier:** * (any)
- **Why this default:** Cosine similarity je štandardná metrika pre text embeddingy — normalizuje dĺžku vektora, takže porovnáva smer nie veľkosť. Pre SentenceTransformer embeddingy je cosine najlepšia voľba. Dot product je rýchlejší ale citlivý na dĺžku vektora.
- **Override scenarios:**
  - Nemeň bez testovania — zmena metriky po indexovaní vyžaduje re-indexovanie celej knowledge base.
- **Related:** `RAG_SIMILARITY_THRESHOLD`, `RAG_EMBEDDING_MODEL`
- **Source:** [`tutor-service/app/config/rag_config.py:65`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_FILTER_METADATA` (pydantic)
- **Default:** `true`
- **Range:** `true`/`false`
- **Tier:** * (any)
- **Why this default:** `true` aktivuje filtrovanie výsledkov podľa metadát (napr. predmet, ročník, jazyk). Umožňuje presnejší retrieval pre konkrétny kontext — napr. len dokumenty pre matematiku 8. ročník. Bez filtrovania by RAG vrátil výsledky z celej knowledge base.
- **Override scenarios:**
  - Nastav na `false` len ak knowledge base nemá metadáta alebo pre debugging.
- **Related:** `RAG_TOP_K_RESULTS`, `RAG_COLLECTION_NAME`
- **Source:** [`tutor-service/app/config/rag_config.py:70`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_BATCH_SIZE` (pydantic)
- **Default:** `100`
- **Range:** `>=1`
- **Tier:** S
- **Why this default:** 100 dokumentov na batch je dobrý kompromis pre indexovanie — dostatočne veľký pre efektívnosť, dostatočne malý pre pamäť. Pre embedding 100 dokumentov naraz je potrebných cca 500MB RAM.
- **Override scenarios:**
  - **Tier S (server):** Zvýš na `500` pre rýchlejšie hromadné indexovanie na serveri s dostatkom RAM.
- **Related:** `RAG_CHUNK_SIZE`, `RAG_EMBEDDING_MODEL`
- **Source:** [`tutor-service/app/config/rag_config.py:75`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_TIMEOUT_SECONDS` (pydantic)
- **Default:** `30`
- **Range:** `>=1`
- **Tier:** S
- **Why this default:** 30 sekúnd je dostatočný timeout pre väčšinu RAG operácií. Dlhší timeout by blokoval chat endpoint pri pomalej ChromaDB/Weaviate. Viď [ADR-001](adrs/001-asymmetric-DI.md) — RAG je lazy-injected a timeout spôsobí graceful degradation (chat pokračuje bez kontextu).
- **Override scenarios:**
  - **Tier S (server):** Zvýš na `60` pre veľké knowledge bases kde retrieval trvá dlhšie.
- **Related:** `RAG_BATCH_SIZE`, `VECTOR_DB_BACKEND`
- **Source:** [`tutor-service/app/config/rag_config.py:76`](../tutor-service/app/config/rag_config.py)

---

#### `RAG_SIMILARITY_THRESHOLD` (.env alias)
- **Default:** `0.35`
- **Range:** `0.0`--`1.0`
- **Tier:** * (any)
- **Why this default:** Toto je `.env.example` alias pre rovnaký parameter ako pydantic `RAG_SIMILARITY_THRESHOLD`. Hodnota `0.35` v `.env.example` je zámerná — menej prísna ako kódový default `0.65`. Pre slovenské texty je nižší threshold lepší (viď vyššie). **Odporúčanie: nastav `RAG_SIMILARITY_THRESHOLD=0.35` v `.env` súbore.** *[Appendix B parameter — viď Appendix B]*
- **Override scenarios:**
  - Rovnaké ako pre pydantic `RAG_SIMILARITY_THRESHOLD` vyššie.
- **Related:** `RAG_TOP_K_RESULTS`, `RAG_CHUNK_OVERLAP`
- **Source:** [`.env.example:90`](../.env.example)

---

## 6. Avatar / UE5

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `UE5_BROADCAST_DELAY_MS` | `180` | `0`--`1000` (ms) | * | `.env.example:210`; `tutor-service/app/api/chat.py:178` |
| `NEXT_PUBLIC_UE5_STREAM_URL` | `` (unset) | URL (https?://...) alebo prazdny | L/M/S | `core/src/lib/ue5-bridge/index.ts:18` |
| `WS_ALLOWED_ORIGINS` | `` (unset; localhost defaults) | ciarkou oddelene URL | * | `.env.example:116`; `tutor-service/app/api/ws_avatar.py:61-68` |
| `WS_ALLOW_ALL_ORIGINS` | `0` | `0`/`1` | * | `.env.example:121` |
| `AUDIO2LIPSYNC_CHECKPOINT` | `models/audio2lipsync/best.pt` | filesystem cesta k `.pt` checkpointu | M/S | `.env.example:149`; `tutor-service/app/services/audio2lipsync_client.py:26-28` |
| `LIPSYNC_PROVIDER` | `hybrid` | `hybrid`, `audio2lipsync`, `text` | * | `.env.example:147`; `tutor-service/app/services/audio2lipsync_client.py:31` |
| `EDU_DEV_MODE` | `1` | `0`/`1`/`true`/`false`/`yes` | * | `.env.example:220`; `tutor-service/app/api/avatar_dev.py:29` |
| `_SEND_TIMEOUT_SECONDS` (hardcoded) | `2.0` | float (sekundy) | * | `tutor-service/app/services/avatar_broadcaster.py:20` |
| `_HEARTBEAT_MIN_INTERVAL_S` (hardcoded) | `3.0` | float (sekundy) | * | `tutor-service/app/services/avatar_broadcaster.py:21` |
| `_HEARTBEAT_MAX_INTERVAL_S` (hardcoded) | `6.0` | float (sekundy) | * | `tutor-service/app/services/avatar_broadcaster.py:22` |
| `_BLINK_PULSE_WEIGHT` (hardcoded) | `0.85` | `0.0`--`1.0` | * | `tutor-service/app/services/avatar_broadcaster.py:23` |
| `_WS_MAX_MESSAGE_BYTES` (hardcoded) | `16384` | `>=1` | * | `tutor-service/app/api/ws_avatar.py:48` |

### Detailné parametre

#### `UE5_BROADCAST_DELAY_MS`
- **Default:** `180`
- **Range:** `0`--`1000` (ms)
- **Tier:** * (any)
- **Why this default:** Browser MSE (Media Source Extensions) audio buffer potrebuje mediánovo 180ms na začatie prehrávania po príchode prvého audio chunku. UE5 viseme broadcast sa spustí z backendu v momente začiatku TTS. Bez oneskorenia by avatar pohyboval ústami 180ms pred tým, ako žiak počuje zvuk. Hodnota 180ms je kalibrovaná konštanta nameraná na Chrome/Firefox — viď [KNOWN_ISSUES.md](KNOWN_ISSUES.md). Viď tiež [ADR-005](adrs/005-ue5-protocol-v21.md).
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `0` pre plne lokálne nasadenie bez sieťovej latencie (localhost audio buffer je rýchlejší).
  - **Tier M (macbook):** Ponechaj `180` pre štandardné nasadenie; zníž na `100` ak audio a lipsync sú desynchronizované.
  - **Tier S (server):** Zvýš na `250-300` pre pomalé siete alebo vzdialených klientov.
- **Related:** `LIPSYNC_PROVIDER`, `TTS_ENABLE_VISEME`, `EDU_VISEME_FRAME_STEP_MS`
- **Source:** [`.env.example:210`](../.env.example), [`tutor-service/app/api/chat.py:178`](../tutor-service/app/api/chat.py)

---

#### `NEXT_PUBLIC_UE5_STREAM_URL`
- **Default:** `` (unset)
- **Range:** URL (https?://...) alebo prázdny
- **Tier:** L/M/S
- **Why this default:** Prázdny string deaktivuje UE5 avatar stream v Next.js frontende — avatar panel sa nezobrazí. Tým je text-only deploy plne funkčný bez UE5 konfigurácie. Nastavenie URL aktivuje WebSocket spojenie s UE5 Pixel Streaming serverom.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `http://localhost:8888` ak beží UE5 Pixel Streaming lokálne.
  - **Tier S (server):** Nastav na produkčnú URL Pixel Streaming servera (napr. `https://avatar.edututor.ai`).
- **Related:** `WS_ALLOWED_ORIGINS`, `UE5_BROADCAST_DELAY_MS`
- **Source:** [`core/src/lib/ue5-bridge/index.ts:18`](../core/src/lib/ue5-bridge/index.ts)

---

#### `WS_ALLOWED_ORIGINS`
- **Default:** `` (unset; localhost defaults: 3000, 3001, 3002 + `https://edututor.ai`)
- **Range:** Čiarkou oddelené URL
- **Tier:** * (any)
- **Why this default:** Prázdny string aktivuje bezpečné localhost defaults — WebSocket spojenia sú povolené len z localhost portov a produkčnej domény. Pre produkčné nasadenie na vlastnej doméne je potrebné explicitne pridať doménu.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `https://yourdomain.com,https://www.yourdomain.com` pre produkčné nasadenie.
- **Related:** `WS_ALLOW_ALL_ORIGINS`, `CORS_ORIGINS`
- **Source:** [`.env.example:116`](../.env.example), [`tutor-service/app/api/ws_avatar.py:61-68`](../tutor-service/app/api/ws_avatar.py)

---

#### `WS_ALLOW_ALL_ORIGINS`
- **Default:** `0`
- **Range:** `0`/`1`
- **Tier:** * (any)
- **Why this default:** `0` (zakázané) je bezpečný default — WebSocket spojenia sú overované podľa `WS_ALLOWED_ORIGINS`. Nastavenie na `1` by povolilo spojenia z akejkoľvek domény — nebezpečné pre produkciu, vhodné len pre lokálny vývoj.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `1` pre rýchly lokálny vývoj bez konfigurácie origins.
  - Nikdy nenastav na `1` v produkcii.
- **Related:** `WS_ALLOWED_ORIGINS`, `CORS_ORIGINS`
- **Source:** [`.env.example:121`](../.env.example)

---

#### `AUDIO2LIPSYNC_CHECKPOINT`
- **Default:** `models/audio2lipsync/best.pt`
- **Range:** Filesystem cesta k `.pt` checkpointu
- **Tier:** M/S
- **Why this default:** `best.pt` je konvencia pre najlepší checkpoint z trénovania. Cesta je relatívna k working directory backendu. Model sa stiahne automaticky z HuggingFace ak súbor neexistuje (viď `_CHECKPOINT_PATH` runtime parameter).
- **Override scenarios:**
  - **Tier M (macbook):** Nastav na absolútnu cestu ak model je na externom disku.
  - **Tier S (server):** Nastav na `/data/models/audio2lipsync/best.pt` pre Docker volume mount.
- **Related:** `LIPSYNC_PROVIDER`, `Audio2Lipsync _CHECKPOINT_PATH`
- **Source:** [`.env.example:149`](../.env.example), [`tutor-service/app/services/audio2lipsync_client.py:26-28`](../tutor-service/app/services/audio2lipsync_client.py)

---

#### `LIPSYNC_PROVIDER`
- **Default:** `hybrid`
- **Range:** `hybrid`, `audio2lipsync`, `text`
- **Tier:** * (any)
- **Why this default:** `hybrid` kombinuje text-based viseme generovanie (rýchle, bez GPU) s audio2lipsync (presnejšie, vyžaduje model). Ak audio2lipsync model nie je dostupný, automaticky fallback na `text`. `text` provider je vždy dostupný — generuje viseme z fonetickej analýzy textu.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `text` pre rýchly lipsync bez stiahnutia audio2lipsync modelu.
  - **Tier S (server):** Nastav na `audio2lipsync` pre maximálnu presnosť lipsync na GPU.
- **Related:** `AUDIO2LIPSYNC_CHECKPOINT`, `TTS_ENABLE_VISEME`, `UE5_BROADCAST_DELAY_MS`
- **Source:** [`.env.example:147`](../.env.example), [`tutor-service/app/services/audio2lipsync_client.py:31`](../tutor-service/app/services/audio2lipsync_client.py)

---

#### `EDU_DEV_MODE`
- **Default:** `1`
- **Range:** `0`/`1`/`true`/`false`/`yes`
- **Tier:** * (any)
- **Why this default:** `1` (zapnutý) aktivuje dev mode — avatar dev endpoint (`/api/avatar-dev`) je dostupný, debug informácie sú logované. Pre produkčné nasadenie nastav na `0` — deaktivuje dev endpoint a znižuje verbozitu logov.
- **Override scenarios:**
  - **Tier L/M (laptop/macbook):** Ponechaj `1` pre vývoj.
  - **Tier S (server):** Nastav na `0` pre produkciu — skryje dev endpoint.
- **Related:** `DEBUG`, `LOG_LEVEL`, `APP_ENV`
- **Source:** [`.env.example:220`](../.env.example), [`tutor-service/app/api/avatar_dev.py:29`](../tutor-service/app/api/avatar_dev.py)

---

#### `_SEND_TIMEOUT_SECONDS` (hardcoded)
- **Default:** `2.0`
- **Range:** float (sekundy)
- **Tier:** * (any)
- **Why this default:** 2 sekundy je maximálny čas na odoslanie WebSocket správy jednému UE5 klientovi. Pomalý klient (napr. vysoká latencia siete) nesmie blokovať broadcast ostatným klientom. Po 2s sa spojenie s pomalým klientom ukončí. Viď [ADR-005](adrs/005-ue5-protocol-v21.md).
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta v `avatar_broadcaster.py:20`.
- **Related:** `_HEARTBEAT_MIN_INTERVAL_S`, `UE5_BROADCAST_DELAY_MS`
- **Source:** [`tutor-service/app/services/avatar_broadcaster.py:20`](../tutor-service/app/services/avatar_broadcaster.py)

---

#### `_HEARTBEAT_MIN_INTERVAL_S` (hardcoded)
- **Default:** `3.0`
- **Range:** float (sekundy)
- **Tier:** * (any)
- **Why this default:** Minimálny interval medzi heartbeat správami je 3 sekundy. Heartbeat udržuje WebSocket spojenie živé cez NAT/firewall. 3s je dostatočne časté pre detekciu odpojenia bez zahltenia siete.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_HEARTBEAT_MAX_INTERVAL_S`, `_SEND_TIMEOUT_SECONDS`
- **Source:** [`tutor-service/app/services/avatar_broadcaster.py:21`](../tutor-service/app/services/avatar_broadcaster.py)

---

#### `_HEARTBEAT_MAX_INTERVAL_S` (hardcoded)
- **Default:** `6.0`
- **Range:** float (sekundy)
- **Tier:** * (any)
- **Why this default:** Maximálny interval 6 sekúnd zabraňuje príliš častým heartbeatom pri aktívnej konverzácii. Interval sa náhodne variuje medzi 3-6s pre prirodzenejší traffic pattern.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_HEARTBEAT_MIN_INTERVAL_S`
- **Source:** [`tutor-service/app/services/avatar_broadcaster.py:22`](../tutor-service/app/services/avatar_broadcaster.py)

---

#### `_BLINK_PULSE_WEIGHT` (hardcoded)
- **Default:** `0.85`
- **Range:** `0.0`--`1.0`
- **Tier:** * (any)
- **Why this default:** Váha 0.85 pre blink pulse znamená, že 85% blink eventov je "plných" (plné zatvorenie oka) a 15% je "čiastočných" (prirodzené mrknutie). Hodnota bola kalibrovaná pre prirodzený vzhľad MetaHuman avatára — príliš vysoká váha vyzerá roboticky, príliš nízka vyzerá unavene.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_HEARTBEAT_MIN_INTERVAL_S`, `UE5_BROADCAST_DELAY_MS`
- **Source:** [`tutor-service/app/services/avatar_broadcaster.py:23`](../tutor-service/app/services/avatar_broadcaster.py)

---

#### `_WS_MAX_MESSAGE_BYTES` (hardcoded)
- **Default:** `16384` (16 KB)
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** 16KB je maximálna veľkosť jednej WebSocket správy pre UE5 avatar. Viseme timeline pre typickú 5-sekundovú odpoveď je cca 2-4KB — 16KB poskytuje dostatočnú rezervu. Väčšie správy by mohli spôsobiť problémy s UE5 Blueprint WebSocket parserom.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_SEND_TIMEOUT_SECONDS`, `UE5_BROADCAST_DELAY_MS`
- **Source:** [`tutor-service/app/api/ws_avatar.py:48`](../tutor-service/app/api/ws_avatar.py)

---

## 7. Lipsync

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `EDU_VISEME_FRAME_STEP_MS` | `40` | `4`--`200` (ms) | * | `tutor-service/app/services/viseme_timeline.py:169` |
| `EDU_VISEME_RAMP_MS` | `40` (rovny `EDU_VISEME_FRAME_STEP_MS`) | `FRAME_STEP_MS`--`200` (ms) | * | `tutor-service/app/services/viseme_timeline.py:170` |
| `EDU_VISEME_SHORT_VOWEL_MS` | `60` | `20`--`300` (ms) | * | `tutor-service/app/services/viseme_timeline.py:176` |
| `EDU_VISEME_LONG_VOWEL_MS` | `100` | `30`--`400` (ms) | * | `tutor-service/app/services/viseme_timeline.py:177` |
| `EDU_VISEME_CONSONANT_MS` | `45` | `15`--`200` (ms) | * | `tutor-service/app/services/viseme_timeline.py:178` |
| `Audio2Lipsync _FACE_FPS` (hardcoded) | `60` | fps | M/S | `tutor-service/app/services/audio2lipsync_client.py:50` |
| `Audio2Lipsync _VALID_PROVIDERS` (hardcoded) | `("text", "audio2lipsync", "hybrid")` | enum tuple | * | `tutor-service/app/services/audio2lipsync_client.py:31` |
| `Audio2Lipsync _CHECKPOINT_PATH` (runtime) | `models/audio2lipsync/best.pt` | auto-download z HF | M/S | `tutor-service/app/services/audio2lipsync_client.py:26-28` |
| `Audio2Lipsync _STATS_DIR` (hardcoded) | `audio2lipsync/stats/` | podpriecinok modelu | M/S | `tutor-service/app/services/audio2lipsync_client.py:25` |

### Detailné parametre

#### `EDU_VISEME_FRAME_STEP_MS`
- **Default:** `40`
- **Range:** `4`--`200` (ms)
- **Tier:** * (any)
- **Why this default:** 40ms zodpovedá 25 fps — štandardná frekvencia pre animácie. UE5 MetaHuman animácie bežia na 30-60fps; 25fps viseme timeline je dostatočne plynulá. Nižšia hodnota (napr. 16ms = 60fps) by zvýšila veľkosť viseme payloadu bez viditeľného zlepšenia.
- **Override scenarios:**
  - **Tier S (server):** Zníž na `16` (60fps) pre maximálne plynulý lipsync na výkonnom serveri.
  - **Tier L (laptop):** Zvýš na `80` (12fps) pre menší payload a nižšiu záťaž.
- **Related:** `EDU_VISEME_RAMP_MS`, `UE5_BROADCAST_DELAY_MS`, `TTS_SAMPLE_RATE`
- **Source:** [`tutor-service/app/services/viseme_timeline.py:169`](../tutor-service/app/services/viseme_timeline.py)

---

#### `EDU_VISEME_RAMP_MS`
- **Default:** `40` (rovný `EDU_VISEME_FRAME_STEP_MS`)
- **Range:** `FRAME_STEP_MS`--`200` (ms)
- **Tier:** * (any)
- **Why this default:** Ramp time určuje ako rýchlo sa viseme blend weight mení medzi hodnotami. Rovnaká hodnota ako `FRAME_STEP_MS` (40ms) znamená lineárny prechod za jeden frame — prirodzený pohyb pier. Kratší ramp by vyzeralo trhane; dlhší by vyzeralo oneskorene.
- **Override scenarios:**
  - Zmeň len spolu s `EDU_VISEME_FRAME_STEP_MS` — musia byť konzistentné.
- **Related:** `EDU_VISEME_FRAME_STEP_MS`, `EDU_VISEME_SHORT_VOWEL_MS`
- **Source:** [`tutor-service/app/services/viseme_timeline.py:170`](../tutor-service/app/services/viseme_timeline.py)

---

#### `EDU_VISEME_SHORT_VOWEL_MS`
- **Default:** `60`
- **Range:** `20`--`300` (ms)
- **Tier:** * (any)
- **Why this default:** Krátke samohlásky (a, e, i, o, u v krátkej pozícii) trvajú v slovenčine typicky 60-80ms. 60ms je dolná hranica pre prirodzený pohyb pier — kratšie by vyzeralo príliš rýchlo pre percepciu.
- **Override scenarios:**
  - Zmeň len ak lipsync vyzerá desynchronizovane pre konkrétny TTS hlas — každý hlas má iné tempo.
- **Related:** `EDU_VISEME_LONG_VOWEL_MS`, `EDU_VISEME_FRAME_STEP_MS`
- **Source:** [`tutor-service/app/services/viseme_timeline.py:176`](../tutor-service/app/services/viseme_timeline.py)

---

#### `EDU_VISEME_LONG_VOWEL_MS`
- **Default:** `100`
- **Range:** `30`--`400` (ms)
- **Tier:** * (any)
- **Why this default:** Dlhé samohlásky (á, é, í, ó, ú) trvajú v slovenčine typicky 100-150ms. 100ms je dobrý default pre Edge TTS `sk-SK-LukasNeural` — kalibrovaný pre tento konkrétny hlas.
- **Override scenarios:**
  - Zmeň na `120` ak používaš pomalší TTS hlas; na `80` pre rýchlejší hlas.
- **Related:** `EDU_VISEME_SHORT_VOWEL_MS`, `EDGE_TTS_VOICE`
- **Source:** [`tutor-service/app/services/viseme_timeline.py:177`](../tutor-service/app/services/viseme_timeline.py)

---

#### `EDU_VISEME_CONSONANT_MS`
- **Default:** `45`
- **Range:** `15`--`200` (ms)
- **Tier:** * (any)
- **Why this default:** Spoluhlásky sú kratšie ako samohlásky — 45ms je typická dĺžka pre väčšinu slovenských spoluhlások. Príliš krátke (< 20ms) by bolo neviditeľné; príliš dlhé by spomaľovalo reč.
- **Override scenarios:**
  - Zmeň len pri výraznej desynchronizácii lipsync pre konkrétny TTS provider.
- **Related:** `EDU_VISEME_SHORT_VOWEL_MS`, `EDU_VISEME_FRAME_STEP_MS`
- **Source:** [`tutor-service/app/services/viseme_timeline.py:178`](../tutor-service/app/services/viseme_timeline.py)

---

#### `Audio2Lipsync _FACE_FPS` (hardcoded)
- **Default:** `60`
- **Range:** fps
- **Tier:** M/S
- **Why this default:** 60fps je štandardná frekvencia pre UE5 MetaHuman animácie. Audio2Lipsync model generuje blend shapes na 60fps — zodpovedá UE5 animačnému systému. Hardcoded lebo zmena by vyžadovala re-tréning modelu.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `EDU_VISEME_FRAME_STEP_MS`, `LIPSYNC_PROVIDER`
- **Source:** [`tutor-service/app/services/audio2lipsync_client.py:50`](../tutor-service/app/services/audio2lipsync_client.py)

---

#### `Audio2Lipsync _VALID_PROVIDERS` (hardcoded)
- **Default:** `("text", "audio2lipsync", "hybrid")`
- **Range:** enum tuple
- **Tier:** * (any)
- **Why this default:** Validácia `LIPSYNC_PROVIDER` hodnoty. Ak je nastavená neplatná hodnota, backend padne s jasnou chybou namiesto tichého zlyhania. Viď [ADR-002](adrs/002-dict-dispatch.md) pre dict-dispatch pattern.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `LIPSYNC_PROVIDER`
- **Source:** [`tutor-service/app/services/audio2lipsync_client.py:31`](../tutor-service/app/services/audio2lipsync_client.py)

---

#### `Audio2Lipsync _CHECKPOINT_PATH` (runtime)
- **Default:** `models/audio2lipsync/best.pt` (auto-download z HF)
- **Range:** Filesystem cesta
- **Tier:** M/S
- **Why this default:** Ak checkpoint neexistuje lokálne, klient ho automaticky stiahne z HuggingFace. Tým sa eliminuje manuálny krok stiahnutia modelu pri prvom nasadení. Cesta zodpovedá `AUDIO2LIPSYNC_CHECKPOINT` env parametru.
- **Override scenarios:**
  - Nastav `AUDIO2LIPSYNC_CHECKPOINT` env var pre zmenu cesty.
- **Related:** `AUDIO2LIPSYNC_CHECKPOINT`, `LIPSYNC_PROVIDER`, `HF_HOME`
- **Source:** [`tutor-service/app/services/audio2lipsync_client.py:26-28`](../tutor-service/app/services/audio2lipsync_client.py)

---

#### `Audio2Lipsync _STATS_DIR` (hardcoded)
- **Default:** `audio2lipsync/stats/`
- **Range:** Podpriečinok modelu
- **Tier:** M/S
- **Why this default:** Štatistiky normalizácie (mean/std pre blend shapes) sú uložené vedľa modelu. Relatívna cesta k `_CHECKPOINT_PATH` adresáru. Tieto štatistiky sú potrebné pre správnu normalizáciu výstupu modelu.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `Audio2Lipsync _CHECKPOINT_PATH`, `AUDIO2LIPSYNC_CHECKPOINT`
- **Source:** [`tutor-service/app/services/audio2lipsync_client.py:25`](../tutor-service/app/services/audio2lipsync_client.py)

---

## 8. Memory

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `MEMORY_PERSIST_PATH` | `./data/memory` | filesystem cesta | * | `.env.example:199`; `tutor-service/app/services/memory_service.py:21` |
| `memory.MAX_TURNS` (hardcoded, conversation memory) | `10` | `>=1` (turn-ov, kazdy = 2 spravy) | * | `tutor-service/app/services/memory_service.py:20` |
| `memory.conversation_id SAFE_ID regex` (hardcoded) | `^[a-zA-Z0-9_\-]{1,128}$` | regex | * | `tutor-service/app/services/memory_service.py:23` |
| `episodic_memory CHROMA collection prefix` (hardcoded) | `edu_memory_` | prefix + user_id | * | `tutor-service/app/services/episodic_memory_service.py:26` |
| `episodic_memory default top_k` | `3` | `>=1` | * | `tutor-service/app/services/episodic_memory_service.py:85` |
| `conversation_summarizer` (runtime) | `_SUMMARY_PROMPT` | LLM summarizer prompt | * | `tutor-service/app/services/conversation_summarizer.py:21` |

### Detailné parametre

#### `MEMORY_PERSIST_PATH`
- **Default:** `./data/memory`
- **Range:** Filesystem cesta
- **Tier:** * (any)
- **Why this default:** Konverzačná pamäť sa ukladá na disk pre perzistenciu medzi reštartmi. Relatívna cesta `./data/memory` je konzistentná s `CHROMA_PERSIST_PATH` a `SQLITE_PATH` — všetky dáta sú v `./data/`. Pre Docker je potrebný volume mount. Viď [ADR-004](adrs/004-anonymous-by-default-identity.md) pre identity model.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `/data/memory` pre Docker volume mount.
- **Related:** `CHROMA_PERSIST_PATH`, `SQLITE_PATH`, `memory.MAX_TURNS`
- **Source:** [`.env.example:199`](../.env.example), [`tutor-service/app/services/memory_service.py:21`](../tutor-service/app/services/memory_service.py)

---

#### `memory.MAX_TURNS` (hardcoded)
- **Default:** `10`
- **Range:** `>=1` (turn = 2 správy: user + assistant)
- **Tier:** * (any)
- **Why this default:** 10 turns (20 správ) je dostatočný kontext pre väčšinu tutoring konverzácií. Viac turns by zvyšovalo veľkosť LLM promptu a náklady. Po 10 turns sa najstaršie správy automaticky sumarizujú cez `conversation_summarizer`. Viď [ADR-004](adrs/004-anonymous-by-default-identity.md).
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta. Pre zmenu uprav `memory_service.py:20`.
- **Related:** `MEMORY_PERSIST_PATH`, `LLM_CONTEXT_WINDOW`, `conversation_summarizer`
- **Source:** [`tutor-service/app/services/memory_service.py:20`](../tutor-service/app/services/memory_service.py)

---

#### `memory.conversation_id SAFE_ID regex` (hardcoded)
- **Default:** `^[a-zA-Z0-9_\-]{1,128}$`
- **Range:** regex
- **Tier:** * (any)
- **Why this default:** Validácia conversation ID zabraňuje path traversal útokom a SQL injection. Povolené znaky (alfanumerické, podčiarknutie, pomlčka) sú bezpečné pre použitie ako súborové mená a databázové kľúče. Maximálna dĺžka 128 znakov je dostatočná pre UUID + prefix.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded bezpečnostná konštanta.
- **Related:** `MEMORY_PERSIST_PATH`, `LEGACY_USER_ID`
- **Source:** [`tutor-service/app/services/memory_service.py:23`](../tutor-service/app/services/memory_service.py)

---

#### `episodic_memory CHROMA collection prefix` (hardcoded)
- **Default:** `edu_memory_` (prefix + user_id)
- **Range:** prefix string
- **Tier:** * (any)
- **Why this default:** Každý používateľ má vlastnú ChromaDB kolekciu pre episodickú pamäť — `edu_memory_<user_id>`. Prefix `edu_memory_` zabraňuje kolízii s RAG kolekciou (`EduTutorKnowledge`). Viď [ADR-004](adrs/004-anonymous-by-default-identity.md) pre identity model.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `CHROMA_PERSIST_PATH`, `RAG_COLLECTION_NAME`, `LEGACY_USER_ID`
- **Source:** [`tutor-service/app/services/episodic_memory_service.py:26`](../tutor-service/app/services/episodic_memory_service.py)

---

#### `episodic_memory default top_k`
- **Default:** `3`
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** 3 episodické spomienky sú dostatočné pre personalizáciu bez zahltenia LLM promptu. Episodická pamäť obsahuje sumarizácie predchádzajúcich konverzácií — 3 sumarizácie pridajú cca 300-500 tokenov do promptu.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded default. Pre zmenu uprav `episodic_memory_service.py:85`.
- **Related:** `memory.MAX_TURNS`, `RAG_TOP_K_RESULTS`
- **Source:** [`tutor-service/app/services/episodic_memory_service.py:85`](../tutor-service/app/services/episodic_memory_service.py)

---

#### `conversation_summarizer` (runtime)
- **Default:** `_SUMMARY_PROMPT` (LLM summarizer prompt)
- **Range:** LLM prompt string
- **Tier:** * (any)
- **Why this default:** Po dosiahnutí `MAX_TURNS` sa konverzácia automaticky sumarizuje cez LLM. Sumarizácia zachováva kľúčové informácie (meno žiaka, témy, pokrok) pri znížení počtu tokenov. Prompt je hardcoded v `conversation_summarizer.py:21` — optimalizovaný pre slovenský tutoring kontext.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — prompt je v kóde. Pre zmenu uprav `conversation_summarizer.py`.
- **Related:** `memory.MAX_TURNS`, `MEMORY_PERSIST_PATH`, `LLM_PROVIDER_AUTO_SELECT`
- **Source:** [`tutor-service/app/services/conversation_summarizer.py:21`](../tutor-service/app/services/conversation_summarizer.py)

---

## 9. Identity

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `LEGACY_USER_ID` | `` (auto-generovane UUID) | validny UUID v4 | * | `.env.example:190`; `tutor-service/app/database.py:90` |
| `LEGACY_USER_ID_PATH` | `./data/legacy_user_id.txt` | filesystem cesta | * | `.env.example:191`; `tutor-service/app/database.py:27` |
| `X-EduTutor-User-Id` (header contract) | `` (volitelny) | UUID string alebo prazdny | * | `tutor-service/app/middleware/user_identity.py:4` |
| `X-EduTutor-API-Key` (header contract) | `` (volitelny, ak `EDUTUTOR_API_KEY` nastaveny) | lubovolny string | * | `.env.example:228`; `tutor-service/app/main.py:192` |
| `user_identity COOKIE_MAX_AGE` (hardcoded) | `315360000` | 10 rokov v sekundach | * | `tutor-service/app/middleware/user_identity.py:43` |
| `core/src/lib/api.ts localStorage key` | `edututor_user_id` | string | * | `core/src/lib/api.ts` (viz core/README.md:40) |

### Detailné parametre

#### `LEGACY_USER_ID`
- **Default:** `` (auto-generované UUID)
- **Range:** Validný UUID v4
- **Tier:** * (any)
- **Why this default:** Prázdny string spustí auto-generovanie UUID pri prvom spustení. UUID sa uloží do `LEGACY_USER_ID_PATH` súboru pre perzistenciu. Viď [ADR-004](adrs/004-anonymous-by-default-identity.md) — identity resolves via header > cookie > generate. Explicitné nastavenie je potrebné len pre migráciu existujúcich dát.
- **Override scenarios:**
  - Nastav explicitne len pri migrácii z iného systému kde chceš zachovať existujúce user ID.
- **Related:** `LEGACY_USER_ID_PATH`, `X-EduTutor-User-Id`
- **Source:** [`.env.example:190`](../.env.example), [`tutor-service/app/database.py:90`](../tutor-service/app/database.py)

---

#### `LEGACY_USER_ID_PATH`
- **Default:** `./data/legacy_user_id.txt`
- **Range:** Filesystem cesta
- **Tier:** * (any)
- **Why this default:** UUID sa ukladá do súboru pre perzistenciu medzi reštartmi backendu. Relatívna cesta `./data/` je konzistentná s ostatnými dátovými súbormi. Pre Docker je potrebný volume mount na `/data/`.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `/data/legacy_user_id.txt` pre Docker volume mount.
- **Related:** `LEGACY_USER_ID`, `MEMORY_PERSIST_PATH`
- **Source:** [`.env.example:191`](../.env.example), [`tutor-service/app/database.py:27`](../tutor-service/app/database.py)

---

#### `X-EduTutor-User-Id` (header contract)
- **Default:** `` (voliteľný)
- **Range:** UUID string alebo prázdny
- **Tier:** * (any)
- **Why this default:** Frontend (`core/src/lib/api.ts`) generuje UUID a ukladá ho do localStorage pod kľúčom `edututor_user_id`. Header sa posiela pri každom API volaní. Toto je primárna cesta identity — viď [ADR-004](adrs/004-anonymous-by-default-identity.md). Bez headera backend použije cookie alebo vygeneruje nové UUID.
- **Override scenarios:**
  - Pre API testing: nastav header manuálne na konkrétne UUID pre testovanie per-user funkcií.
- **Related:** `LEGACY_USER_ID`, `user_identity COOKIE_MAX_AGE`
- **Source:** [`tutor-service/app/middleware/user_identity.py:4`](../tutor-service/app/middleware/user_identity.py)

---

#### `X-EduTutor-API-Key` (header contract)
- **Default:** `` (voliteľný, ak `EDUTUTOR_API_KEY` nastavený)
- **Range:** Akýkoľvek string
- **Tier:** * (any)
- **Why this default:** API key autentifikácia je voliteľná — ak `EDUTUTOR_API_KEY` nie je nastavený, endpoint je verejne prístupný. Pre produkčné nasadenie nastav `EDUTUTOR_API_KEY` a vyžaduj header od klientov.
- **Override scenarios:**
  - **Tier S (server):** Nastav `EDUTUTOR_API_KEY` a vyžaduj header pre ochranu API pred neoprávneným prístupom.
- **Related:** `EDUTUTOR_API_KEY`
- **Source:** [`.env.example:228`](../.env.example), [`tutor-service/app/main.py:192`](../tutor-service/app/main.py)

---

#### `user_identity COOKIE_MAX_AGE` (hardcoded)
- **Default:** `315360000` (10 rokov v sekundách)
- **Range:** sekundy
- **Tier:** * (any)
- **Why this default:** 10-ročná platnosť cookie zabezpečuje, že anonymný používateľ si zachová identitu prakticky natrvalo. Kratšia platnosť by spôsobila stratu histórie a flashcards pri expirácii cookie. Viď [ADR-004](adrs/004-anonymous-by-default-identity.md) — "no friction" princíp.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta. Pre zmenu uprav `user_identity.py:43`.
- **Related:** `X-EduTutor-User-Id`, `LEGACY_USER_ID`
- **Source:** [`tutor-service/app/middleware/user_identity.py:43`](../tutor-service/app/middleware/user_identity.py)

---

#### `core/src/lib/api.ts localStorage key`
- **Default:** `edututor_user_id`
- **Range:** string
- **Tier:** * (any)
- **Why this default:** Kľúč pre localStorage uloženie UUID v prehliadači. Konzistentný kľúč zabraňuje duplikácii UUID pri viacerých taboch. Viď [ADR-004](adrs/004-anonymous-by-default-identity.md) — header path je primárna legacy-compat záruka.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded v `core/src/lib/api.ts`.
- **Related:** `X-EduTutor-User-Id`, `LEGACY_USER_ID`
- **Source:** [`core/src/lib/api.ts`](../core/src/lib/api.ts)

---

## 10. Frontend

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL (http://...) | * | `core/.env.example:4`; `core/src/lib/config.ts:15` |
| `NEXT_PUBLIC_LIVEKIT_URL` | `ws://localhost:7880` | URL (ws://... alebo wss://...) | * | `core/.env.example:7`; `core/.env.local:2` |
| `NEXT_PUBLIC_UE5_STREAM_URL` | `` (unset) | URL (https?://...) | L/M/S | `core/src/lib/ue5-bridge/index.ts:18` |
| `NEXTAUTH_SECRET` | `change-me-in-production` | lubovolny string (min. 32 znakov pre prod) | * | `core/.env.example:10`; `core/.env.local:3` |
| `NEXTAUTH_URL` | `http://localhost:3000` | URL (http://...) | * | `core/.env.example:11`; `core/.env.local:4` |
| `NODE_ENV` | `development` | `development`, `production` | * | `.env.example:104` |
| `DEMO_PASSWORD` | `edututor2026` | lubovolny string | * | `core/.env.example:16`; `core/src/lib/auth.ts:11` |
| `API_PROXY_TARGET` | `http://localhost:8000` | URL (server-only, no NEXT_PUBLIC_ prefix) | * | `core/next.config.js:8` |
| `core/src/lib/config.ts API_BASE` (runtime) | `http://localhost:8000` | odvodene z `NEXT_PUBLIC_API_URL` | * | `core/src/lib/config.ts:14-15` |
| `core/src/lib/config.ts WS_BASE` (runtime) | `ws://localhost:8000` | odvodene z `API_BASE` | * | `core/src/lib/config.ts:17` |

### Detailné parametre

#### `NEXT_PUBLIC_API_URL`
- **Default:** `http://localhost:8000`
- **Range:** URL (http://...)
- **Tier:** * (any)
- **Why this default:** Backend FastAPI beží na porte 8000 — štandardný port pre Python web servery. `NEXT_PUBLIC_` prefix znamená, že hodnota je dostupná v prehliadači (client-side). Pre produkčné nasadenie nastav na HTTPS URL backendu.
- **Override scenarios:**
  - **Tier L (laptop):** Ponechaj default pre lokálny vývoj.
  - **Tier S (server):** Nastav na `https://api.edututor.ai` alebo interný URL backendu.
- **Related:** `API_PROXY_TARGET`, `NEXTAUTH_URL`
- **Source:** [`core/.env.example:4`](../core/.env.example), [`core/src/lib/config.ts:15`](../core/src/lib/config.ts)

---

#### `NEXT_PUBLIC_LIVEKIT_URL`
- **Default:** `ws://localhost:7880`
- **Range:** URL (ws://... alebo wss://...)
- **Tier:** * (any)
- **Why this default:** LiveKit server štandardne počúva na porte 7880. `ws://` pre lokálny vývoj; `wss://` pre produkciu (TLS). Frontend potrebuje túto URL pre WebRTC spojenie s LiveKit roomom.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `wss://livekit.edututor.ai` pre produkčný LiveKit server.
- **Related:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`
- **Source:** [`core/.env.example:7`](../core/.env.example), [`core/.env.local:2`](../core/.env.local)

---

#### `NEXTAUTH_SECRET`
- **Default:** `change-me-in-production`
- **Range:** Akýkoľvek string (min. 32 znakov pre prod)
- **Tier:** * (any)
- **Why this default:** NextAuth.js vyžaduje secret pre podpisovanie JWT tokenov. Default hodnota je zámerný placeholder — jasne signalizuje, že musí byť zmenená pred produkčným nasadením. Slabý secret by umožnil falšovanie session tokenov.
- **Override scenarios:**
  - **Tier S (server):** Nastav na náhodný 64-znakový string: `openssl rand -base64 48`.
- **Related:** `NEXTAUTH_URL`, `DEMO_PASSWORD`
- **Source:** [`core/.env.example:10`](../core/.env.example), [`core/.env.local:3`](../core/.env.local)
- **Notes:** Nikdy necommituj skutočný secret do repozitára.

---

#### `NEXTAUTH_URL`
- **Default:** `http://localhost:3000`
- **Range:** URL (http://...)
- **Tier:** * (any)
- **Why this default:** NextAuth.js potrebuje vedieť svoju vlastnú URL pre OAuth callback a redirect. Port 3000 je štandardný Next.js dev server port. Pre produkciu nastav na HTTPS URL frontendu.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `https://edututor.ai` pre produkčné nasadenie.
- **Related:** `NEXTAUTH_SECRET`, `NEXT_PUBLIC_API_URL`
- **Source:** [`core/.env.example:11`](../core/.env.example), [`core/.env.local:4`](../core/.env.local)

---

#### `NODE_ENV`
- **Default:** `development`
- **Range:** `development`, `production`
- **Tier:** * (any)
- **Why this default:** `development` aktivuje Next.js dev mode — hot reload, detailné chybové správy, source maps. Pre produkčný build nastav na `production` — optimalizovaný bundle, minifikácia, bez dev tools.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `production` pre produkčný build (`npm run build && npm start`).
- **Related:** `APP_ENV`, `DEBUG`
- **Source:** [`.env.example:104`](../.env.example)

---

#### `DEMO_PASSWORD`
- **Default:** `edututor2026`
- **Range:** Akýkoľvek string
- **Tier:** * (any)
- **Why this default:** Demo heslo pre jednoduchú autentifikáciu v demo/prototyp nasadeniach. Nie je určené pre produkciu — slúži pre grant demo a prezentácie. Pre produkciu implementuj plnohodnotnú autentifikáciu (Phase 9: magic-link/OAuth).
- **Override scenarios:**
  - **Tier L/M (laptop/macbook):** Zmeň na vlastné heslo pre demo prezentácie.
  - **Tier S (server):** Nastav na silné heslo alebo deaktivuj demo auth a implementuj OAuth.
- **Related:** `NEXTAUTH_SECRET`, `EDUTUTOR_API_KEY`
- **Source:** [`core/.env.example:16`](../core/.env.example), [`core/src/lib/auth.ts:11`](../core/src/lib/auth.ts)

---

#### `API_PROXY_TARGET`
- **Default:** `http://localhost:8000`
- **Range:** URL (server-only, bez `NEXT_PUBLIC_` prefixu)
- **Tier:** * (any)
- **Why this default:** Next.js API proxy presmeruje `/api/*` requesty na backend. Server-only (bez `NEXT_PUBLIC_`) — URL nie je exponovaná klientovi. Umožňuje frontend a backend na rovnakom porte (3000) cez proxy.
- **Override scenarios:**
  - **Tier S (server):** Nastav na interný URL backendu (napr. `http://tutor-service:8000` v Docker Compose).
- **Related:** `NEXT_PUBLIC_API_URL`, `CORS_ORIGINS`
- **Source:** [`core/next.config.js:8`](../core/next.config.js)

---

#### `core/src/lib/config.ts API_BASE` (runtime)
- **Default:** `http://localhost:8000` (odvodené z `NEXT_PUBLIC_API_URL`)
- **Range:** URL
- **Tier:** * (any)
- **Why this default:** Runtime konštanta odvodená z `NEXT_PUBLIC_API_URL`. Centralizuje API URL pre všetky fetch volania vo frontende — zmena `NEXT_PUBLIC_API_URL` automaticky aktualizuje všetky API volania.
- **Override scenarios:**
  - Nie je priamo konfigurovateľné — nastav `NEXT_PUBLIC_API_URL`.
- **Related:** `NEXT_PUBLIC_API_URL`, `core/src/lib/config.ts WS_BASE`
- **Source:** [`core/src/lib/config.ts:14-15`](../core/src/lib/config.ts)

---

#### `core/src/lib/config.ts WS_BASE` (runtime)
- **Default:** `ws://localhost:8000` (odvodené z `API_BASE`)
- **Range:** URL (ws://... alebo wss://...)
- **Tier:** * (any)
- **Why this default:** WebSocket URL pre avatar broadcaster je odvodená z `API_BASE` — automaticky prepne na `wss://` keď `API_BASE` je `https://`. Tým sa eliminuje potreba separátnej WebSocket URL konfigurácie.
- **Override scenarios:**
  - Nie je priamo konfigurovateľné — nastav `NEXT_PUBLIC_API_URL`.
- **Related:** `NEXT_PUBLIC_API_URL`, `WS_ALLOWED_ORIGINS`
- **Source:** [`core/src/lib/config.ts:17`](../core/src/lib/config.ts)

---

## 11. Deployment

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `DATABASE_URL` | `` (SQLite auto) | `postgresql+asyncpg://...` alebo prazdny | * | `.env.example:80`; `tutor-service/app/database.py:6` |
| `SQLITE_PATH` | `./data/edututor.db` | filesystem cesta | * | `.env.example:175`; `tutor-service/app/database.py:38` |
| `REDIS_URL` | `redis://localhost:6379/0` | URL (redis://...) | S | `.env.example:178`; `tutor-service/.env:9` |
| `POSTGRES_PASSWORD` | `edututor_secure_password` | lubovolny string | S | `docker-compose.yml:9`; `tutor-service/.env:6` |
| `POSTGRES_DB` (docker) | `edututor` | lubovolny db nazov | S | `docker-compose.yml:7` |
| `POSTGRES_USER` (docker) | `edututor` | lubovolny user | S | `docker-compose.yml:8` |
| `CORS_ORIGINS` | `` (localhost defaults: 3000, 3001, 3002 + `https://edututor.ai`) | ciarkou oddelene URL | * | `.env.example:109`; `tutor-service/app/main.py:212-225` |
| `APP_ENV` | `development` | `development`, `production`, `staging` | * | `.env.example:95`; `tutor-service/.env:56` |
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` | * | `.env.example:123`; `tutor-service/.env:58` |
| `DEBUG` | `true` | `true`/`false` | * | `.env.example:122`; `tutor-service/.env:57` |
| `EDU_DEV_MODE` | `1` | `0`/`1`/`true`/`false`/`yes` | * | `.env.example:220`; `tutor-service/app/api/avatar_dev.py:29` |
| `EDUTUTOR_API_KEY` | `` (unset) | lubovolny string | * | `.env.example:228`; `tutor-service/app/main.py:192` |
| `HF_HOME` | `/data/huggingface` | filesystem cesta | M/S | `docker-compose.yml:56`; `tutor-service/Dockerfile:5` |
| `TRANSFORMERS_CACHE` | `/data/huggingface` | filesystem cesta | M/S | `docker-compose.yml:57`; `tutor-service/Dockerfile:6` |
| `HUGGINGFACE_TOKEN` | `` (unset) | HF token | M/S | `docker-compose.yml:58` |
| `GRAFANA_PASSWORD` (docker) | `edututor` | lubovolny string | S | `docker-compose.prod.yml:32` |
| `_MAX_ENTRIES` performance trace (hardcoded) | `200` | `>=1` | * | `tutor-service/app/api/performance.py:9` |
| `_AUDIO_CHUNK_FIRST_MAX_RAW_BYTES` (hardcoded) | `3072` | `>=1` | * | `tutor-service/app/api/chat.py:168` |
| `_AUDIO_CHUNK_MAX_RAW_BYTES` (hardcoded) | `24576` | `>=1` | * | `tutor-service/app/api/chat.py:169` |

### Detailné parametre

#### `DATABASE_URL`
- **Default:** `` (SQLite auto)
- **Range:** `postgresql+asyncpg://...` alebo prázdny
- **Tier:** * (any)
- **Why this default:** Prázdny string aktivuje SQLite fallback — databáza sa vytvorí automaticky na ceste `SQLITE_PATH`. SQLite je dostatočný pre prototyp a Tier L/M nasadenia. Pre Tier S produkciu nastav PostgreSQL URL pre lepší výkon a konkurentný prístup.
- **Override scenarios:**
  - **Tier L (laptop):** Ponechaj prázdne — SQLite je dostatočný.
  - **Tier S (server):** Nastav na `postgresql+asyncpg://edututor:password@postgres:5432/edututor` pre Docker Compose.
- **Related:** `SQLITE_PATH`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- **Source:** [`.env.example:80`](../.env.example), [`tutor-service/app/database.py:6`](../tutor-service/app/database.py)

---

#### `SQLITE_PATH`
- **Default:** `./data/edututor.db`
- **Range:** Filesystem cesta
- **Tier:** * (any)
- **Why this default:** SQLite databáza pre lokálny vývoj. Relatívna cesta `./data/` je konzistentná s ostatnými dátovými súbormi. Pre Docker je potrebný volume mount.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `/data/edututor.db` pre Docker volume mount; alebo použi PostgreSQL.
- **Related:** `DATABASE_URL`, `MEMORY_PERSIST_PATH`
- **Source:** [`.env.example:175`](../.env.example), [`tutor-service/app/database.py:38`](../tutor-service/app/database.py)

---

#### `REDIS_URL`
- **Default:** `redis://localhost:6379/0`
- **Range:** URL (redis://...)
- **Tier:** S
- **Why this default:** Redis je používaný pre session caching a rate limiting na Tier S. Štandardný port 6379, databáza 0. Pre Tier L/M nie je Redis potrebný — backend funguje bez neho.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `redis://redis:6379/0` pre Docker Compose; na `redis://<redis-server>:6379/0` pre externý Redis.
- **Related:** `DATABASE_URL`, `APP_ENV`
- **Source:** [`.env.example:178`](../.env.example), [`tutor-service/.env:9`](../tutor-service/.env)

---

#### `POSTGRES_PASSWORD`
- **Default:** `edututor_secure_password`
- **Range:** Akýkoľvek string
- **Tier:** S
- **Why this default:** Default heslo pre Docker Compose PostgreSQL kontajner. Zámerný placeholder — musí byť zmenený pre produkčné nasadenie. Používa sa v `docker-compose.yml` pre inicializáciu PostgreSQL.
- **Override scenarios:**
  - **Tier S (server):** Nastav na silné náhodné heslo; uložiť do Docker secrets alebo Vault.
- **Related:** `DATABASE_URL`, `POSTGRES_DB`, `POSTGRES_USER`
- **Source:** [`docker-compose.yml:9`](../docker-compose.yml), [`tutor-service/.env:6`](../tutor-service/.env)

---

#### `POSTGRES_DB` (docker)
- **Default:** `edututor`
- **Range:** Akýkoľvek databázový názov
- **Tier:** S
- **Why this default:** Názov PostgreSQL databázy. Konzistentný s `DATABASE_URL` — musí zodpovedať databázovému názvu v connection stringu.
- **Override scenarios:**
  - **Tier S (server):** Zmeň pre multi-tenant nasadenia alebo ak existujúca PostgreSQL inštancia má iné konvencie.
- **Related:** `DATABASE_URL`, `POSTGRES_PASSWORD`, `POSTGRES_USER`
- **Source:** [`docker-compose.yml:7`](../docker-compose.yml)

---

#### `POSTGRES_USER` (docker)
- **Default:** `edututor`
- **Range:** Akýkoľvek databázový používateľ
- **Tier:** S
- **Why this default:** PostgreSQL používateľ pre EduTutor databázu. Konzistentný s `DATABASE_URL` — musí zodpovedať používateľovi v connection stringu.
- **Override scenarios:**
  - **Tier S (server):** Zmeň pre produkčné nasadenie s existujúcou PostgreSQL inštanciou.
- **Related:** `DATABASE_URL`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- **Source:** [`docker-compose.yml:8`](../docker-compose.yml)

---

#### `CORS_ORIGINS`
- **Default:** `` (localhost defaults: 3000, 3001, 3002 + `https://edututor.ai`)
- **Range:** Čiarkou oddelené URL
- **Tier:** * (any)
- **Why this default:** Prázdny string aktivuje bezpečné localhost defaults — CORS je povolený len pre lokálny vývoj a produkčnú doménu. Pre nasadenie na vlastnej doméne je potrebné explicitne pridať doménu.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `https://yourdomain.com,https://www.yourdomain.com` pre produkčné nasadenie.
- **Related:** `WS_ALLOWED_ORIGINS`, `APP_ENV`
- **Source:** [`.env.example:109`](../.env.example), [`tutor-service/app/main.py:212-225`](../tutor-service/app/main.py)

---

#### `APP_ENV`
- **Default:** `development`
- **Range:** `development`, `production`, `staging`
- **Tier:** * (any)
- **Why this default:** `development` aktivuje debug features, verbose logging a relaxované bezpečnostné nastavenia. Pre produkciu nastav na `production` — aktivuje stricter CORS, vypne debug endpoints, zvýši log level.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `production` pre produkčné nasadenie; `staging` pre staging prostredie.
- **Related:** `DEBUG`, `LOG_LEVEL`, `EDU_DEV_MODE`
- **Source:** [`.env.example:95`](../.env.example), [`tutor-service/.env:56`](../tutor-service/.env)

---

#### `LOG_LEVEL`
- **Default:** `INFO`
- **Range:** `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
- **Tier:** * (any)
- **Why this default:** `INFO` je dostatočný pre väčšinu nasadení — loguje dôležité udalosti bez zahltenia logov. `DEBUG` by logoval každý LLM token a WebSocket správu — vhodné len pre debugging.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `DEBUG` pre detailné debugovanie LLM/TTS/STT pipeline.
  - **Tier S (server):** Nastav na `WARNING` pre produkciu — znižuje I/O záťaž.
- **Related:** `DEBUG`, `APP_ENV`
- **Source:** [`.env.example:123`](../.env.example), [`tutor-service/.env:58`](../tutor-service/.env)

---

#### `DEBUG`
- **Default:** `true`
- **Range:** `true`/`false`
- **Tier:** * (any)
- **Why this default:** `true` aktivuje FastAPI debug mode — detailné chybové správy v HTTP odpovediach, auto-reload pri zmene kódu. Pre produkciu nastav na `false` — skryje interné chyby pred klientmi.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `false` pre produkciu — bezpečnostný dôvod (stack traces nesmú byť viditeľné klientom).
- **Related:** `LOG_LEVEL`, `APP_ENV`, `EDU_DEV_MODE`
- **Source:** [`.env.example:122`](../.env.example), [`tutor-service/.env:57`](../tutor-service/.env)

---

#### `EDUTUTOR_API_KEY`
- **Default:** `` (unset)
- **Range:** Akýkoľvek string
- **Tier:** * (any)
- **Why this default:** Nenastavené — API je verejne prístupné bez autentifikácie. Pre produkčné nasadenie nastav na náhodný string a vyžaduj `X-EduTutor-API-Key` header od klientov.
- **Override scenarios:**
  - **Tier S (server):** Nastav na náhodný 32+ znakový string pre ochranu API.
- **Related:** `X-EduTutor-API-Key`, `CORS_ORIGINS`
- **Source:** [`.env.example:228`](../.env.example), [`tutor-service/app/main.py:192`](../tutor-service/app/main.py)

---

#### `HF_HOME`
- **Default:** `/data/huggingface`
- **Range:** Filesystem cesta
- **Tier:** M/S
- **Why this default:** HuggingFace cache adresár pre stiahnuté modely. `/data/huggingface` je Docker volume mount cesta — modely sa stiahnu raz a zachovajú pri reštarte kontajnera. Pre lokálny vývoj bez Dockeru je default `~/.cache/huggingface`.
- **Override scenarios:**
  - **Tier M (macbook):** Nastav na `~/.cache/huggingface` pre lokálny vývoj mimo Dockeru.
  - **Tier S (server):** Ponechaj `/data/huggingface` pre Docker volume mount.
- **Related:** `TRANSFORMERS_CACHE`, `HUGGINGFACE_TOKEN`
- **Source:** [`docker-compose.yml:56`](../docker-compose.yml), [`tutor-service/Dockerfile:5`](../tutor-service/Dockerfile)

---

#### `TRANSFORMERS_CACHE`
- **Default:** `/data/huggingface`
- **Range:** Filesystem cesta
- **Tier:** M/S
- **Why this default:** Alias pre `HF_HOME` — staršia konvencia pre HuggingFace Transformers cache. Oba parametre by mali ukazovať na rovnaký adresár pre konzistentnosť.
- **Override scenarios:**
  - Nastav rovnako ako `HF_HOME`.
- **Related:** `HF_HOME`, `HUGGINGFACE_TOKEN`
- **Source:** [`docker-compose.yml:57`](../docker-compose.yml), [`tutor-service/Dockerfile:6`](../tutor-service/Dockerfile)

---

#### `HUGGINGFACE_TOKEN`
- **Default:** `` (unset)
- **Range:** HuggingFace token `hf_...`
- **Tier:** M/S
- **Why this default:** Nenastavené — väčšina modelov je verejne dostupná bez tokenu. Token je potrebný len pre gated modely (napr. Llama 3, Gemma) alebo pre upload modelov.
- **Override scenarios:**
  - **Tier M/S:** Nastav ak chceš stiahnut gated model (napr. `meta-llama/Llama-3.1-8B-Instruct`).
- **Related:** `HF_HOME`, `TRANSFORMERS_CACHE`
- **Source:** [`docker-compose.yml:58`](../docker-compose.yml)

---

#### `GRAFANA_PASSWORD` (docker)
- **Default:** `edututor`
- **Range:** Akýkoľvek string
- **Tier:** S
- **Why this default:** Default heslo pre Grafana monitoring dashboard v Docker Compose. Zámerný placeholder — musí byť zmenený pre produkčné nasadenie.
- **Override scenarios:**
  - **Tier S (server):** Nastav na silné heslo pre produkčný Grafana.
- **Related:** `APP_ENV`, `LOG_LEVEL`
- **Source:** [`docker-compose.prod.yml:32`](../docker-compose.prod.yml)

---

#### `_MAX_ENTRIES` performance trace (hardcoded)
- **Default:** `200`
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** Performance trace endpoint (`/api/performance`) uchováva posledných 200 záznamov v pamäti. Viac záznamov by zvyšovalo pamäťovú záťaž bez pridanej hodnoty — 200 záznamov pokryje posledných ~10 minút pri normálnej záťaži.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `LOG_LEVEL`, `DEBUG`
- **Source:** [`tutor-service/app/api/performance.py:9`](../tutor-service/app/api/performance.py)

---

#### `_AUDIO_CHUNK_FIRST_MAX_RAW_BYTES` (hardcoded)
- **Default:** `3072` (3 KB)
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** Prvý audio chunk je obmedzený na 3KB — menší ako ostatné chunky. Prvý chunk musí byť dostatočne malý pre rýchly Time-to-First-Audio (TTFA). Browser MSE buffer potrebuje malý prvý chunk pre rýchle začatie prehrávania.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_AUDIO_CHUNK_MAX_RAW_BYTES`, `UE5_BROADCAST_DELAY_MS`
- **Source:** [`tutor-service/app/api/chat.py:168`](../tutor-service/app/api/chat.py)

---

#### `_AUDIO_CHUNK_MAX_RAW_BYTES` (hardcoded)
- **Default:** `24576` (24 KB)
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** Maximálna veľkosť audio chunku pre streaming. 24KB je dobrý kompromis — dostatočne veľký pre efektívny streaming, dostatočne malý pre nízku latenciu. Väčšie chunky by zvyšovali latenciu medzi audio segmentmi.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_AUDIO_CHUNK_FIRST_MAX_RAW_BYTES`, `TTS_OUTPUT_FORMAT`
- **Source:** [`tutor-service/app/api/chat.py:169`](../tutor-service/app/api/chat.py)

---

## 12. LiveKit

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `LIVEKIT_URL` | `ws://localhost:7880` | URL (ws://... alebo wss://...) | * | `.env.example:237`; `tutor-service/.env:15`; `tutor-service/app/api/conversations.py:43`; `tutor-service/app/agent_worker.py:309` |
| `LIVEKIT_API_KEY` | `devkey` | LiveKit API key | * | `.env.example:238`; `tutor-service/.env:16`; `tutor-service/app/api/conversations.py:44`; `tutor-service/app/agent_worker.py:310` |
| `LIVEKIT_API_SECRET` | `edututor_livekit_secret_key_32chars` | LiveKit API secret | * | `.env.example:239`; `tutor-service/.env:17`; `tutor-service/app/api/conversations.py:45`; `tutor-service/app/agent_worker.py:311` |
| `NEXT_PUBLIC_LIVEKIT_URL` | `ws://localhost:7880` | URL (ws://... alebo wss://...) | * | `core/.env.example:7`; `core/.env.local:2` |

### Detailné parametre

#### `LIVEKIT_URL`
- **Default:** `ws://localhost:7880`
- **Range:** URL (ws://... alebo wss://...)
- **Tier:** * (any)
- **Why this default:** LiveKit server štandardne počúva na porte 7880. `ws://` pre lokálny vývoj; `wss://` pre produkciu. Backend používa túto URL pre vytvorenie LiveKit room tokenov a agent worker spojenie.
- **Override scenarios:**
  - **Tier L (laptop):** Ponechaj default pre lokálny LiveKit server.
  - **Tier S (server):** Nastav na `wss://livekit.edututor.ai` pre produkčný LiveKit Cloud alebo self-hosted server.
- **Related:** `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`
- **Source:** [`.env.example:237`](../.env.example), [`tutor-service/.env:15`](../tutor-service/.env), [`tutor-service/app/api/conversations.py:43`](../tutor-service/app/api/conversations.py)

---

#### `LIVEKIT_API_KEY`
- **Default:** `devkey`
- **Range:** LiveKit API key
- **Tier:** * (any)
- **Why this default:** `devkey` je štandardný development API key pre lokálny LiveKit server. Pre produkčný LiveKit Cloud alebo self-hosted server s autentifikáciou je potrebný skutočný API key z LiveKit dashboard.
- **Override scenarios:**
  - **Tier S (server):** Nastav na API key z LiveKit Cloud dashboard alebo z `livekit-server --keys` konfigurácie.
- **Related:** `LIVEKIT_URL`, `LIVEKIT_API_SECRET`
- **Source:** [`.env.example:238`](../.env.example), [`tutor-service/.env:16`](../tutor-service/.env), [`tutor-service/app/agent_worker.py:310`](../tutor-service/app/agent_worker.py)

---

#### `LIVEKIT_API_SECRET`
- **Default:** `edututor_livekit_secret_key_32chars`
- **Range:** LiveKit API secret (min. 32 znakov)
- **Tier:** * (any)
- **Why this default:** Zámerný placeholder s dostatočnou dĺžkou (32 znakov) pre lokálny vývoj. LiveKit vyžaduje secret min. 32 znakov pre HMAC podpisovanie tokenov. Pre produkciu nastav na náhodný 64-znakový string.
- **Override scenarios:**
  - **Tier S (server):** Nastav na náhodný secret: `openssl rand -base64 48`. Musí zodpovedať konfigurácii LiveKit servera.
- **Related:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`
- **Source:** [`.env.example:239`](../.env.example), [`tutor-service/.env:17`](../tutor-service/.env), [`tutor-service/app/api/conversations.py:45`](../tutor-service/app/api/conversations.py)
- **Notes:** Nikdy necommituj skutočný secret do repozitára.

---

#### `NEXT_PUBLIC_LIVEKIT_URL`
- **Default:** `ws://localhost:7880`
- **Range:** URL (ws://... alebo wss://...)
- **Tier:** * (any)
- **Why this default:** Frontend potrebuje LiveKit URL pre WebRTC spojenie priamo z prehliadača. `NEXT_PUBLIC_` prefix exponuje URL klientovi. Musí zodpovedať `LIVEKIT_URL` na backende.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `wss://livekit.edututor.ai` — rovnaká hodnota ako backend `LIVEKIT_URL`.
- **Related:** `LIVEKIT_URL`, `LIVEKIT_API_KEY`
- **Source:** [`core/.env.example:7`](../core/.env.example), [`core/.env.local:2`](../core/.env.local)

---

## 13. Skill backend

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `WEB_SEARCH_ENABLED` | `false` | `true`/`false` | * | `.env.example:135`; `tutor-service/app/skills/web_search/skill.py:57` |
| `_MAX_SEARCH_RESULTS` (hardcoded, DuckDuckGo) | `5` | `>=1` | * | `tutor-service/app/skills/web_search/skill.py:39` |
| `_MAX_SEARCH_BODY_CHARS` (hardcoded) | `200` | `>=1` | * | `tutor-service/app/skills/web_search/skill.py:40` |
| `_MAX_FETCH_BODY_CHARS` (hardcoded) | `500` | `>=1` | * | `tutor-service/app/skills/web_search/skill.py:41` |
| `_MAX_FETCH_HTML_BYTES` (hardcoded) | `2097152` (2 MB) | `>=1` | * | `tutor-service/app/skills/web_search/skill.py:42` |
| `FSRS Card() defaults` (kniznica `fsrs`) | `w=[0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]`, `request_retention=0.9`, `maximum_interval=36500` | FSRS parametre z kniznice | * | `tutor-service/app/skills/spaced_repetition/skill.py:49-50` (TBD verify: defaults from `fsrs` library v5.x) |
| `SpacedRepetitionSkill _VALID_RATINGS` (hardcoded) | `{"again", "hard", "good", "easy"}` | enum set | * | `tutor-service/app/skills/spaced_repetition/skill.py:36` |
| `SpacedRepetition due_cards limit` (runtime) | ziaden explicitny max limit; `store.list_due(limit)` | volany s `limit` parametrom z LLM | * | `tutor-service/app/skills/spaced_repetition/store.py:53` |
| `MemorySkill` (episodic, v ramci skills) | Implicitna konfiguracia cez `episodic_memory_service` | `top_k=3` ako default | * | `tutor-service/app/services/episodic_memory_service.py:85` |
| `VoiceClone _MAX_AUDIO_BYTES` (hardcoded) | `31457280` (30 MB) | `>=1` | * | `tutor-service/app/api/voice_clones.py:33` |
| `Transformation _MAX_PROMPT_LEN` (hardcoded) | `2000` | `>=1` | * | `tutor-service/app/api/transformations.py:50` |

### Detailné parametre

#### `WEB_SEARCH_ENABLED`
- **Default:** `false`
- **Range:** `true`/`false`
- **Tier:** * (any)
- **Why this default:** Web search skill je vypnutý defaultne — pridáva latenciu (DuckDuckGo HTTP volanie) a môže vrátiť irelevantné výsledky. Pre základný tutoring je RAG knowledge base dostatočná. Aktivuj pre scenáre kde žiaci potrebujú aktuálne informácie (napr. správy, aktuálne udalosti).
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `true` pre demo kde chceš ukázať web search schopnosť.
  - **Tier S (server):** Nastav na `true` pre produkčné nasadenie s web search funkciou.
- **Related:** `_MAX_SEARCH_RESULTS`, `_MAX_SEARCH_BODY_CHARS`
- **Source:** [`.env.example:135`](../.env.example), [`tutor-service/app/skills/web_search/skill.py:57`](../tutor-service/app/skills/web_search/skill.py)

---

#### `_MAX_SEARCH_RESULTS` (hardcoded, DuckDuckGo)
- **Default:** `5`
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** 5 výsledkov je dostatočných pre väčšinu otázok — viac výsledkov by zvyšovalo latenciu a veľkosť LLM promptu. DuckDuckGo free API je rate-limited; menej výsledkov znižuje riziko rate limiting.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `WEB_SEARCH_ENABLED`, `_MAX_SEARCH_BODY_CHARS`
- **Source:** [`tutor-service/app/skills/web_search/skill.py:39`](../tutor-service/app/skills/web_search/skill.py)

---

#### `_MAX_SEARCH_BODY_CHARS` (hardcoded)
- **Default:** `200`
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** Maximálna dĺžka textu z každého search výsledku (snippet). 200 znakov je dostatočných pre kontext bez zahltenia LLM promptu. Celkový search kontext (5 výsledkov × 200 znakov) je cca 1000 znakov — rozumný príspevok do promptu.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_MAX_SEARCH_RESULTS`, `_MAX_FETCH_BODY_CHARS`
- **Source:** [`tutor-service/app/skills/web_search/skill.py:40`](../tutor-service/app/skills/web_search/skill.py)

---

#### `_MAX_FETCH_BODY_CHARS` (hardcoded)
- **Default:** `500`
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** Maximálna dĺžka textu pri fetch konkrétnej URL (nie search snippet). 500 znakov poskytuje viac kontextu ako search snippet pre detailné otázky.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_MAX_SEARCH_BODY_CHARS`, `_MAX_FETCH_HTML_BYTES`
- **Source:** [`tutor-service/app/skills/web_search/skill.py:41`](../tutor-service/app/skills/web_search/skill.py)

---

#### `_MAX_FETCH_HTML_BYTES` (hardcoded)
- **Default:** `2097152` (2 MB)
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** Maximálna veľkosť HTML stránky pri fetch. 2MB je dostatočné pre väčšinu webových stránok — väčšie stránky sú zvyčajne plné reklám a irelevantného obsahu. Limit zabraňuje stiahnutiu veľkých súborov (PDF, video stránky).
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `_MAX_FETCH_BODY_CHARS`, `WEB_SEARCH_ENABLED`
- **Source:** [`tutor-service/app/skills/web_search/skill.py:42`](../tutor-service/app/skills/web_search/skill.py)

---

#### `FSRS Card() defaults` (knižnica `fsrs`)
- **Default:** `w=[0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61]`, `request_retention=0.9`, `maximum_interval=36500`
- **Range:** FSRS parametre z knižnice
- **Tier:** * (any)
- **Why this default:** Tieto hodnoty sú štandardné defaults z `fsrs` Python knižnice (PyPI `fsrs>=5.0.0`). `w` vektor obsahuje 17 váh FSRS-5 algoritmu — kalibrované na veľkom datasete Anki kariet. `request_retention=0.9` znamená 90% cieľová retencia (žiak si pamätá 90% kariet). `maximum_interval=36500` je 100 rokov — prakticky neobmedzené.

  **Pozor:** Presné hodnoty `w` vektora závisia od verzie knižnice — overiť cez `pip show fsrs`. *[Appendix B parameter — viď Appendix B]*
- **Override scenarios:**
  - Pre personalizovaný FSRS: po nazbieraní dostatočného počtu hodnotení (500+) spusti FSRS optimizer na vlastných dátach pre lepšie `w` hodnoty.
- **Related:** `SpacedRepetitionSkill _VALID_RATINGS`, `MemorySkill`
- **Source:** [`tutor-service/app/skills/spaced_repetition/skill.py:49-50`](../tutor-service/app/skills/spaced_repetition/skill.py)

---

#### `SpacedRepetitionSkill _VALID_RATINGS` (hardcoded)
- **Default:** `{"again", "hard", "good", "easy"}`
- **Range:** enum set
- **Tier:** * (any)
- **Why this default:** Štyri hodnotenia zodpovedajú štandardnému FSRS/Anki modelu. `again` = zabudol, `hard` = ťažké, `good` = správne, `easy` = ľahké. Validácia zabraňuje neplatným hodnoteniam od LLM alebo klienta.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `FSRS Card() defaults`
- **Source:** [`tutor-service/app/skills/spaced_repetition/skill.py:36`](../tutor-service/app/skills/spaced_repetition/skill.py)

---

#### `SpacedRepetition due_cards limit` (runtime)
- **Default:** Žiadny explicitný max limit; `store.list_due(limit)` volaný s `limit` parametrom z LLM
- **Range:** Dynamický
- **Tier:** * (any)
- **Why this default:** Limit je dynamický — LLM rozhoduje koľko kariet zobraziť v jednej session. Bez pevného limitu môže LLM prispôsobiť počet kariet kontextu konverzácie (napr. "ukáž mi 5 kariet" vs "precvič všetky dnešné karty").
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — dynamický parameter.
- **Related:** `FSRS Card() defaults`, `MemorySkill`
- **Source:** [`tutor-service/app/skills/spaced_repetition/store.py:53`](../tutor-service/app/skills/spaced_repetition/store.py)

---

#### `MemorySkill` (episodic, v rámci skills)
- **Default:** Implicitná konfigurácia cez `episodic_memory_service`; `top_k=3` ako default
- **Range:** `top_k=3`
- **Tier:** * (any)
- **Why this default:** Memory skill používa rovnaký `episodic_memory_service` ako konverzačná pamäť — konzistentné správanie. `top_k=3` je rovnaký default ako pre priamy episodic memory retrieval.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — zdieľa konfiguráciu s `episodic_memory_service`.
- **Related:** `episodic_memory default top_k`, `MEMORY_PERSIST_PATH`
- **Source:** [`tutor-service/app/services/episodic_memory_service.py:85`](../tutor-service/app/services/episodic_memory_service.py)

---

#### `VoiceClone _MAX_AUDIO_BYTES` (hardcoded)
- **Default:** `31457280` (30 MB)
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** Maximálna veľkosť nahraného audio súboru pre voice cloning. 30MB je dostatočné pre 5-10 minút audio v MP3 formáte — dostatočné pre kvalitný voice clone. Väčšie súbory by zvyšovali čas spracovania a pamäťovú záťaž.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `OMNIVOICE_REFS_DIR`, `TTS_PROVIDER`
- **Source:** [`tutor-service/app/api/voice_clones.py:33`](../tutor-service/app/api/voice_clones.py)

---

#### `Transformation _MAX_PROMPT_LEN` (hardcoded)
- **Default:** `2000`
- **Range:** `>=1`
- **Tier:** * (any)
- **Why this default:** Maximálna dĺžka promptu pre text transformation endpoint. 2000 znakov je dostatočné pre väčšinu transformácií (preklad, sumarizácia, parafráza). Dlhší prompt by zvyšoval náklady a latenciu.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — hardcoded konštanta.
- **Related:** `LLM_MAX_NEW_TOKENS`, `LLM_PROVIDER_AUTO_SELECT`
- **Source:** [`tutor-service/app/api/transformations.py:50`](../tutor-service/app/api/transformations.py)

---

## 14. Diagnostika

### Súhrnná tabuľka

| Parameter | Default | Range/Values | Tier | Source |
|---|---|---|---|---|
| `LOG_LEVEL` | `INFO` | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` | * | `.env.example:123`; `tutor-service/.env:58` |
| `DEBUG` | `true` | `true`/`false` | * | `.env.example:122`; `tutor-service/.env:57` |
| `EMOTION_BACKEND` | `regex` | `regex`, `bert` | M/S | `.env.example:126` |
| `APP_ENV` | `development` | `development`, `production`, `staging` | * | `.env.example:95`; `tutor-service/.env:56` |
| `NODE_ENV` (frontend) | `development` | `development`, `production` | * | `.env.example:104` |
| `Core Web Vitals / Next.js` (runtime) | `reactStrictMode: true`, `output: standalone` | Next.js konfiguracia | * | `core/next.config.js:3-4` |

### Detailné parametre

#### `LOG_LEVEL`
- **Default:** `INFO`
- **Range:** `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL`
- **Tier:** * (any)
- **Why this default:** `INFO` je dostatočný pre diagnostiku bez zahltenia logov. Duplicitný s §11 Deployment — v sekcii Diagnostika je relevantný pre monitoring a troubleshooting kontext. Pre aktívne debugovanie nastav na `DEBUG`.
- **Override scenarios:**
  - **Tier L (laptop):** Nastav na `DEBUG` pre detailné logy LLM/TTS/STT pipeline počas vývoja.
  - **Tier S (server):** Nastav na `WARNING` pre produkciu — znižuje log volume a I/O záťaž.
- **Related:** `DEBUG`, `APP_ENV`, `EDU_DEV_MODE`
- **Source:** [`.env.example:123`](../.env.example), [`tutor-service/.env:58`](../tutor-service/.env)

---

#### `DEBUG`
- **Default:** `true`
- **Range:** `true`/`false`
- **Tier:** * (any)
- **Why this default:** `true` pre lokálny vývoj — FastAPI debug mode, auto-reload, detailné chybové správy. Pre produkciu nastav na `false`. Duplicitný s §11 — v Diagnostika sekcii je relevantný pre troubleshooting workflow.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `false` — stack traces nesmú byť viditeľné klientom.
- **Related:** `LOG_LEVEL`, `APP_ENV`
- **Source:** [`.env.example:122`](../.env.example), [`tutor-service/.env:57`](../tutor-service/.env)

---

#### `EMOTION_BACKEND`
- **Default:** `regex`
- **Range:** `regex`, `bert`
- **Tier:** M/S
- **Why this default:** `regex` je rýchly pattern-matching backend pre detekciu emócií v texte — bez GPU, bez modelu, okamžitá odpoveď. `bert` je presnejší ale vyžaduje načítanie BERT modelu (~400MB) a GPU pre rozumnú rýchlosť. Pre tutoring je `regex` dostatočný — detekuje základné emócie (radosť, frustrácia, zmätok) pre UE5 avatar animácie.
- **Override scenarios:**
  - **Tier M (macbook):** Nastav na `bert` pre presnejšiu detekciu emócií ak máš dostatočnú RAM (16GB+).
  - **Tier S (server):** Nastav na `bert` pre produkčnú kvalitu emotion detection.
- **Related:** `TTS_DEFAULT_EMOTION`, `UE5_BROADCAST_DELAY_MS`
- **Source:** [`.env.example:126`](../.env.example)

---

#### `APP_ENV`
- **Default:** `development`
- **Range:** `development`, `production`, `staging`
- **Tier:** * (any)
- **Why this default:** Duplicitný s §11 — v Diagnostika sekcii je relevantný pre monitoring a alerting konfiguráciu. `development` vypína produkčné alerting prahy.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `production` pre aktiváciu produkčných monitoring pravidiel.
- **Related:** `DEBUG`, `LOG_LEVEL`
- **Source:** [`.env.example:95`](../.env.example), [`tutor-service/.env:56`](../tutor-service/.env)

---

#### `NODE_ENV` (frontend)
- **Default:** `development`
- **Range:** `development`, `production`
- **Tier:** * (any)
- **Why this default:** Next.js frontend environment. `development` aktivuje React DevTools, source maps, hot reload. `production` produkuje optimalizovaný bundle bez debug overhead.
- **Override scenarios:**
  - **Tier S (server):** Nastav na `production` pre produkčný Next.js build.
- **Related:** `APP_ENV`, `DEBUG`
- **Source:** [`.env.example:104`](../.env.example)

---

#### `Core Web Vitals / Next.js` (runtime)
- **Default:** `reactStrictMode: true`, `output: standalone`
- **Range:** Next.js konfigurácia
- **Tier:** * (any)
- **Why this default:** `reactStrictMode: true` aktivuje React Strict Mode — detekuje potenciálne problémy v React kóde (double-render v dev, deprecated API). `output: standalone` generuje self-contained Next.js build vhodný pre Docker kontajner bez `node_modules`.
- **Override scenarios:**
  - Nie je konfigurovateľné cez env — nastavené v `core/next.config.js:3-4`. Pre zmenu uprav `next.config.js`.
- **Related:** `NODE_ENV`, `APP_ENV`
- **Source:** [`core/next.config.js:3-4`](../core/next.config.js)

---

## Appendix A: Sourcing Audit Trail

Subory skenovane pocas kompilacie (abecedne):

| Subor | Riadky | Typ |
|---|---|---|
| `.env.example` | 248 | Hlavny env template (root) |
| `.env.benchmark.baseline` | -- | Zmrazeny baseline config |
| `core/.env.example` | 16 | Frontend env template |
| `core/.env.local` | 4 | Frontend local dev config |
| `core/next.config.js` | 18 | Next.js build config |
| `core/src/lib/config.ts` | 19 | Frontend runtime config |
| `core/src/lib/auth.ts` | 11 | Auth config (DEMO_PASSWORD) |
| `core/src/lib/ue5-bridge/index.ts` | ~60 | UE5 stream URL handling |
| `docker-compose.yml` | ~120 | Dev Docker compose |
| `docker-compose.prod.yml` | 43 | Prod Docker compose |
| `tutor-service/.env` | 66 | Backend live config |
| `tutor-service/Dockerfile` | ~30 | Backend Docker build |
| `tutor-service/app/config/llm_config.py` | 164 | LLM config (pydantic) |
| `tutor-service/app/config/rag_config.py` | 101 | RAG config (pydantic) |
| `tutor-service/app/config/tts_config.py` | 85 | TTS config (pydantic) |
| `tutor-service/app/config/learning_modes.py` | 190 | Learning modes dataclasses |
| `tutor-service/app/config/__init__.py` | 15 | Config module init |
| `tutor-service/app/api/chat.py` | ~900 | Chat endpoint (UE5 delay, audio chunk caps) |
| `tutor-service/app/api/ws_avatar.py` | 124 | WebSocket avatar endpoint |
| `tutor-service/app/api/avatar_dev.py` | ~40 | Dev mode avatar injector |
| `tutor-service/app/api/voice_clones.py` | ~200 | Voice clone management |
| `tutor-service/app/api/transformations.py` | ~80 | Text transformation endpoint |
| `tutor-service/app/api/performance.py` | ~70 | Performance tracing |
| `tutor-service/app/api/conversations.py` | ~450 | LiveKit room management |
| `tutor-service/app/services/llm_service.py` | ~720 | LLM provider dispatch |
| `tutor-service/app/services/stt_service.py` | ~540 | STT provider registry |
| `tutor-service/app/services/tts_service.py` | ~949 | TTS provider dispatch |
| `tutor-service/app/services/avatar_broadcaster.py` | ~160 | Avatar WS broadcaster |
| `tutor-service/app/services/viseme_timeline.py` | 497 | Viseme timeline builder |
| `tutor-service/app/services/audio2lipsync_client.py` | 233 | Audio2Lipsync inference |
| `tutor-service/app/services/memory_service.py` | 100 | Conversation memory |
| `tutor-service/app/services/episodic_memory_service.py` | 105 | Episodic memory |
| `tutor-service/app/services/conversation_summarizer.py` | 50 | Post-conversation summarizer |
| `tutor-service/app/services/chroma_rag_service.py` | ~80 | Chroma RAG client |
| `tutor-service/app/middleware/user_identity.py` | ~100 | User identity middleware |
| `tutor-service/app/database.py` | ~120 | Database setup (SQLite/Postgres) |
| `tutor-service/app/main.py` | ~250 | FastAPI app (CORS, API key) |
| `tutor-service/app/skills/web_search/skill.py` | ~180 | Web search skill |
| `tutor-service/app/skills/spaced_repetition/skill.py` | ~200 | FSRS flashcard skill |
| `tutor-service/app/skills/spaced_repetition/store.py` | 62 | FSRS SQL store |
| `tutor-service/app/agent_worker.py` | ~400 | LiveKit agent worker |

**Celkovo:** ~41 suborov, ~6000+ riadkov.

---

## Appendix C: Per-Tier Quick-Reference Configurations

Pre kopirovanie do `deploy/profiles/` pozri samostatne `.env` subory v nom direktorari (light, macbook, server, power). Nizsie je odovodnenie kazdej volby.

### Tier definicie

| Tier | Label | RAM | GPU | Cielova skupina | Max pouzivatelov |
|---|---|---|---|---|---|
| **L** | Light | <10 GB | ziadny / Intel iGPU | Demo, developer, single user | 1-3 |
| **M** | MacBook | 16 GB unified | Apple M2/M3 Pro (MPS) | Ucitel, mala trieda | 5-15 |
| **S** | Server | 32-64 GB | ziadny / RTX 4060 Ti | Skolsky lab, skola | 20-100 |
| **P** | Power | 64+ GB | RTX 4090 / A100 | District / region | 100-500 |

### LLM — recommended per tier

| Tier | Provider | Model | Preco |
|---|---|---|---|
| L | OpenAI (cloud) | `gpt-4o-mini` | Bez VRAM naroku, 1-2s latencia |
| M | Ollama (MPS) | `qwen2.5:7b` | 7B sa zmesti do 16 GB unified, ~500 tok/s na MPS |
| S | Ollama (CUDA) / vLLM | `qwen2.5:14b` / `Qwen2.5-32B-AWQ` | Vecsi model lepsia SK kvalita; AWQ pre 24 GB VRAM |
| P | vLLM | `Qwen2.5-32B` FP16 | Batch inferencia, 100+ req/s, najlepsia SK kvalita |

### STT — recommended per tier

| Tier | Provider | Model | Preco |
|---|---|---|---|
| L | faster-whisper (CPU) | `tiny` alebo `small` | ~1s latencia, 2-4 jadier zvladne |
| M | mlx-whisper (MPS) | `turbo` | ~500ms, optimalizovane pre Apple Silicon |
| S | faster-whisper (CUDA) | `large-v3` | Najlepsia presnost, CUDA akceleracia |
| P | faster-whisper (CUDA) | `large-v3` / slopal-fine-tuned | SK fine-tuned variant pre maximalnu WER redukciu |

### TTS — recommended per tier

| Tier | Provider | Voice | Preco |
|---|---|---|---|
| L | Edge TTS (cloud) | `sk-SK-LukasNeural` | Nulova lokalna zataz, 1-2s latencia |
| M | Edge TTS / Piper | `sk-SK-LukasNeural` / `sk_SK-lili-medium` | Offline fallback cez Piper (63 MB) |
| S | Piper / OmniVoice (CPU) | SK Piper + OmniVoice pre voice cloning | Vyssia kvalita, lokalna inferencia |
| P | OmniVoice (CUDA) | SK voice clone + Piper fallback | Full voice clone s CUDA akceleraciou |

### RAG — recommended per tier

| Tier | Backend | Embedding model | Chunk/Overlap/TopK | Preco |
|---|---|---|---|---|
| L | ChromaDB (embedded) | `paraphrase-multilingual-MiniLM-L12-v2` | 500/80/3 | SQLite backend, <1 GB RAM |
| M | ChromaDB (embedded) | `paraphrase-multilingual-MiniLM-L12-v2` | 500/80/5 | Rovnaky embedder, vacsi top_k |
| S | ChromaDB / Weaviate | `distiluse-base-multilingual-cased-v2` | 600/100/7 | Weaviate pre >10k dokumentov |
| P | Weaviate | `text-embedding-3-small` (OpenAI) | 800/120/10 | OpenAI embedding pre najlepsiu relevanciu |

### Emotion — recommended per tier

| Tier | Backend | Preco |
|---|---|---|
| L | regex | Nulova zataz, OK pre SK text sentiment |
| M | regex / transformers | Transformers emotions pre viac SK variacii |
| S | transformers | `cardiffnlp/twitter-xlm-roberta-base` |
| P | transformers (CUDA) | GPU-akcelerovana inferencia |

### Avatar / Lipsync — recommended per tier

| Tier | Path | Preco |
|---|---|---|
| L | Text → Viseme (CPU) | ~5ms, bezi vsade |
| M | Text → Viseme + Audio → ARKit (MPS) | ARKit pre MPS-akcelerovany HuBERT |
| S | Hybrid mode | ARKit ked audio dostupne, text fallback |
| P | Audio → ARKit (CUDA) | Full 60 fps 52-channel ARKit, CUDA HuBERT |

### Cross-cutting — recommended per tier

| Tier | `UE5_BROADCAST_DELAY_MS` | LiveKit | Voice cloning | Offline-ready |
|---|---|---|---|---|
| L | 0 (disabled) | volitelne | Nie | Nie (cloud LLM/TTS) |
| M | 150 | volitelne | Nie (RAM) | Ano s Ollama + Piper |
| S | 150 | Ano | Volitelne (CPU) | Ano lokalne modely |
| P | 80 | Ano | Ano (CUDA) | Ano lokalne modely |

---

## Appendix B: Parametre s `?` defaultom (vyzaduje human verify)

| Parameter | Default v tabulke | Dovod |
|---|---|---|
| `FSRS Card() library defaults` | `w=[...]` detaily | Defaulty z kniznice `fsrs` (PyPI `fsrs==5.x`). Presne hodnoty `w` vektora zavisle na verzii kniznice; tabulka pouziva standardne defaults pre `fsrs>=5.0.0`. TBD verify: `pip show fsrs`. |
| `OMNIVOICE_LANGUAGE` | `sk` | Kod v `tts_service.py:95` cita env, `.env.example:248` dokumentuje, ale `.env.example` nema explicitnu hodnotu; default `sk` je z kodu. |
| `RAG_CHUNK_OVERLAP` | `80` v kode vs `120` v `.env.example` | `.env.example:88` ma `RAG_CHUNK_OVERLAP=120`, ale kodovy default v `rag_config.py:52` je `80`. `.env.example` odporuca vyssi overlap. |
| `RAG_SIMILARITY_THRESHOLD` | `0.65` v kode vs `0.35` v `.env.example` | `.env.example:90` ma `RAG_SIMILARITY_THRESHOLD=0.35`, kodovy default je `0.65`. `.env.example` je menej prisny. |
