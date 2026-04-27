# DevOps Skills

This skill set focuses on deployment and operations for the Secret Rotation Kit project.

## Capabilities

### 1. CI/CD Pipeline
- Set up automated build and test pipelines
- Configure automated deployments
- Implement canary releases and rollback strategies
- Manage environment-specific configurations

### 2. Containerization
- Create optimized Docker images
- Implement multi-stage builds
- Configure container security scanning
- Manage container registries

### 3. Kubernetes Deployment
- Create Helm charts for deployment
- Configure Kubernetes resources (Deployments, Services, etc.)
- Implement horizontal pod autoscaling
- Set up pod disruption budgets for high availability

### 4. Monitoring and Observability
- Configure metrics collection (Prometheus)
- Set up distributed tracing (OpenTelemetry)
- Implement structured logging (JSON format)
- Create dashboards and alerts (Grafana)

### 5. Infrastructure as Code
- Write Terraform configurations
- Manage infrastructure state
- Implement infrastructure testing
- Use GitOps workflows (Flux/ArgoCD)

## CI/CD Configuration

### GitHub Actions Pipeline
```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install
      - run: pnpm run lint
      - run: pnpm run test:coverage
      - run: pnpm run build

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm audit
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  deploy:
    needs: [test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: pnpm run build
      - uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/reaatech/secret-rotation-kit:latest
```

## Docker Configuration

### Multi-stage Dockerfile
```dockerfile
# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

# Production stage — only production dependencies
FROM node:20-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile --prod
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
USER node

EXPOSE 8080
CMD ["node", "dist/sidecar/index.js"]
```

## Kubernetes Deployment

### Helm Chart Values
```yaml
# values.yaml
replicaCount: 3

image:
  repository: ghcr.io/reaatech/secret-rotation-kit
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 8080

resources:
  limits:
    cpu: 500m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80

env:
  - name: PROVIDER_TYPE
    value: "aws"
  - name: AWS_REGION
    value: "us-east-1"

secrets:
  - name: provider-credentials
    keys:
      - AWS_ACCESS_KEY_ID
      - AWS_SECRET_ACCESS_KEY
```

## Monitoring Configuration

### Prometheus Metrics
```typescript
// Key metrics to expose
- rotation_success_total{provider, secret_id}
- rotation_duration_seconds{provider, secret_id}
- rotation_failures_total{provider, secret_id, reason}
- active_key_age_seconds{provider, secret_id}
- consumer_coverage_percent{secret_id}
- key_versions_active{secret_id}
```

### Grafana Dashboard Panels
- Rotation success rate over time
- Rotation latency percentiles (p50, p95, p99)
- Active key age distribution
- Consumer coverage heatmap
- Error rate by provider and secret

## Best Practices

### Deployment
1. **Blue-Green Deployment**: Zero-downtime deployments using two environments
2. **Canary Releases**: Gradual rollout to detect issues early
3. **Health Checks**: Proper liveness and readiness probes
4. **Graceful Shutdown**: Handle SIGTERM for clean shutdown

### Operations
1. **Runbooks**: Document common operational procedures
2. **Incident Response**: Clear escalation paths and procedures
3. **Capacity Planning**: Monitor and plan for growth
4. **Disaster Recovery**: Backup and restore procedures

### Security
1. **Image Scanning**: Scan containers for vulnerabilities
2. **Network Policies**: Restrict network traffic between pods
3. **Secret Management**: Use Kubernetes secrets or external vault
4. **RBAC**: Implement role-based access control

## Troubleshooting Guide

### Common Issues

**High Rotation Latency**
- Check provider API rate limits
- Verify network connectivity
- Review consumer verification timeout settings

**Rotation Failures**
- Check provider credentials and permissions
- Verify secret ID format and existence
- Review error logs for specific failure reasons

**Consumer Coverage Issues**
- Verify consumer health check endpoints
- Check network connectivity to consumers
- Review consumer application logs

---

**Related Skills**: [Security](../security/SKILL.md), [Testing](../testing/SKILL.md), [Architecture](../architecture/SKILL.md)
