import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const chatLatency = new Trend('chat_latency_ms', true);

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '3m',  target: 50 },
    { duration: '1m',  target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000'],
    errors: ['rate<0.05'],
    chat_latency_ms: ['p(50)<2000'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

export function setup() {
  const res = http.get(`${BASE_URL}/health`);
  if (res.status !== 200) {
    throw new Error(`Backend not reachable: ${res.status}`);
  }
  return { baseUrl: BASE_URL };
}

export default function (data) {
  const healthRes = http.get(`${data.baseUrl}/health`);
  check(healthRes, {
    'health status 200': r => r.status === 200,
    'health body has status': r => {
      try { return JSON.parse(r.body).status !== undefined; }
      catch { return false; }
    },
  });
  errorRate.add(healthRes.status !== 200);

  sleep(0.5);

  const chatPayload = JSON.stringify({
    message: 'Čo je to konštruktor v Pythone?',
    language: 'sk',
  });

  const chatStart = Date.now();
  const chatRes = http.post(
    `${data.baseUrl}/api/v1/chat`,
    chatPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );
  chatLatency.add(Date.now() - chatStart);

  check(chatRes, {
    'chat status 200': r => r.status === 200,
    'chat has response field': r => {
      try { return JSON.parse(r.body).response !== undefined; }
      catch { return false; }
    },
  });
  errorRate.add(chatRes.status !== 200);

  sleep(1);

  const sttRes = http.get(`${data.baseUrl}/api/v1/stt/models`);
  check(sttRes, { 'stt models 200': r => r.status === 200 });

  sleep(1);
}
