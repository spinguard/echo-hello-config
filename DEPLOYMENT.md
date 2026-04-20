# Deployment Guide

This repo holds the Kubernetes manifests for the `echo-hello` service and is reconciled to the cluster by Flux GitOps.

## Repository Layout

```
flux/
  gitrepository.yaml    # Flux GitRepository — points to this repo
  kustomization.yaml    # Flux Kustomization — applies k8s/ to the cluster
k8s/
  configmap.yaml        # Runtime configuration (PERSON, RESPONSE_LATENCY_MIN, RESPONSE_LATENCY_MAX)
  deployment.yaml       # App deployment (image, probes, security context)
  service.yaml          # ClusterIP service on port 80 → 3000
  ingress.yaml          # Contour ingress at path /echo-hello
  kustomization.yaml    # Kustomize root for the k8s/ directory
testing/
  load-test.js          # k6 load test script
  README.md             # Load test instructions
```

## Cluster Details

| Item | Value |
|---|---|
| Namespace | `bkable` |
| Flux namespace | `tanzu-source-controller` |
| Ingress controller | Contour |
| Service type | ClusterIP |
| Container port | 3000 |

## Flux Reconciliation

Flux watches this repo on the `main` branch with a 1-minute sync interval. Any commit to `main` will be applied to the cluster within ~1 minute.

To check reconciliation status:
```bash
kubectl get gitrepository echo-hello-config -n tanzu-source-controller
kubectl get kustomization echo-hello -n tanzu-source-controller
```

To force an immediate reconciliation without waiting for the interval:
```bash
flux reconcile kustomization echo-hello -n tanzu-source-controller
```

## Updating Configuration

Runtime configuration is in `k8s/configmap.yaml`. The app reads env vars from this ConfigMap on each request, so changes take effect without a pod restart.

### Change the latency profile (e.g. for a load test)

Edit `k8s/configmap.yaml` to set the desired MIN/MAX range:
```yaml
data:
  PERSON: "world"
  RESPONSE_LATENCY_MIN: "50"
  RESPONSE_LATENCY_MAX: "150"
```

Commit and push to `main`. Flux will apply the change within ~1 minute. The actual delay is drawn randomly from [MIN, MAX] on each request — no pod restart needed.

To apply immediately without waiting for Flux:
```bash
kubectl patch configmap echo-hello-config \
  -n bkable \
  --type merge \
  -p '{"data":{"RESPONSE_LATENCY_MIN":"50","RESPONSE_LATENCY_MAX":"150"}}'
```

## Releasing a New Image Version

Image tags are managed by Flux image automation in the `echo-hello` app repo. When a new semver tag is pushed there, the release workflow publishes a new image to GHCR and the image policy automation updates the image tag in `k8s/deployment.yaml` and commits back to this repo.

To manually pin a specific image version, edit `k8s/deployment.yaml`:
```yaml
image: ghcr.io/spinguard/echo-hello:<version>
```

Commit and push. Flux will roll out the new image.

## Verifying the Deployment

```bash
# Pod status
kubectl get pods -n bkable -l app=echo-hello

# Tail logs
kubectl logs -n bkable -l app=echo-hello -f

# Get ingress address
kubectl get ingress echo-hello -n bkable

# Smoke test
curl http://<ingress-ip>/echo-hello
```

## Load Testing

See [testing/README.md](testing/README.md) for instructions on running the k6 load test against the deployed service.
