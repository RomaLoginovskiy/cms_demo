# ADR-018: Edge Routing on EKS with Gateway API (Envoy Gateway)

**Status**: Proposed  
**Date**: 2026-10-30  
**Parent**: [ADR-017](ADR-017-aws-eks-gitops-platform.md)

## Context

Today all browser traffic enters through one `networking.k8s.io/v1` Ingress (`k8s/ingress.yaml`, `ingressClassName: nginx`) that fans out by path:

| Path prefix | Backend | Notes |
|---|---|---|
| `/api/boards`, `/hubs` | `canvas-backend:8080` | `/hubs` is SignalR (WebSocket upgrade, long-lived) |
| `/api/media`, `/api` | `cms-backend:8080` | multipart uploads, 10 MiB body limit |
| `/v1/traces` | `otel-agent:4318` | browser RUM OTLP/JSON (ADR-013) |
| `/cms` | `cms-frontend:80` | CMS SPA |
| `/` | `canvas-frontend:80` | whiteboard SPA |
| `/loadgen` (optional) | `canvas-load:8090` | admin UI, private ranges only |

It relies on ingress-nginx annotations: `proxy-body-size: 10m`, `proxy-read/send-timeout: 3600`, and `whitelist-source-range` (RFC 1918 + loopback only).

Two facts force a change:

1. **ingress-nginx is retired.** SIG Network ended maintenance in March 2026 and archived the repository (2026-03-24). No further security fixes ship, and several HIGH CVEs were disclosed in early 2026. A new production platform must not adopt it.
2. **Two very different runtimes must serve the same routes.** AWS EKS (real VPC, real load balancers) and the floci-emulated EKS (single k3s node in Docker, started with `--disable=traefik`, ServiceLB enabled, no real ELB data plane for pod targets). The routing rules are the part most likely to drift if each environment uses a different controller.

## Evaluation Criteria

- **Parity**: the routing rules exercised locally on floci are the rules that run on EKS.
- **Supportability**: actively maintained, standard API, no retired components.
- **Protocol fit**: WebSocket upgrade for SignalR, 1 h idle streams, multipart uploads (the API caps files at 5 MB), source-IP allowlisting.
- **Operability**: number of moving parts the team owns; TLS certificate lifecycle.
- **Cost**: monthly load balancer and compute cost for a demo-scale environment.

### Options scorecard (1 = worst, 5 = best)

| Characteristic | A: ingress-nginx (status quo) | B: ALB via AWS LBC (Gateway API) + different controller locally | C: Envoy Gateway everywhere, NLB in front on AWS |
|---|---|---|---|
| Parity | 4 | 2 | 5 |
| Supportability | 1 | 5 | 4 |
| Protocol fit | 4 | 4 | 5 |
| Operability | 3 | 4 | 3 |
| Cost | 4 | 4 | 4 |
| **Total** | **16** | **19** | **21** |

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| **A: Keep ingress-nginx** | Zero manifest change | Retired, unpatched; disqualifying for a new deployment |
| **B: AWS LBC GatewayClass (`gateway.k8s.aws/alb`) on EKS, Envoy Gateway or Traefik on floci** | AWS-managed L7, WAF attachable, LBC Gateway API GA since v3.0.0 | Floci cannot emulate an ALB with pod IP targets, so local uses another implementation; timeouts, body limits and allowlists live in implementation-specific CRDs (`LoadBalancerConfiguration`/`TargetGroupConfiguration` vs Envoy policies) that differ per environment |
| **C: Envoy Gateway as the only Gateway API implementation; on AWS its Service is fronted by an NLB provisioned by AWS LBC** | Same `GatewayClass`, `Gateway`, `HTTPRoute` and policy CRDs in every environment; WebSocket and long timeouts are first-class; standard Gateway API v1 | Team runs Envoy proxies (2 replicas); no AWS WAF on NLB (needs CloudFront or a later ALB if WAF becomes a requirement) |

## Decision

**Adopt Option C.**

