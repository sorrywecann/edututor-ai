/*
 * S5 STT-HEAVY — EduTutor.AI bottleneck modulu STT (známy CPU limit)
 * ───────────────────────────────────────────────────────────────────────
 * Scenár:     10 VU konštantne, 10 minút
 * VU profil:  executor "constant-vus", vus: 10, duration: "10m"
 * Cieľ:       Identifikovať bottleneck STT modulu — CPU-bound transkripcia
 * Endpointy:  IBA POST /api/v1/stt (multipart upload test.wav)
 *             test.wav načítaný RAZ v setup() cez open(), reuse buffer
 * Kritéria:   p(95) stt < 6000 ms, errors < 5 %, exit code != 0 pri porušení
 */

import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

import { generateUserId, multipartHeaders } from '../lib/auth.js';
import { sttThresholds } from '../lib/thresholds.js';
import {
  getHealth,
  postSttTranscribe,
} from '../lib/endpoints.js';

// Custom metrics
const sttLatency = new Trend('stt_latency_ms', true);
const error5xx   = new Rate('error_rate_5xx');

export const options = {
  scenarios: {
    stt_heavy: {
      executor: 'constant-vus',
      vus: 10,
      duration: '10m',
    },
  },
  thresholds: {
    ...sttThresholds(6000, 0.05),
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

/*
 * Načítanie test.wav v INIT fáze (k6 v1.x požaduje open() iba v init scope,
 * NIE v setup() — viď https://grafana.com/docs/k6/latest/using-k6/test-lifecycle/).
 * open() vracia ArrayBuffer — zdieľané všetkými VU, reuse buffer každú iteráciu bez IO.
 */
const WAV_PATH = '../../../test-files/test.wav';
const WAV_BUFFER = open(WAV_PATH, 'b');

if (!WAV_BUFFER || WAV_BUFFER.byteLength === 0) {
  throw new Error(`Failed to read ${WAV_PATH} or file is empty`);
}

export function setup() {
  const r = getHealth(BASE_URL, {});
  if (r.status !== 200) {
    throw new Error(`Backend not reachable — health returned ${r.status}`);
  }
  return { baseUrl: BASE_URL };
}

export default function (data) {
  const userId  = generateUserId();
  const headers = multipartHeaders(userId);

  const t0 = Date.now();
  const r  = postSttTranscribe(data.baseUrl, WAV_BUFFER, headers);
  sttLatency.add(Date.now() - t0);

  check(r, {
    'stt status 200':         (x) => x.status === 200,
    'stt has text field':     (x) => { try { return JSON.parse(x.body).text !== undefined; } catch { return false; } },
  });
  error5xx.add(r.status >= 500);

  sleep(2);
}
