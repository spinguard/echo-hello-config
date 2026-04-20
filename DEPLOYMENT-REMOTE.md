# Remote Deployment Guide

Deploying `echo-hello` to a Kubernetes cluster managed by Tanzu Mission Control (TMC) v1.4.2, VKS 3.11, Supervisor v1.29, with Contour and Flux add-ons installed.

## Prerequisites

- `kubectl` context configured to the target cluster
- Flux CRDs installed (via TMC Flux add-on)
- Contour installed (via TMC add-on)
- GitHub PAT with read access to `spinguard/echo-hello-config` (and write access if using ImageUpdateAutomation)

---

## Steps to Expose the Endpoint

### 1. Verify Contour's Envoy service has an external IP

```bash
kubectl get svc -n tanzu-system-ingress
```

You should see an `envoy` service of type `LoadBalancer` with an `EXTERNAL-IP` assigned. VKS with Supervisor automatically provisions a load balancer via NSX/AVI — no ExternalDNS needed. If `EXTERNAL-IP` is `<pending>`, see [TROUBLESHOOTING-LOADBALANCING.md](./TROUBLESHOOTING-LOADBALANCING.md).

### 2. Ingress behavior (no host required)

`k8s/ingress.yaml` has no `host:` field, so Contour will match any request to `<external-ip>/echo-hello`. This is ideal for k6 testing without DNS.

---

## Flux Bootstrap (apply order matters)

### 1. Create the target namespace

```bash
kubectl create namespace bkable
```

### 2. Create the GitHub PAT secret

```bash
kubectl create secret generic github-token \
  --from-literal=username=<github-user> \
  --from-literal=password=<github-pat> \
  -n tanzu-source-controller
```

### 3. Apply the GitRepository and Kustomization

```bash
kubectl apply -f flux/gitrepository.yaml
kubectl apply -f flux/kustomization.yaml
```

### 4. Watch reconciliation

```bash
kubectl get gitrepository,kustomization -n tanzu-source-controller
kubectl get all -n bkable
kubectl get ingress -n bkable
```

---

## Verify the Endpoint

```bash
ENVOY_IP=$(kubectl get svc envoy -n tanzu-system-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
curl http://$ENVOY_IP/echo-hello
```

---

## Running k6 Tests

```bash
ENVOY_IP=$(kubectl get svc envoy -n tanzu-system-ingress -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
k6 run -e BASE_URL=http://$ENVOY_IP/echo-hello <test-file>.js
```

In your k6 script, reference the URL via environment variable:

```js
const BASE_URL = __ENV.BASE_URL;
```

If the LoadBalancer IP is not yet available, see [TROUBLESHOOTING-LOADBALANCING.md](./TROUBLESHOOTING-LOADBALANCING.md) for workarounds.

---

## Troubleshooting

| Issue | Check |
|---|---|
| `envoy` svc stuck `<pending>` or NodePort hangs | See [TROUBLESHOOTING-LOADBALANCING.md](./TROUBLESHOOTING-LOADBALANCING.md) |
| Flux namespace mismatch | Confirm CRDs are in `tanzu-source-controller`: `kubectl get ns` — some TMC setups use `flux-system` instead |
| `validation: client` error | Deprecated in newer Flux; change to `validation: none` or remove the field |
| Image pull failure | Uncomment `imagePullSecrets` in `k8s/deployment.yaml` and create the `ghcr-auth` secret in the `bkable` namespace |

---

## Notes

- No ExternalDNS is needed for k6 testing; use the raw external IP.
- `k8s/deployment.yaml` is configured for 2 replicas, providing distribution across both cluster nodes.
- If the cluster is not fully configured for LoadBalancer provisioning, see [TROUBLESHOOTING-LOADBALANCING.md](./TROUBLESHOOTING-LOADBALANCING.md).
