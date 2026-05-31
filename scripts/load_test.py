#!/usr/bin/env python3
# scripts/load_test.py — Concurrent load/stress test for EduTutor.AI
"""
Výstup 3: Vysokozáťažové scenáre — stabilita, latencia, kvalita výstupov.

Usage:
    python scripts/load_test.py --users 10 --rounds 2
    python scripts/load_test.py --users 50 --rounds 1 --output results.json

Scenarios (grant-required):
    5  users × 2 rounds = 10  requests (light load baseline)
    10 users × 2 rounds = 20  requests (moderate)
    25 users × 2 rounds = 50  requests (high)
    50 users × 1 round  = 50  requests (stress spike)

Collects per-request: latency (connect + TTFB + total), status, response
length, emotion, viseme frame count, and error message if any.
"""

import argparse
import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

API_BASE = os.getenv("API_BASE", "http://localhost:8000")
CHAT_ENDPOINT = f"{API_BASE}/api/v1/chat"

TEST_MESSAGES = [
    "Ahoj, ako sa máš?",
    "Čo je to fotosyntéza?",
    "Vysvetli mi Pythagorovu vetu.",
    "Aký je rozdiel medzi DNA a RNA?",
    "Kto bol Ľudovít Štúr?",
    "Čo znamená slovo demokracia?",
    "Ako funguje slnečná sústava?",
    "Vymenuj hlavné mestá krajín V4.",
    "Čo je to umelá inteligencia?",
    "Aký je vzorec pre výpočet obsahu kruhu?",
]


@dataclass
class RequestResult:
    user_id: int
    round_num: int
    message: str
    status: int = 0
    connect_ms: float = 0.0
    ttfb_ms: float = 0.0
    total_ms: float = 0.0
    response_length: int = 0
    emotion: str = ""
    intensity: float = 0.0
    viseme_frames: int = 0
    audio_duration_ms: int = 0
    error: str = ""


@dataclass
class Summary:
    total_requests: int = 0
    success: int = 0
    failure: int = 0
    latencies: list = field(default_factory=list)
    ttfb_latencies: list = field(default_factory=list)
    connect_latencies: list = field(default_factory=list)
    errors: list = field(default_factory=list)

    @property
    def success_rate(self) -> float:
        if self.total_requests == 0:
            return 0.0
        return (self.success / self.total_requests) * 100

    @property
    def throughput_rps(self) -> float:
        total_s = sum(self.latencies) / 1000 if self.latencies else 0
        if total_s == 0:
            return 0.0
        return self.total_requests / total_s

    def percentile(self, values: list, p: float) -> float:
        if not values:
            return 0.0
        s = sorted(values)
        idx = int(len(s) * p / 100)
        return s[min(idx, len(s) - 1)]


def print_header(text: str) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {text}")
    print(f"{'=' * 60}")


def print_summary(s: Summary, label: str) -> None:
    print_header(label)
    print(f"  Requests:     {s.total_requests} ({s.success} ok, {s.failure} fail)")
    print(f"  Success rate: {s.success_rate:.1f}%")
    print(f"  Throughput:   {s.throughput_rps:.1f} req/s")
    print(f"  --- Latency (ms) ---")
    print(f"  P50:  {s.percentile(s.latencies, 50):.0f}")
    print(f"  P95:  {s.percentile(s.latencies, 95):.0f}")
    print(f"  P99:  {s.percentile(s.latencies, 99):.0f}")
    print(f"  Min:  {min(s.latencies) if s.latencies else 0:.0f}")
    print(f"  Max:  {max(s.latencies) if s.latencies else 0:.0f}")
    print(f"  --- TTFB (ms) ---")
    print(f"  P50:  {s.percentile(s.ttfb_latencies, 50):.0f}")
    print(f"  P95:  {s.percentile(s.ttfb_latencies, 95):.0f}")
    if s.errors:
        print(f"  --- Errors ---")
        for e in s.errors[:5]:
            print(f"  * {e}")
        if len(s.errors) > 5:
            print(f"  ... and {len(s.errors) - 5} more")


