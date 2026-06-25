import { LoadConfig } from '../config/types';

export interface BrowserFingerprint {
  demoGeo: string;
  demoBrowserFamily: string;
  userAgent: string;
  geolocation: { latitude: number; longitude: number };
  locale: string;
  timezoneId: string;
  viewport: { width: number; height: number };
}

export interface BrowserFingerprintOverrides {
  demoGeo?: string;
  demoBrowserFamily?: string;
}

export interface ResolveBrowserFingerprintInput {
  seed: number;
  userIndex: number;
  rng: () => number;
  overrides?: BrowserFingerprintOverrides;
  fallbackViewport?: { width: number; height: number };
}

export const GEO_LABELS = ['eu-west', 'us-east', 'ap-south'] as const;
export const BROWSER_FAMILIES = ['chrome', 'firefox', 'safari'] as const;

const GEO_COORDINATES: Record<string, { latitude: number; longitude: number }> = {
  'eu-west': { latitude: 53.35, longitude: -6.26 },
  'us-east': { latitude: 40.71, longitude: -74.01 },
  'ap-south': { latitude: 19.08, longitude: 72.88 }
};

const USER_AGENTS: Record<string, string> = {
  chrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  firefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  safari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
};

const VIEWPORT_POOL: Array<{ width: number; height: number }> = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
  { width: 414, height: 896 }
];

const LOCALE_POOL = ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP', 'es-ES'] as const;

const TIMEZONE_POOL = [
  'America/New_York',
  'Europe/Dublin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/Los_Angeles'
] as const;

function pickDeterministic<T>(pool: readonly T[], seed: number, userIndex: number, rng: () => number): T {
  const base = (seed * 31 + userIndex) % pool.length;
  const jitter = Math.floor(rng() * pool.length) % pool.length;
  return pool[(base + jitter) % pool.length]!;
}

export function geoLabelToCoordinates(
  demoGeo: string
): { latitude: number; longitude: number } | undefined {
  return GEO_COORDINATES[demoGeo];
}

export function browserFamilyToUserAgent(demoBrowserFamily: string): string | undefined {
  return USER_AGENTS[demoBrowserFamily];
}

export function resolveBrowserFingerprint(input: ResolveBrowserFingerprintInput): BrowserFingerprint {
  const { seed, userIndex, rng, overrides, fallbackViewport } = input;

  const demoGeo =
    overrides?.demoGeo ??
    pickDeterministic(GEO_LABELS, seed, userIndex, rng);
  const demoBrowserFamily =
    overrides?.demoBrowserFamily ??
    pickDeterministic(BROWSER_FAMILIES, seed + 7, userIndex + 3, rng);

  const geolocation = GEO_COORDINATES[demoGeo]!;
  const userAgent = USER_AGENTS[demoBrowserFamily]!;
  const locale = pickDeterministic(LOCALE_POOL, seed + 11, userIndex + 5, rng);
  const timezoneId = pickDeterministic(TIMEZONE_POOL, seed + 13, userIndex + 7, rng);
  const viewport =
    pickDeterministic(VIEWPORT_POOL, seed + 17, userIndex + 11, rng) ??
    fallbackViewport ??
    { width: 1280, height: 720 };

  return {
    demoGeo,
    demoBrowserFamily,
    userAgent,
    geolocation,
    locale,
    timezoneId,
    viewport
  };
}

export function resolveBrowserFingerprintForUser(
  config: LoadConfig,
  userIndex: number,
  rng: () => number
): BrowserFingerprint | null {
  if (config.browser.fingerprint?.enabled === false) {
    return null;
  }

  return resolveBrowserFingerprint({
    seed: config.run.seed,
    userIndex,
    rng,
    fallbackViewport: {
      width: config.browser.viewport_width,
      height: config.browser.viewport_height
    }
  });
}

export function fingerprintToContextOptions(
  fingerprint: BrowserFingerprint
): {
  viewport: { width: number; height: number };
  userAgent: string;
  locale: string;
  timezoneId: string;
  geolocation: { latitude: number; longitude: number };
  permissions: ['geolocation'];
  extraHTTPHeaders: { 'Accept-Language': string };
} {
  return {
    viewport: fingerprint.viewport,
    userAgent: fingerprint.userAgent,
    locale: fingerprint.locale,
    timezoneId: fingerprint.timezoneId,
    geolocation: fingerprint.geolocation,
    permissions: ['geolocation'],
    extraHTTPHeaders: { 'Accept-Language': fingerprint.locale }
  };
}
