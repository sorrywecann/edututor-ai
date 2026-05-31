/*
 * thresholds.js — zdieľané latency/metrika threshold objekty pre všetky k6 scenáre.
 * Každý scenár importuje relevantný threshold set a mergne do svojich options.thresholds.
 */

/**
 * Základné thresholdy — aplikovateľné na všetky scenáre.
 * http_req_duration: globálna HTTP latency
 * http_req_failed:  pomer neúspešných requestov
 */
export const BASE = {
  http_req_duration: ['p(99)<15000'],       // 99th percentile pod 15s — safety net
  http_req_failed:  ['rate<0.15'],          // max 15 % chýb globálne
};

/**
 * Chat endpoint thresholdy — používané v S1, S2, S4, S6.
 * @param {number} p95ms — p(95) latency limit v ms
 * @param {number} errorRate — max error rate (0.0-1.0)
 */
export function chatThresholds(p95ms, errorRate) {
  return {
    chat_latency_ms: [`p(95)<${p95ms}`],
    error_rate_5xx:  [`rate<${errorRate}`],
  };
}

/**
 * STT endpoint thresholdy — používané v S5.
 * @param {number} p95ms — p(95) latency limit v ms
 * @param {number} errorRate — max error rate (0.0-1.0)
 */
export function sttThresholds(p95ms, errorRate) {
  return {
    stt_latency_ms: [`p(95)<${p95ms}`],
    error_rate_5xx: [`rate<${errorRate}`],
  };
}

/**
 * KB endpoint thresholdy — používané v S1, S2, S4, S6.
 * @param {number} p95ms — p(95) latency limit v ms
 */
export function kbThresholds(p95ms) {
  return {
    kb_latency_ms: [`p(95)<${p95ms}`],
  };
}
