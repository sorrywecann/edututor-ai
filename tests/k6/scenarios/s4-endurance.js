/*
 * S4 ENDURANCE — EduTutor.AI dlhodobá záťaž, detekcia memory leakov
 * ────────────────────────────────────────────────────────────────────────
 * Scenár:     30 VU konštantne, 60 minút (3600s)
 * VU profil:  executor "constant-vus", vus: 30, duration: "60m"
 * Cieľ:       Odhaliť memory leaky, RSS/heap trend, degradáciu v čase
 * Endpointy:  50 % chat, 20 % STT models, 15 % KB list, 15 % health
 * Kritéria:   p(95) chat < 3500 ms, errors < 2 %, exit code != 0 pri porušení
 * Poznámka:   TODO: parse `/api/v1/system/metrics` pre RSS/heap trend
 *             (endpoint zatiaľ neimplementovaný — sledovať externým monitoringom)
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

// Shared messages
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
    endurance: {
      executor: 'constant-vus',
      vus: 30,
      duration: '60m',
    },
  },
  thresholds: {
    ...chatThresholds(3500, 0.02),
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

  // Weighted endpoint selection: 50 % chat, 20 % stt, 15 % kb-list, 15 % health
  const roll = Math.random();

  if (roll < 0.50) {
    const t0 = Date.now();
    const r  = postChat(data.baseUrl, messages[idx], headers);
    chatLatency.add(Date.now() - t0);
    check(r, {
      'chat 200': (x) => x.status === 200,
      'chat has response': (x) => { try { return JSON.parse(x.body).response !== undefined; } catch { return false; } },
    });
    error5xx.add(r.status >= 500);
    sleep(1.5);
  } else if (roll < 0.70) {
    const r = getSttModels(data.baseUrl, headers);
    check(r, { 'stt models 200': (x) => x.status === 200 });
    error5xx.add(r.status >= 500);
    sleep(0.5);
  } else if (roll < 0.85) {
    const r = getKbList(data.baseUrl, headers);
    check(r, { 'kb list 200': (x) => x.status === 200 });
    error5xx.add(r.status >= 500);
    sleep(0.5);
  } else {
    const r = getHealth(data.baseUrl, headers);
    check(r, { 'health 200': (x) => x.status === 200 });
    error5xx.add(r.status >= 500);
    sleep(0.3);
  }
}
