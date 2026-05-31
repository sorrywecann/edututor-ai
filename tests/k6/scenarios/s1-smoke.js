/*
 * S1 SMOKE — EduTutor.AI základný sanity test (slovenčina)
 * ──────────────────────────────────────────────────────────
 * Scenár:     1 VU, 5 minút, konštantná záťaž
 * VU profil:  executor "constant-vus", vus: 1, duration: "5m"
 * Cieľ:       Overiť, že všetky endpointy odpovedajú a latencie sú v norme
 * Endpointy:  /health, /chat, /stt/models, /ask (default KB), /knowledge-bases
 * Kritéria:   p(95) chat < 3000 ms, errors < 1 %, exit code != 0 pri porušení
 */

import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import { generateUserId, authHeaders } from '../lib/auth.js';
import { chatThresholds } from '../lib/thresholds.js';
import {
  getHealth,
  postChat,
  getSttModels,
  postKbAsk,
  getKbList,
} from '../lib/endpoints.js';

// ── Custom metrics ──────────────────────────────────────────────────────────
const chatLatency = new Trend('chat_latency_ms', true);
const kbLatency   = new Trend('kb_latency_ms', true);
const error5xx   = new Rate('error_rate_5xx');

// ── Shared test data (memory-efficient across VUs) ──────────────────────────
const messages = new SharedArray('chat_messages', function () {
  return [
    'Čo je konštruktor v Pythone?',
    'Vysvetli OOP dedičnosť.',
    'Čo znamená polymorfizmus?',
    'Aký je rozdiel medzi class a instance?',
    'Ako funguje garbage collector?',
  ];
});

// ── Options ─────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 1,
      duration: '5m',
    },
  },
  thresholds: {
    ...chatThresholds(3000, 0.01),
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// ── VU lifecycle ────────────────────────────────────────────────────────────
export function setup() {
  const res = getHealth(BASE_URL, {});
  if (res.status !== 200) {
    throw new Error(`Backend not reachable — health returned ${res.status}`);
  }
  return { baseUrl: BASE_URL };
}

export default function (data) {
  const userId  = generateUserId();
  const headers = authHeaders(userId);
  let idx       = (__ITER % messages.length);

  // 1. Health check
  let r = getHealth(data.baseUrl, headers);
  check(r, { 'health status 200': (x) => x.status === 200 });
  error5xx.add(r.status >= 500);
  sleep(0.5);

  // 2. Chat
  let t0 = Date.now();
  r = postChat(data.baseUrl, messages[idx], headers);
  chatLatency.add(Date.now() - t0);
  check(r, {
    'chat status 200':          (x) => x.status === 200,
    'chat has response field':  (x) => { try { return JSON.parse(x.body).response !== undefined; } catch { return false; } },
  });
  error5xx.add(r.status >= 500);
  idx = (idx + 1) % messages.length;
  sleep(1);

  // 3. STT models list
  r = getSttModels(data.baseUrl, headers);
  check(r, { 'stt models 200': (x) => x.status === 200 });
  error5xx.add(r.status >= 500);
  sleep(0.5);

  // 4. Knowledge base ask (simuluje /api/v1/ask)
  t0 = Date.now();
  r = postKbAsk(data.baseUrl, 'default', messages[idx], headers);
  if (r.status === 200) {
    kbLatency.add(Date.now() - t0);
  }
  // 404 akceptujeme — KB "default" nemusí existovať
  check(r, { 'ask status 200 or 404': (x) => x.status === 200 || x.status === 404 });
  error5xx.add(r.status >= 500);
  idx = (idx + 1) % messages.length;
  sleep(1);

  // 5. List knowledge bases
  r = getKbList(data.baseUrl, headers);
  check(r, { 'kb list 200': (x) => x.status === 200 });
  error5xx.add(r.status >= 500);
  sleep(1);
}
