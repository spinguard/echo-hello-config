# Troubleshooting: Load Balancing on VKS with NSX-T

This document covers load balancer exposure issues encountered on VKS 3.11 / Supervisor v1.29 / TMC v1.4.2 with Contour and Antrea CNI, where NSX-T provides infrastructure networking but no AVI is configured.

---

## Issue 1: Envoy LoadBalancer service has no external IP

**Symptom:** `kubectl get svc envoy -n tanzu-system-ingress` shows `EXTERNAL-IP` as `<pending>`.

**Root cause:** On VKS with NSX-T, LoadBalancer IPs for workload cluster services are provisioned by the vSphere Cloud Provider Interface (CPI), which delegates to the Supervisor. If no IP pool is allocated to the Supervisor namespace for workload LB services, CPI has nothing to assign.

**Diagnosis:**
```bash
# Confirm no LB provider is assigning IPs
kubectl get events -A | grep -iE 'loadbalancer|service|envoy' | head -30

# Test whether any LB service can get an IP
kubectl create namespace lb-test
kubectl create deployment nginx --image=nginx -n lb-test
kubectl expose deployment nginx --port=80 --type=LoadBalancer -n lb-test
kubectl get svc nginx -n lb-test -w   # watch for ~60s
kubectl delete namespace lb-test
```

**Fix (requires vSphere/NSX admin):** The Supervisor namespace needs an IP range allocated for workload LoadBalancer services. In NSX-T Manager:

> NSX Manager > Networking > IP Address Pools > [pool assigned to the Supervisor]

Expand the IP block or increase the LB service quota. In vCenter 8.x this may also be accessible under:

> Workload Management > Supervisors > [supervisor] > Configure > Namespaces > [namespace] > Edit Resource Limits

### Workaround: Patch Envoy to NodePort

Contour remains in the routing path; only the entry point changes from a load balancer VIP to a node IP + NodePort.

> **Reconciliation note:** The `envoy` service lives in `tanzu-system-ingress`, managed by the TMC Contour add-on — not by Flux. Patching the service type is safe from Flux reconciliation. The TMC add-on controller does not continuously revert individual service type changes, so the patch is stable.

**1. Patch Envoy to NodePort:**
```bash
kubectl patch svc envoy -n tanzu-system-ingress -p '{"spec": {"type": "NodePort"}}'
```

**2. Get the NodePort assigned to port 80:**
```bash
kubectl get svc envoy -n tanzu-system-ingress -o jsonpath='{.spec.ports[?(@.port==80)].nodePort}'
```

**3. Get a node IP:**
```bash
kubectl get nodes -o wide  # use INTERNAL-IP of either node
```

NodePort is exposed on all nodes — kube-proxy load balances across all healthy pods regardless of which node IP you hit.

**4. Verify end-to-end through Contour:**
```bash
curl http://<node-ip>:<nodeport>/echo-hello
```

**5. Revert when LoadBalancer is available:**
```bash
kubectl patch svc envoy -n tanzu-system-ingress -p '{"spec": {"type": "LoadBalancer"}}'
```

---

## Issue 2: NodePort hangs — NSX-T distributed firewall blocking traffic

**Symptom:** `curl http://<node-ip>:<nodeport>/echo-hello` hangs indefinitely. The Ingress is recognized by Contour, Envoy pods are running and healthy, but no requests appear in Envoy logs.

**Confirmed via:**
```bash
# This succeeds — Contour and the app are healthy
kubectl port-forward svc/envoy 8080:80 -n tanzu-system-ingress
curl http://localhost:8080/echo-hello

# This hangs — node-level firewall dropping packets
nc -zv <node-ip> <nodeport>
```

**Root cause:** The NSX-T Distributed Firewall (DFW) is dropping inbound traffic to the NodePort range (`30000-32767`) on the workload cluster nodes. No NetworkPolicy change inside the cluster can resolve this — it requires an NSX-T admin action.

**Fix (requires NSX-T admin):** Add a DFW rule in NSX-T Manager permitting inbound traffic to the NodePort range on the workload cluster node VMs:

| Field | Value |
|---|---|
| Source | Any (or restrict to test client IP) |
| Destination | Workload cluster node VMs (target by cluster/namespace tag from Supervisor provisioning) |
| Service / Port | TCP `30000-32767` |
| Action | Allow |

### Workaround: Run k6 via port-forward

Port-forward bypasses node networking entirely and tunnels through the Kubernetes API server. It works but adds API server latency overhead — not representative of production throughput, but sufficient for dev/exploratory testing.

**Terminal 1 — keep running:**
```bash
kubectl port-forward svc/envoy 8080:80 -n tanzu-system-ingress
```

**Terminal 2 — run k6:**
```bash
k6 run -e BASE_URL=http://localhost:8080/echo-hello <test-file>.js
```

In your k6 script:
```js
const BASE_URL = __ENV.BASE_URL;
```
