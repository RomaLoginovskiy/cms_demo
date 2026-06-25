export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

export async function probeFrontend(baseUrl: string): Promise<boolean> {
  const url = normalizeBaseUrl(baseUrl);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(5000)
    });
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

export async function waitForFrontend(
  baseUrl: string,
  maxWaitMs = 120_000,
  intervalMs = 2000
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  const url = normalizeBaseUrl(baseUrl);

  while (Date.now() < deadline) {
    if (await probeFrontend(url)) return true;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}
