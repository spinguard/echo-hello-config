# Load Testing

This directory contains the k6 load test script for the `echo-hello` service. The test simulates a small number of concurrent users making requests to `/echo-hello` with a configurable think time between requests.

## Prerequisites

Install k6 on the machine you will run the test from (jumpbox or local workstation).

**Linux (jumpbox):**
```bash
sudo gpg -k
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

**macOS:**
```bash
brew install k6
```

**Windows (winget):**
```powershell
winget install k6 --source winget
```

**Windows (Chocolatey):**
```powershell
choco install k6
```

**Windows (MSI installer):** Download the latest `.msi` from the [k6 releases page](https://github.com/grafana/k6/releases) and run the installer. After installation, open a new terminal to pick up the updated `PATH`.

Verify the installation:
```bash
k6 version
```

## Finding the Ingress IP

The service is exposed via a Contour ingress with no hostname — access is by cluster IP. Retrieve it before running the test:

```bash
kubectl get ingress echo-hello -n bkable
```

Note the `ADDRESS` column value — that is your `TARGET_URL` host.

> **If `ADDRESS` is empty**, the Envoy LoadBalancer service has not been assigned an external IP. This is a cluster infrastructure issue. See [TROUBLESHOOTING-LOADBALANCING.md](../TROUBLESHOOTING-LOADBALANCING.md) for root cause and resolution.
>
> As a dev workaround, use port-forward to bypass node networking and run k6 against localhost:
>
> ```bash
> # Terminal 1 — keep running
> kubectl port-forward svc/envoy 8080:80 -n tanzu-system-ingress
>
> # Terminal 2 — run k6 with localhost as the target
> k6 run -e TARGET_URL=http://localhost:8080 testing/load-test.js
> ```
>
> Note: port-forward tunnels through the Kubernetes API server and adds latency overhead — results will not be representative of real traffic performance.

## Running the Test

### Minimum required — TARGET_URL must point to the ingress address

```bash
k6 run -e TARGET_URL=http://<ingress-ip> testing/load-test.js
```

### Default behavior

| Parameter | Default | Description |
|---|---|---|
| `VUS` | `10` | Number of concurrent virtual users |
| `DURATION` | `2h` | Total test run duration |
| `THINK_TIME` | `30` | Seconds each user pauses between requests |
| `TARGET_URL` | `http://localhost:3000` | Base URL of the echo-hello service |

### Override parameters

Pass any combination of env vars to adjust the scenario:

```bash
# 20 users, 45-second think time, run for 1 hour
k6 run \
  -e TARGET_URL=http://<ingress-ip> \
  -e VUS=20 \
  -e THINK_TIME=45 \
  -e DURATION=1h \
  testing/load-test.js
```

### Early termination

Press `Ctrl+C` at any time to stop the test. k6 prints a final summary before exiting.

## Collecting Results

Capture the summary to a timestamped file while still watching output live:

```bash
k6 run \
  -e TARGET_URL=http://<ingress-ip> \
  testing/load-test.js \
  2>&1 | tee results-$(date +%Y%m%d-%H%M%S).txt
```

Key metrics to review in the summary:

| Metric | What it tells you |
|---|---|
| `http_req_duration` | Response time distribution (p50, p90, p95, p99) |
| `http_req_failed` | Fraction of requests that returned a non-2xx status |
| `http_reqs` | Total request count and throughput (req/s) |
| `checks` | Pass rate for the `status is 200` and `response has hello` assertions |

## Correlating with RESPONSE_LATENCY

The server's `RESPONSE_LATENCY` ConfigMap value directly affects `http_req_duration`. Update the ConfigMap between runs (see [DEPLOYMENT.md](../DEPLOYMENT.md)) to sweep latency profiles and observe cluster resiliency:

| Profile | RESPONSE_LATENCY | Expected p95 |
|---|---|---|
| Baseline | `20` ms | ~25 ms |
| Moderate | `150` ms | ~160 ms |
| High | `500` ms | ~510 ms |