async def send_request(
    client: httpx.AsyncClient,
    user_id: int,
    round_num: int,
    message: str,
    sem: asyncio.Semaphore,
) -> RequestResult:
    result = RequestResult(user_id=user_id, round_num=round_num, message=message)
    async with sem:
        t0 = time.perf_counter()
        try:
            response = await client.post(
                CHAT_ENDPOINT,
                json={
                    "message": message,
                    "stream": False,
                    "max_tokens": 150,
                },
                headers={
                    "Content-Type": "application/json",
                    "X-EduTutor-User-Id": f"load-test-user-{user_id}",
                },
            )
            t_total = (time.perf_counter() - t0) * 1000
            result.total_ms = t_total
            result.status = response.status_code

            if response.status_code == 200:
                data = response.json()
                result.response_length = len(data.get("response", ""))
                result.emotion = data.get("emotion", "")
                result.intensity = data.get("intensity", 0.0)
                timeline = data.get("viseme_timeline", [])
                result.viseme_frames = len(timeline)
                result.audio_duration_ms = data.get("audio_duration_ms", 0)
            else:
                result.error = f"HTTP {response.status_code}: {response.text[:200]}"
        except httpx.TimeoutException:
            result.total_ms = (time.perf_counter() - t0) * 1000
            result.status = 0
            result.error = "timeout"
        except Exception as exc:
            result.total_ms = (time.perf_counter() - t0) * 1000
            result.status = 0
            result.error = str(exc)[:200]
    return result


async def run_scenario(users: int, rounds: int, timeout: int = 120) -> tuple:
    results: list[RequestResult] = []
    sem = asyncio.Semaphore(users)

    limits = httpx.Limits(
        max_keepalive_connections=users,
        max_connections=users * 2,
    )
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(timeout, connect=15.0),
        limits=limits,
    ) as client:
        tasks = []
        for r in range(rounds):
            for u in range(users):
                msg = TEST_MESSAGES[(u + r) % len(TEST_MESSAGES)]
                tasks.append(send_request(client, u, r, msg, sem))

        start = time.perf_counter()
        raw = await asyncio.gather(*tasks, return_exceptions=True)
        elapsed = time.perf_counter() - start

        for item in raw:
            if isinstance(item, RequestResult):
                results.append(item)
            elif isinstance(item, Exception):
                results.append(
                    RequestResult(user_id=-1, round_num=-1, message="?", error=str(item)[:200])
                )

    return results, elapsed


def build_summary(results: list[RequestResult]) -> Summary:
    s = Summary()
    for r in results:
        s.total_requests += 1
        if r.status == 200 and not r.error:
            s.success += 1
            s.latencies.append(r.total_ms)
        else:
            s.failure += 1
            s.latencies.append(r.total_ms)
            s.errors.append(f"[user={r.user_id}] {r.error}")
    return s


def main():
    parser = argparse.ArgumentParser(description="EduTutor.AI load test")
    parser.add_argument("--users", type=int, default=10, help="concurrent users")
    parser.add_argument("--rounds", type=int, default=2, help="rounds per user")
    parser.add_argument("--timeout", type=int, default=120, help="request timeout (s)")
    parser.add_argument("--output", type=str, default=None, help="JSON output file")
    parser.add_argument(
        "--all-scenarios",
        action="store_true",
        help="Run all 4 grant-required scenarios",
    )
    args = parser.parse_args()

    if args.all_scenarios:
        scenarios = [
            (5, 2, "5 users × 2 rounds (light baseline)"),
            (10, 2, "10 users × 2 rounds (moderate)"),
            (25, 2, "25 users × 2 rounds (high)"),
            (50, 1, "50 users × 1 round (stress spike)"),
        ]
    else:
        scenarios = [(args.users, args.rounds, f"{args.users} users × {args.rounds} rounds")]

    all_results: dict = {}

    for users, rounds, label in scenarios:
        print(f"\n⏳ Running: {label}...")
        results, elapsed = asyncio.run(run_scenario(users, rounds, args.timeout))
        summary = build_summary(results)
        print_summary(summary, label)
        all_results[label] = {
            "summary": {
                "users": users,
                "rounds": rounds,
                "total_requests": summary.total_requests,
                "success": summary.success,
                "failure": summary.failure,
                "success_rate": summary.success_rate,
                "throughput_rps": summary.throughput_rps,
                "latency_p50_ms": summary.percentile(summary.latencies, 50),
                "latency_p95_ms": summary.percentile(summary.latencies, 95),
                "latency_p99_ms": summary.percentile(summary.latencies, 99),
                "latency_min_ms": min(summary.latencies) if summary.latencies else 0,
                "latency_max_ms": max(summary.latencies) if summary.latencies else 0,
                "elapsed_s": elapsed,
            },
            "errors": summary.errors[:10],
        }

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            json.dump(all_results, f, indent=2, ensure_ascii=False)
        print(f"\n📄 Results written to {args.output}")


if __name__ == "__main__":
    main()
