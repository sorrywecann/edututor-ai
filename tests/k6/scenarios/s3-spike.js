/*
 * S3 SPIKE — EduTutor.AI náhla špička záťaže (test odolnosti)
 * ──────────────────────────────────────────────────────────────────
 * Scenár:     stages [0→0 (10s), 0→200 (10s), 200→200 (1m), 200→0 (10s), 0→0 (2m recovery)]
 * VU profil:  executor "ramping-vus", skok z 0 na 200 VU za 10 sekúnd
 * Cieľ:       Otestovať recovery správanie po náhlom nápore — degradácia je OK
 * Endpointy:  IBA /api/v1/chat
 * Kritéria:   p(95) chat < 8000 ms, errors < 10 %, exit code != 0 pri porušení
 */

import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import { generateUserId, authHeaders } from '../lib/auth.js';
import { chatThresholds } from '../lib/thresholds.js';
import {
  getHealth,
  postChat,
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
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s',  target: 0 },
        { duration: '10s',  target: 200 },
        { duration: '1m',   target: 200 },
        { duration: '10s',  target: 0 },
        { duration: '2m',   target: 0 },
      ],
    },
  },
  thresholds: {
    ...chatThresholds(8000, 0.10),
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

  const t0 = Date.now();
  const r  = postChat(data.baseUrl, messages[idx], headers);
  chatLatency.add(Date.now() - t0);

  check(r, {
    'chat status ok': (x) => x.status === 200 || x.status === 202,
  });
  error5xx.add(r.status >= 500);

  sleep(1);
}
