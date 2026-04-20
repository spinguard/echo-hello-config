# echo-hello-config

This repo contains the Kubernetes manifests and Flux GitOps configuration for the `echo-hello` service. The cluster reconciles changes from this repo automatically via Flux.

The application source code lives in the companion repo [spinguard/echo-hello](https://github.com/spinguard/echo-hello).

## What's in this repo

| Path | Purpose |
|---|---|
| `flux/` | Flux `GitRepository` and `Kustomization` resources |
| `k8s/` | Kubernetes manifests (ConfigMap, Deployment, Service, Ingress) |
| `testing/` | k6 load test script and instructions |

## Quick links

- [Deployment Guide](DEPLOYMENT.md) — how Flux reconciliation works, how to update configuration, and how to release a new image version
- [Load Testing](testing/README.md) — how to run the k6 load test and interpret results

## Runtime Configuration

The app is configured via `k8s/configmap.yaml`. Changes committed to `main` are applied to the cluster within ~1 minute.

| Variable | Default | Description |
|---|---|---|
| `PERSON` | `world` | Name echoed in the response: `hello from <PERSON>` |
| `RESPONSE_LATENCY_MIN` | `20` | Minimum response delay in milliseconds |
| `RESPONSE_LATENCY_MAX` | equal to MIN | Maximum response delay; actual delay is a random value in [MIN, MAX] |
| `RESPONSE_LATENCY` | `20` | Static fallback delay when MIN/MAX are not set (backward compatible) |
| `LOG_LEVEL` | `info` | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

> `PERSON`, `RESPONSE_LATENCY_MIN`, and `RESPONSE_LATENCY_MAX` are re-read on every request — ConfigMap changes take effect immediately with no restart. `LOG_LEVEL` is read at process startup and requires a pod restart to change.

### Load Test Simulation

`RESPONSE_LATENCY_MIN` and `RESPONSE_LATENCY_MAX` model realistic latency variance for cluster resiliency and availability testing. The delay is randomized on every request between the two bounds. By committing new values mid-test, the latency profile can be changed without redeploying the app.

| Profile | MIN | MAX | Use case |
|---|---|---|---|
| Baseline | `10` ms | `30` ms | Establish throughput ceiling |
| Moderate | `50` ms | `150` ms | Simulate a realistic downstream call |
| High | `300` ms | `700` ms | Stress connection handling and pod scaling |
