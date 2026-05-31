/**
 * Single source of truth for runtime config — replaces 16+ duplicated
 * `const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'`
 * declarations scattered across the codebase.
 *
 * If you need a new config value, add it here. Do not re-create per-file
 * constants pointing at process.env — that pattern caused real bugs (e.g.
 * one file used `localhost:8000` while another used the env var, so a
 * single backend URL change required hunting through every component).
 */

const PROD_FALLBACK = 'http://localhost:8000';

export const API_BASE: string =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) || PROD_FALLBACK;

export const WS_BASE: string = API_BASE.replace(/^http/, 'ws');

export const APP_NAME = 'EduTutor.AI';
