#!/bin/bash
set -e

# EduTutor.AI — Remote GPU Benchmark
# Run this on a Vast.ai / RunPod instance with GPU
# Usage: bash gpu_benchmark_remote.sh

echo "============================================"
echo "  EduTutor.AI — GPU Benchmark Setup"
echo "============================================"

# 1. System info
echo ""
echo ">> System info:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || echo "No GPU detected"
echo "RAM: $(free -h 2>/dev/null | awk '/^Mem:/{print $2}' || echo 'unknown')"
echo "CPU: $(nproc) cores"

# 2. Install Ollama
echo ""
echo ">> Installing Ollama..."
if ! command -v ollama &>/dev/null; then
    curl -fsSL https://ollama.ai/install.sh | sh
fi
ollama serve &>/dev/null &
sleep 5

# 3. Pull models
echo ""
echo ">> Pulling models..."
ollama pull mistral:latest
ollama pull gemma3:12b

# 4. Install Python deps
echo ""
echo ">> Installing Python..."
apt-get update -qq && apt-get install -y -qq python3-pip python3-venv curl > /dev/null 2>&1
pip3 install httpx fastapi uvicorn 2>/dev/null

# 5. Verify Ollama
echo ""
echo ">> Verifying Ollama models:"
ollama list

# 6. Run benchmark — direct Ollama inference (no full backend needed)
echo ""
echo "============================================"
echo "  Running LLM-only benchmark"
echo "============================================"

python3 << 'PYEOF'
import time
import json
import subprocess

MODELS = ["mistral:latest", "gemma3:12b"]
PROMPTS = [
    ("short", "Ahoj, môžeš mi vysvetliť čo je to Python."),
    ("medium", "Vysvetli mi dedičnosť v objektovo orientovanom programovaní."),
    ("long", "Konštruktor je špeciálna metóda v objektovo orientovanom programovaní. Volá sa automaticky pri vytváraní nového objektu a inicializuje jeho atribúty. V Pythone definujeme konštruktor pomocou metódy init."),
]

SYSTEM = "Si EduTutor, priateľský slovenský vzdelávací asistent. Tykaj študentom. Odpovedaj po slovensky, max 2-3 vety."

results = {}

for model in MODELS:
    print(f"\n>> Testing {model}...")
    model_results = []

    # Warmup
    subprocess.run(
        ["ollama", "run", model, "test"],
        capture_output=True, timeout=120
    )

    for label, prompt in PROMPTS:
        times = []
        for run in range(3):
            t0 = time.perf_counter()
            proc = subprocess.run(
                ["ollama", "run", model, prompt],
                capture_output=True, text=True, timeout=120,
                env={"HOME": "/root", "PATH": "/usr/local/bin:/usr/bin:/bin"}
            )
            elapsed = time.perf_counter() - t0
            times.append(elapsed)
            response = proc.stdout.strip()

        avg = sum(times) / len(times)
        best = min(times)
        model_results.append({
            "prompt": label,
            "times": [round(t, 3) for t in times],
            "avg_s": round(avg, 3),
            "best_s": round(best, 3),
            "response_preview": response[:120] if response else "empty",
        })
        print(f"  {label:<8} avg: {avg:.2f}s  best: {best:.2f}s  (runs: {[f'{t:.2f}' for t in times]})")

    results[model] = model_results

# Also test via Ollama API (closer to real usage)
print("\n>> Testing via Ollama API (OpenAI-compatible)...")
import urllib.request

api_results = {}
for model in MODELS:
    print(f"\n>> API test: {model}...")
    model_api = []
    for label, prompt in PROMPTS:
        times = []
        for run in range(3):
            payload = json.dumps({
                "model": model,
                "messages": [
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": prompt}
                ],
                "stream": False
            }).encode()
            req = urllib.request.Request(
                "http://localhost:11434/v1/chat/completions",
                data=payload,
                headers={"Content-Type": "application/json"}
            )
            t0 = time.perf_counter()
            try:
                resp = urllib.request.urlopen(req, timeout=120)
                data = json.loads(resp.read())
                elapsed = time.perf_counter() - t0
                times.append(elapsed)
                response = data["choices"][0]["message"]["content"]
            except Exception as e:
                elapsed = time.perf_counter() - t0
                times.append(elapsed)
                response = f"ERROR: {e}"

        avg = sum(times) / len(times)
        best = min(times)
        model_api.append({
            "prompt": label,
            "times": [round(t, 3) for t in times],
            "avg_s": round(avg, 3),
            "best_s": round(best, 3),
            "response_preview": response[:120] if response else "empty",
        })
        print(f"  {label:<8} avg: {avg:.2f}s  best: {best:.2f}s  (runs: {[f'{t:.2f}' for t in times]})")

    api_results[model] = model_api

# GPU info
import subprocess as sp
gpu_info = sp.run(["nvidia-smi", "--query-gpu=name,memory.total,memory.used,temperature.gpu,power.draw",
                    "--format=csv,noheader"], capture_output=True, text=True).stdout.strip()

all_results = {
    "gpu": gpu_info,
    "cli_benchmark": results,
    "api_benchmark": api_results,
    "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
}

with open("/tmp/gpu_benchmark_results.json", "w") as f:
    json.dump(all_results, f, indent=2, ensure_ascii=False)

print("\n============================================")
print("  RESULTS SUMMARY")
print("============================================")
print(f"GPU: {gpu_info}")
print(f"\n{'Model':<20} {'Short':>8} {'Medium':>8} {'Long':>8}  (API avg)")
print(f"{'─'*20} {'─'*8} {'─'*8} {'─'*8}")
for model in MODELS:
    vals = api_results.get(model, [])
    short = next((v["avg_s"] for v in vals if v["prompt"]=="short"), -1)
    med = next((v["avg_s"] for v in vals if v["prompt"]=="medium"), -1)
    lng = next((v["avg_s"] for v in vals if v["prompt"]=="long"), -1)
    print(f"{model:<20} {short:>7.2f}s {med:>7.2f}s {lng:>7.2f}s")

print(f"\nResults saved to /tmp/gpu_benchmark_results.json")
print("Copy with: cat /tmp/gpu_benchmark_results.json")
PYEOF

echo ""
echo "============================================"
echo "  DONE — copy results above"
echo "============================================"
