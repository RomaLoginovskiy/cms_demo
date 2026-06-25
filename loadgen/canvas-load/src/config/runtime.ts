export function isInKubernetes(): boolean {
  return Boolean(process.env.KUBERNETES_SERVICE_HOST);
}

export function isInClusterFlag(): boolean {
  return isInKubernetes() || process.env.CANVAS_LOAD_IN_CLUSTER === 'true';
}
