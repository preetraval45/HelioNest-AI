# HelioNest-AI — Kubernetes Infrastructure

Hybrid Docker + Kubernetes deployment.
- **Local development**: Docker Compose (`infra/docker-compose.yml`)
- **Staging / Production**: Kubernetes via Kustomize overlays

## Directory Structure

```
infra/k8s/
├── namespace.yaml          # helionest namespace
├── configmap.yaml          # Non-secret env vars
├── secret.yaml             # Secret template (fill before applying)
├── kustomization.yaml      # Base Kustomize manifest
├── postgres/
│   ├── pvc.yaml            # 20Gi PersistentVolumeClaim
│   ├── statefulset.yaml    # PostgreSQL + PostGIS StatefulSet
│   └── service.yaml        # ClusterIP service
├── redis/
│   ├── deployment.yaml     # Redis 7 Deployment
│   └── service.yaml        # ClusterIP service
├── backend/
│   ├── deployment.yaml     # FastAPI Deployment (2 replicas, rolling update)
│   ├── service.yaml        # ClusterIP service
│   └── hpa.yaml            # HorizontalPodAutoscaler (2–6 pods, CPU/mem based)
├── frontend/
│   ├── deployment.yaml     # Next.js Deployment (2 replicas)
│   └── service.yaml        # ClusterIP service
├── ingress/
│   └── ingress.yaml        # NGINX Ingress (helionest.app + api.helionest.app)
└── overlays/
    ├── staging/            # 1-replica low-cost staging config
    └── production/         # Full production config
```

## Prerequisites

- `kubectl` connected to your cluster
- `kustomize` installed (`brew install kustomize` or `choco install kustomize`)
- NGINX Ingress Controller deployed in the cluster
- (Optional) cert-manager for automatic TLS certificates

## Deploy

### 1. Fill in secrets

Edit `infra/k8s/secret.yaml` — replace placeholder base64 values with real ones:

```bash
echo -n "your-db-password" | base64
echo -n "your-anthropic-key" | base64
# etc.
```

### 2. Apply to staging

```bash
kubectl apply -k infra/k8s/overlays/staging
```

### 3. Apply to production

```bash
kubectl apply -k infra/k8s/overlays/production
```

### 4. Check status

```bash
kubectl get all -n helionest
kubectl get ingress -n helionest
```

### 5. Run Alembic migrations (first deploy only)

```bash
BACKEND_POD=$(kubectl get pod -n helionest -l app=backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n helionest "$BACKEND_POD" -- alembic upgrade head
```

## CI/CD

GitHub Actions (`deploy.yml`) automatically:
1. Builds backend + frontend Docker images → pushes to GHCR
2. Updates image tags in the Kustomize overlay
3. Applies the overlay with `kubectl apply -k`
4. Rolls out and runs a health-check smoke test

Triggers:
- `main` branch → production
- `staging` branch → staging

## Local Development (Docker Compose)

```bash
cp infra/.env.example infra/.env
# Fill in your API keys
docker compose -f infra/docker-compose.yml up -d
```
