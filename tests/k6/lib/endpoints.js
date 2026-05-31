/*
 * endpoints.js — HTTP request factory functions pre všetky EduTutor.AI endpointy.
 * Každá funkcia vracia k6 http.Response. Timing sa meria volajúcim kódom
 * cez Trend.add() pre custom metriky.
 */

import http from 'k6/http';

/**
 * GET /api/v1/health
 */
export function getHealth(baseUrl, headers) {
  return http.get(`${baseUrl}/api/v1/health`, { headers });
}

/**
 * POST /api/v1/chat
 * @param {string} baseUrl
 * @param {string} message — slovenský text
 * @param {object} headers — musí obsahovať Content-Type a X-EduTutor-User-Id
 */
export function postChat(baseUrl, message, headers) {
  const payload = JSON.stringify({
    message: message,
    language: 'sk',
  });
  return http.post(`${baseUrl}/api/v1/chat`, payload, { headers });
}

/**
 * GET /api/v1/stt/models
 */
export function getSttModels(baseUrl, headers) {
  return http.get(`${baseUrl}/api/v1/stt/models`, { headers });
}

/**
 * POST /api/v1/stt — multipart file upload
 * @param {string} baseUrl
 * @param {ArrayBuffer|string} wavBuffer — raw WAV data
 * @param {object} headers — bez Content-Type (k6 nastaví boundary)
 */
export function postSttTranscribe(baseUrl, wavBuffer, headers) {
  const data = {
    audio: http.file(wavBuffer, 'test.wav', 'audio/wav'),
    language: 'sk',
  };
  return http.post(`${baseUrl}/api/v1/stt`, data, { headers });
}

/**
 * GET /api/v1/knowledge-bases
 */
export function getKbList(baseUrl, headers) {
  return http.get(`${baseUrl}/api/v1/knowledge-bases`, { headers });
}

/**
 * POST /api/v1/knowledge-bases/{name}/query
 * @param {string} name — knowledge base name, default "default"
 * @param {string} query — search query text
 * @param {number} topK — počet výsledkov
 */
export function postKbSearch(baseUrl, name, query, topK, headers) {
  const payload = JSON.stringify({
    query: query,
    top_k: topK,
  });
  return http.post(`${baseUrl}/api/v1/knowledge-bases/${encodeURIComponent(name)}/query`, payload, { headers });
}

/**
 * POST /api/v1/knowledge-bases/{name}/ask
 * @param {string} name — knowledge base name
 * @param {string} question — otázka
 */
export function postKbAsk(baseUrl, name, question, headers) {
  const payload = JSON.stringify({
    question: question,
  });
  return http.post(`${baseUrl}/api/v1/knowledge-bases/${encodeURIComponent(name)}/ask`, payload, { headers });
}

/**
 * GET /api/v1/transformations/templates
 */
export function getTransformationTemplates(baseUrl, headers) {
  return http.get(`${baseUrl}/api/v1/transformations/templates`, { headers });
}