- **Implementation**: Envoy Gateway (v1.9.x at time of writing) installed by Argo CD in all clusters. Gateway API CRDs come from Envoy Gateway's `gateway-crds-helm` chart with the standard channel set explicitly (one pinned version across environments); the main chart skips CRDs. Standard, not experimental: since Gateway API v1.5 it includes every kind used here, and k3s 1.37 pre-installs the same v1.6.1 standard CRDs with a ValidatingAdmissionPolicy that rejects experimental CRDs over them.
- **Ownership**: the `Gateway`, `GatewayClass`, `EnvoyProxy` and Gateway-level policies live in `deploy/platform/envoy-gateway` (Argo CD project `platform`). Each `HTTPRoute` lives with its backend: `deploy/apps/cms-demo/base/routes` and, for `/v1/traces`, `deploy/platform/coralogix-otel`.
- **Routing contract** (environment-agnostic):
  - One `Gateway` named `cms-edge` in namespace `edge`, `gatewayClassName: envoy`. Listener `websecure` accepts routes only from namespaces labelled `edge.cms-demo/routes: "true"` (`allowedRoutes.namespaces.from: Selector`; the platform `namespaces` application labels `cms-demo` and `observability`); listener `web` accepts only the redirect route from its own namespace (`from: Same`).
  - One `HTTPRoute` per owning service, in the backend's namespace (no `ReferenceGrant` needed), reproducing the table above except `/loadgen`. Gateway API longest-prefix precedence matches the current Ingress ordering (`/api/boards` and `/api/media` before `/api`, `/cms` before `/`).
  - `/hubs`: route-level request timeout disabled (`timeouts.request: 0s`) plus an Envoy Gateway `BackendTrafficPolicy` idle timeout of 3600 s.
  - Upload size: the API already rejects files over 5 MB (`MediaController.cs:88-92`). An optional `BackendTrafficPolicy.requestBuffer` limit applies to the upload route only, never to `/hubs` (request buffering is incompatible with WebSocket).
  - Client IP: `ClientTrafficPolicy.proxyProtocol` on AWS (NLB sends proxy protocol v2), remote address locally.
  - `/loadgen` is **not routed**. Its admin UI calls absolute `/api/control/*` paths (they would collide with the `/api` route), and its API is unauthenticated and can point headless browsers at arbitrary URLs (server-side request forgery from inside the VPC). Access is `kubectl port-forward` only.
- **Proxy placement**: the Envoy Gateway **controller** runs with deploy mode `GatewayNamespace` (`config.envoyGateway.provider.kubernetes.deploy.type` in its Helm values), so proxy pods and their Service live in `edge`; `EnvoyProxy.spec.provider.kubernetes.envoyService.name: cms-edge` gives the Service a stable name (`cms-edge.edge.svc.cluster.local`).
- **AWS exposure**: the AWS `EnvoyProxy` sets `envoyService.loadBalancerClass: service.k8s.aws/nlb` at creation (otherwise AWS LBC's Service mutating webhook sets the immutable class itself and Envoy Gateway can no longer reconcile the Service — envoyproxy/gateway#1793), `loadBalancerSourceRanges` from the `public_ingress_cidrs` cluster annotation (Terraform: the Q4 allowlist plus the NAT gateway EIPs, so in-VPC synthetic traffic can hairpin), and annotations `aws-load-balancer-scheme: internet-facing`, `aws-load-balancer-nlb-target-type: ip`, `aws-load-balancer-ssl-cert: <ACM ARN>`, `aws-load-balancer-ssl-ports: "443"`, `aws-load-balancer-proxy-protocol: "*"`. NLB 443 (TLS) and 80 map to Gateway listeners `websecure` (443) and `web` (80), both `protocol: HTTP`. App routes attach only to `websecure` (`parentRefs[].sectionName`); `web` only carries a `RequestRedirect` to `https`. external-dns (mandatory on AWS, source `gateway-httproute`) publishes the route hostname as an alias to the NLB.
- **Local exposure**: no `loadBalancerClass`, so k3s ServiceLB serves the same `LoadBalancer` Service on the k3s container. An `edge` socat container on the compose network publishes `localhost:8080` to the `websecure` listener (port 443, plain HTTP locally, because TLS is only ever terminated by the NLB). Local routes carry no hostnames. Fallback: `kubectl port-forward`.
- **Migration aid**: `ingress2gateway` (1.0, March 2026) is used once to draft the HTTPRoutes from `k8s/ingress.yaml`; output is reviewed by hand.

## Implications

- **Positive**: Routes are tested locally exactly as deployed; the retired controller disappears; the RUM trace path (`/v1/traces`) and SignalR keep their public URLs, so no frontend change is needed.
- **Negative / Risks**: Envoy Gateway becomes a platform component the team upgrades; NLB TLS termination means Envoy sees HTTP, so the redirect needs the dual-listener layout described above; WAF requires a follow-up (CloudFront in front, or Option B for prod).
- **Follow-up actions**:
  1. Translate `k8s/ingress.yaml` into `deploy/apps/cms-demo/base/routes/` and the `/v1/traces` route (component spec: [gitops-argocd.md](../components/gitops-argocd.md)); `k8s/canvas-load-ingress.yaml` is dropped.
  2. Verify SignalR negotiate + WebSocket and the `/v1/traces` POST through Envoy on floci before the first AWS deploy (delivery plan spike S5).
  3. Publish the ACM certificate ARN and `public_ingress_cidrs` as cluster-secret annotations so the `EnvoyProxy` is templated, not committed.

## Consultation

`k8s/ingress.yaml`, `k8s/canvas-load-ingress.yaml`, `k8s/network-policy.yaml`, ADR-013; Kubernetes ingress-nginx retirement notice (2025-11-11) and archive (2026-03-24); AWS LBC Gateway API documentation (GA in v3.0.0); floci EKS source (`EksClusterManager`: `--disable=traefik`, ServiceLB left enabled, only the API server port published).
