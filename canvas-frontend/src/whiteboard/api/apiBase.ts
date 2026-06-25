/** API origin for fetch/SignalR — same-origin in K8s/nginx; localhost:8080 for local webpack. */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.REACT_APP_API_URL;
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:8080';
}

export function getHubUrl(): string {
  const fromEnv = process.env.REACT_APP_HUB_URL;
  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }
  return `${getApiBaseUrl()}/hubs/board`;
}
