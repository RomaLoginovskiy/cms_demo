# Installs Argo CD once, registers the cluster (GitOps Bridge) and creates the root Application.
# Everything after that is reconciled from Git; the argo-cd ApplicationSet adopts this release.

resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = var.argocd_chart_version
  namespace        = var.namespace
  create_namespace = true

  values = var.argocd_values

  wait    = true
  timeout = 900

  lifecycle {
    # Bootstrap only: Argo CD manages its own release from deploy/platform/argo-cd afterwards.
    ignore_changes = all
  }
}

resource "kubernetes_secret_v1" "cluster" {
  metadata {
    name      = "cluster-${var.cluster_name}"
    namespace = var.namespace
    labels = merge(var.cluster_labels, {
      "argocd.argoproj.io/secret-type" = "cluster"
    })
    annotations = var.cluster_annotations
  }

  data = {
    name   = var.cluster_name
    server = "https://kubernetes.default.svc"
    config = jsonencode({ tlsClientConfig = { insecure = false } })
  }

  lifecycle {
    # Local developer overrides (make local-images / make local-retarget).
    ignore_changes = [
      metadata[0].annotations["image_tag_override"],
      metadata[0].annotations["gitops_revision"],
    ]
  }

  depends_on = [helm_release.argocd]
}

# A Helm release of argocd-apps instead of kubernetes_manifest: the Application CRD does not
# exist at plan time on a fresh cluster. Project "default" because the root app creates the others.
resource "helm_release" "root" {
  name       = "argocd-root"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argocd-apps"
  version    = var.argocd_apps_chart_version
  namespace  = var.namespace

  values = [yamlencode({
    applications = {
      root = {
        namespace = var.namespace
        project   = "default"
        source = {
          repoURL        = var.repo_url
          targetRevision = var.revision
          path           = var.root_path
          directory      = { recurse = true }
        }
        destination = {
          server    = "https://kubernetes.default.svc"
          namespace = var.namespace
        }
        syncPolicy = {
          automated   = { prune = true, selfHeal = true }
          syncOptions = ["ServerSideApply=true"]
          retry = {
            limit   = 10
            backoff = { duration = "10s", factor = 2, maxDuration = "5m" }
          }
        }
      }
    }
  })]

  lifecycle {
    ignore_changes = all
  }

  depends_on = [kubernetes_secret_v1.cluster]
}
