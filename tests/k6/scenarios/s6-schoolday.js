/*
 * S6 SCHOOL-DAY — EduTutor.AI realistická simulácia školského dňa
 * ──────────────────────────────────────────────────────────────────────────
 * Scenár:     sinusoidálny tvar — peak 50 VU @ 15 min, 1 VU @ 0 a @ 30 min
 * VU profil:  executor "ramping-vus", 8 stage-ov aproximujúcich sínusoidu
 * Cieľ:       Simulovať reálnu triedu — nárast počas hodiny, útlm cez prestávku
 * Endpointy:  60 % chat, 20 % STT, 15 % KB search (POST /query), 5 % transformations
 * Kritéria:   p(95) chat < 4000 ms, errors < 3 %, exit code != 0 pri porušení
 */

import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

import { generateUserId, authHeaders } from '../lib/auth.js';
import { chatThresholds } from '../lib/thresholds.js';
import {
  getHealth,
  postChat,
  postSttTranscribe,
  postKbSearch,
  getTransformationTemplates,
} from '../lib/endpoints.js';

// Custom metrics
const chatLatency = new Trend('chat_latency_ms', true);
const sttLatency  = new Trend('stt_latency_ms', true);
const kbLatency   = new Trend('kb_latency_ms', true);
const error5xx    = new Rate('error_rate_5xx');

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

/*
 * Sínusoidná aproximácia 8 krokmi:
 * VU(t) ≈ 1 + 49 * sin(π * t / 30min)
 * t=0→1, t=1.5→10, t=4→25, t=9→45, t=15→50 (peak),
 * t=21→40, t=25→20, t=28→5, t=30→1
 */
export const options = {
  scenarios: {
    schoolday: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m',    target: 1 },
        { duration: '30s',   target: 10 },
        { duration: '2m30s', target: 25 },
        { duration: '5m',    target: 45 },
        { duration: '6m',    target: 50 },
        { duration: '6m',    target: 40 },
        { duration: '4m',    target: 20 },
        { duration: '3m',    target: 5 },
        { duration: '2m',    target: 1 },
      ],
    },
  },
  thresholds: {
    ...chatThresholds(4000, 0.03),
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// WAV buffer — načítaný v setup() pre STT volania
let wavBuffer = null;

export function setup() {
  const r = getHealth(BASE_URL, {});
  if (r.status !== 200) {
    throw new Error(`Backend not reachable — health returned ${r.status}`);
  }

  try {
    wavBuffer = open('../../test-files/test.wav', 'b');
  } catch (e) {
    console.warn('test.wav not found, STT calls will be skipped');
  }

  return { baseUrl: BASE_URL, wav: wavBuffer };
}

export default function (data) {
  const userId  = generateUserId();
  const headers = authHeaders(userId);
  const mpHeaders = { 'X-EduTutor-User-Id': userId };
  const idx     = __ITER % messages.length;

  // Weighted endpoint selection: 60 % chat, 20 % STT, 15 % KB search, 5 % transformations
  const roll = Math.random();

  if (roll < 0.60) {
    const t0 = Date.now();
    const r  = postChat(data.baseUrl, messages[idx], headers);
    chatLatency.add(Date.now() - t0);
    check(r, {
      'chat 200': (x) => x.status === 200,
      'chat has response': (x) => { try { return JSON.parse(x.body).response !== undefined; } catch { return false; } },
    });
    error5xx.add(r.status >= 500);
    sleep(1);
  } else if (roll < 0.80) {
    if (data.wav && data.wav.byteLength > 0) {
      const t0 = Date.now();
      const r  = postSttTranscribe(data.baseUrl, data.wav, mpHeaders);
      sttLatency.add(Date.now() - t0);
      check(r, {
        'stt 200': (x) => x.status === 200,
        'stt has text': (x) => { try { return JSON.parse(x.body).text !== undefined; } catch { return false; } },
      });
      error5xx.add(r.status >= 500);
    }
    sleep(1.5);
  } else if (roll < 0.95) {
    const t0 = Date.now();
    const r  = postKbSearch(data.baseUrl, 'default', 'Python OOP', 5, headers);
    if (r.status === 200) {
      kbLatency.add(Date.now() - t0);
    }
    check(r, { 'kb search 200 or 404': (x) => x.status === 200 || x.status === 404 });
    error5xx.add(r.status >= 500);
    sleep(1);
  } else {
    const r = getTransformationTemplates(data.baseUrl, headers);
    check(r, { 'templates 200': (x) => x.status === 200 });
    error5xx.add(r.status >= 500);
    sleep(0.3);
  }
}
