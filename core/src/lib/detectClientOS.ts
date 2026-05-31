/**
 * Detect the user's actual operating system from the browser.
 *
 * The backend runs in a Docker container (always Linux), so its
 * `platform.system()` cannot tell whether the user is on macOS,
 * Windows, or Linux. The onboarding profile recommender (STT, install
 * commands, brew vs apt vs Windows installer) depends on knowing the
 * *user's* OS — so we detect it client-side and pass it as a hint to
 * the `/system/hardware` endpoint.
 *
 * Prefers `navigator.userAgentData` (Client Hints, Chromium-only) and
 * falls back to UA-string parsing everywhere else (Safari, Firefox).
 */

export type ClientPlatform = 'macos' | 'windows' | 'linux' | 'unknown';

export interface ClientOSHint {
  platform: ClientPlatform;
  isAppleSilicon: boolean;
}

interface UserAgentData {
  platform?: string;
  architecture?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{
    platform?: string;
    architecture?: string;
  }>;
}

export function detectClientOS(): ClientOSHint {
  if (typeof navigator === 'undefined') {
    return { platform: 'unknown', isAppleSilicon: false };
  }

  const uaData = (navigator as Navigator & { userAgentData?: UserAgentData })
    .userAgentData;
  if (uaData?.platform) {
    return resolvePlatform(uaData.platform, uaData.architecture, navigator.userAgent);
  }

  return resolvePlatform(undefined, undefined, navigator.userAgent);
}

function resolvePlatform(
  platformHint: string | undefined,
  architectureHint: string | undefined,
  userAgent: string,
): ClientOSHint {
  const ua = userAgent.toLowerCase();
  const arch = (architectureHint || '').toLowerCase();
  const hint = (platformHint || '').toLowerCase();

  let platform: ClientPlatform = 'unknown';
  if (hint) {
    if (hint.includes('mac')) platform = 'macos';
    else if (hint.includes('win')) platform = 'windows';
    else if (hint.includes('linux') || hint.includes('android')) platform = 'linux';
  }

  if (platform === 'unknown') {
    if (ua.includes('mac os') || ua.includes('macintosh')) platform = 'macos';
    else if (ua.includes('windows')) platform = 'windows';
    else if (ua.includes('linux') || ua.includes('x11')) platform = 'linux';
  }

  // Apple Silicon heuristic (no reliable browser API as of 2026):
  //   1. userAgentData.architecture === 'arm' (most reliable, Chromium only)
  //   2. UA explicitly mentions ARM (rare on Safari)
  //   3. macOS without "Intel" token — Apple stopped shipping Intel Macs in
  //      2023, so the absence of "Intel" in a Mac UA is a reasonable proxy.
  let isAppleSilicon = false;
  if (platform === 'macos') {
    if (arch === 'arm' || arch.includes('aarch')) {
      isAppleSilicon = true;
    } else if (ua.includes('arm') || !ua.includes('intel')) {
      isAppleSilicon = true;
    }
  }

  return { platform, isAppleSilicon };
}

export function clientOSToQueryString(hint: ClientOSHint): string {
  if (hint.platform === 'unknown') return '';
  const params = new URLSearchParams({
    client_os: hint.platform,
    client_apple_silicon: hint.isAppleSilicon ? '1' : '0',
  });
  return `?${params.toString()}`;
}
