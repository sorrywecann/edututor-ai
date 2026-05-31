/*
 * auth.js — anonymous identity helper pre EduTutor.AI k6 scenáre.
 * Generuje unikátne X-EduTutor-User-Id hlavičky pre každý VU.
 * Používa crypto.randomUUID() (k6 built-in, dostupné od k6 v0.50+).
 */

/**
 * Vygeneruje unikátne user ID pre aktuálny VU.
 * Používa globálne crypto.randomUUID() (k6 v1.7.1+ — webcrypto je graduovaný).
 */
export function generateUserId() {
  return crypto.randomUUID();
}

/**
 * Vráti headers object s X-EduTutor-User-Id.
 *
 * @param {string} userId — UUID z generateUserId()
 * @returns {object} headers s Content-Type a User-Id
 */
export function authHeaders(userId) {
  return {
    'Content-Type': 'application/json',
    'X-EduTutor-User-Id': userId,
  };
}

/**
 * Vráti headers pre multipart uploady (STT).
 *
 * @param {string} userId — UUID z generateUserId()
 * @returns {object} headers bez Content-Type (k6 nastaví multipart boundary automaticky)
 */
export function multipartHeaders(userId) {
  return {
    'X-EduTutor-User-Id': userId,
  };
}
