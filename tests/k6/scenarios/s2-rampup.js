/*
 * S2 RAMPUP — EduTutor.AI graduálna záťaž, nájdenie bodu zlomu
 * ────────────────────────────────────────────────────────────────────
 * Scenár:     stages [0→10 (30s), 10→50 (5m), 50→100 (10m), 100→100 (3m), 100→0 (2m)]
 * VU profil:  executor "ramping-vus", 5 stage-ov, ~20 minút celkovo
 * Cieľ:       Nájsť breaking point — sledovať latencie a error rate ako rastú VU
 * Endpointy:  70 % chat, 20 % STT models, 10 % KB list
 * Kritéria:   p(95) chat < 5000 ms, errors < 5 %, exit code != 0 pri porušení
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
  getKbList,
} from '../lib/endpoints.js';

// Custom metrics
const chatLatency = new Trend('chat_latency_ms', true);
const error5xx   = new Rate('error_rate_5xx');

// Shared messages (Slovak payload texts)
const messages = new SharedArray('chat_messages', function () {
  return [
    'Čo je konštruktor v Pythone?',
    'Vysvetli OOP dedičnosť.',
    'Čo znamená polymorfizmus?',
    'Aký je rozdiel medzi class a instance?',
    'Ako funguje garbage collector?',
  ];
});

export const options = {
  scenarios: {
    rampup: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s',  target: 10 },
        { duration: '5m',   target: 50 },
        { duration: '10m',  target: 100 },
        { duration: '3m',   target: 100 },
        { duration: '2m',   target: 0 },
      ],
    },
  },
  thresholds: {
    ...chatThresholds(5000, 0.05),
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export function setup() {
  const r = getHealth(BASE_URL, {});
  if (r.status !== 200) {
    throw new Error(`Backend not reachable — health returned ${r.status}`);
  }
  return { baseUrl: BASE_URL };
}

export default function (data) {
  const userId  = generateUserId();
  const headers = authHeaders(userId);
  const idx     = __ITER % messages.length;

  // Weighted random endpoint selection: 70 % chat, 20 % stt, 10 % kb-list
  const roll = Math.random();

  if (roll < 0.70) {
    const t0 = Date.now();
    const r  = postChat(data.baseUrl, messages[idx], headers);
    chatLatency.add(Date.now() - t0);
    check(r, {
      'chat 200': (x) => x.status === 200,
      'chat has response': (x) => { try { return JSON.parse(x.body).response !== undefined; } catch { return false; } },
    });
    error5xx.add(r.status >= 500);
    sleep(1);
  } else if (roll < 0.90) {
    const r = getSttModels(data.baseUrl, headers);
    check(r, { 'stt models 200': (x) => x.status === 200 });
    error5xx.add(r.status >= 500);
    sleep(0.5);
  } else {
    const r = getKbList(data.baseUrl, headers);
    check(r, { 'kb list 200': (x) => x.status === 200 });
    error5xx.add(r.status >= 500);
    sleep(0.5);
  }
}
