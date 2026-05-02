# DevOps Skill

Guidance for deployment, CI/CD, and operations for secret-rotation-kit.

## Repository

- **GitHub:** [reaatech/secret-rotation-kit](https://github.com/reaatech/secret-rotation-kit)
- **Default branch:** `main`
- **Package manager:** pnpm 10+

## CI/CD Pipeline

The CI pipeline lives in `.github/workflows/ci.yml` and runs 10 jobs:

```
install (cache) → audit → format → lint → typecheck → build → test (matrix [20, 22]) → coverage → docker-build → docker-compose → all-checks
```

Key features:
- Dependency caching with `actions/cache@v4`
- Test matrix across Node 20 and 22
- Build artifact upload/download between jobs
- Docker build and compose validation
- Coverage summary in step summary

## Release Pipeline

The release pipeline lives in `.github/workflows/release.yml`:

1. On push to `main`, `changesets/action@v1` checks for pending changesets
2. If changesets exist: opens/updates a "Version Packages" PR
3. When merged: publishes to npm and mirrors to GitHub Packages
4. Uses npm provenance (`NPM_CONFIG_PROVENANCE: 'true'`)

## First Publish

First publish from local laptop. Key steps:

1. Generate `NPM_TOKEN` with "All packages and scopes" granular access
2. Add token to GitHub repository secrets
3. Manual first publish from local laptop:
   ```bash
   cd packages/<name>
   pnpm publish --access public --no-git-checks --otp=<code>
   ```
4. Backfill to GitHub Packages via `gh auth refresh -s write:packages`
5. Re-enable `push: branches: [main]` trigger in release workflow

## Required GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `NPM_TOKEN` | npm publish (granular access token) |
| `GITHUB_TOKEN` | Auto-provided by Actions |

## Docker

The project includes a multi-stage Dockerfile in `docker/`:

```dockerfile
FROM node:22-alpine AS base
# deps stage: install all dependencies
# builder stage: build all packages  
# runner stage: production-only dependencies
```

Docker Compose in `docker/docker-compose.yml` includes:
- `sidecar` — the rotation sidecar server
- `prometheus` — metrics collection
- `grafana` — metrics visualization

## Important Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `srk_rotate_requests_total` | Counter | Total rotation requests |
| `srk_rotate_failures_total` | Counter | Failed rotation requests |

The sidecar exposes these at `GET /metrics` in Prometheus format.

## Operations Checklist

- [ ] `pnpm build` produces `dist/` in each package
- [ ] `pnpm test` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `NPM_TOKEN` secret is current (renews annually)
- [ ] Release workflow trigger is correct for current phase (workflow_dispatch only before first publish)
- [ ] All packages return 200 from `https://registry.npmjs.org/@reaatech%2fsecret-rotation-*`
