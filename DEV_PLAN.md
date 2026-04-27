# Secret Rotation Kit - Development Plan

## Project Overview

**Secret Rotation Kit** is a zero-downtime multi-key rotation library that solves the critical problem every production service faces: safely rotating secrets without service interruption. Based on the proven implementation from AskGM's Secret Manager with multi-key rotation and zero-downtime propagation, this library extracts and generalizes the solution.

### Core Value Proposition

- **Zero-Downtime Rotation**: Overlapping key validity windows ensure continuous service
- **Propagation Verification**: Confirm consumers have picked up new keys before revoking old ones
- **Multi-Provider Support**: AWS Secrets Manager, GCP Secret Manager, and HashiCorp Vault
- **Dual Deployment**: Ships as a library and as a standalone sidecar
- **Event-Driven**: Emits key-change events for reactive systems

### The Hard Problem Solved

The propagation verification step — confirming consumers have picked up the new key before revoking the old one — is the critical piece that most implementations get wrong. This library provides a robust, battle-tested solution.

## MVP Definition

**MVP = Phases 1–5 (Weeks 1–6)**. The core library must be functional and shippable before any sidecar, advanced observability, or polish work begins.

| Deliverable | In MVP | Post-MVP |
|-------------|--------|----------|
| Type system & core interfaces | ✅ | |
| Key generation & storage | ✅ | |
| AWS / GCP / Vault providers | ✅ | |
| Rotation workflow engine | ✅ | |
| Propagation verification (active + passive) | ✅ | |
| Event emitter (local bus) | ✅ | |
| Unit + integration tests | ✅ | |
| Sidecar server | | ✅ Week 8 |
| Remote event bus (webhooks, SQS, etc.) | | ✅ Week 6–7 |
| Event persistence / audit store | | ✅ Week 6–7 |
| gRPC API | | ✅ Week 8 |
| Helm charts / K8s manifests | | ✅ Week 8 |
| Dashboard / advanced alerting | | ✅ v1.1+ |

## Package Structure

The repo is organized as a single package with clear sub-module boundaries, not a monorepo. This keeps the initial release simple while preserving the ability to split later.

```
src/
  index.ts                    # Public API entry point
  types/                      # Core type definitions
  application/                # RotationManager, ConsumerRegistry, SidecarServer
  core/                       # KeyRotator, PropagationVerifier, KeyWindowManager, etc.
  providers/                  # AWS, GCP, Vault adapters + ProviderFactory
  infrastructure/             # Logger, Metrics, Config services
  events/                     # EventEmitter, LocalEventBus, EventStore
  sidecar/                    # HTTP/gRPC server, SidecarClient
```

The sidecar is built from the same package but ships as a separate Docker image (`ghcr.io/reaatech/secret-rotation-kit-sidecar`).

## Development Phases

### Phase 1: Foundation & Core Types (Week 1)

**Parallel track**: Project setup + type definitions can happen concurrently.

#### 1.1 Project Setup
- [x] Initialize TypeScript project with pnpm
- [x] Configure Biome (lint + format) and Husky
- [x] Set up Vitest for unit testing
- [x] Configure GitHub Actions CI/CD pipeline
- [x] Set up conventional commits, changesets, and semantic versioning

#### 1.2 Core Type Definitions
- [x] Define `SecretKey` type:
  - Key identifier
  - Key material (encrypted)
  - Validity window (start, end)
  - Status (active, pending, expired, revoked)
  - Metadata (created_at, rotated_at, etc.)
- [x] Define `RotationState` type:
  - Current active key
  - Pending keys (being propagated)
  - Expired keys (grace period)
  - Revoked keys
- [x] Define `RotationEvent` types:
  - `KeyGenerated`
  - `KeyPropagated`
  - `KeyVerified`
  - `KeyRevoked`
  - `RotationFailed`
- [x] Define `ProviderConfig` types for each provider

#### 1.3 Core Interfaces
- [x] `SecretProvider` interface (abstract)
- [x] `KeyGenerator` interface (renamed from `KeyRotator`)
- [x] `PropagationVerifier` interface
- [x] `EventEmitter` interface
- [x] `KeyStore` interface

### Phase 2: Key Management & Storage (Week 2)

#### 2.1 Key Generation
- [x] Implement `CryptographicKeyGenerator`:
  - Cryptographically secure key generation
  - Key format standardization (base64, hex, pem, raw)
  - Key encryption at rest (AES-256-GCM)
  - Key versioning
- [x] Implement key validation (via `validate()` method):
  - Format validation
  - Expiration validation

#### 2.2 Key Store
- [x] Implement `InMemoryKeyStore`:
  - Thread-safe key storage (per-secret async locking)
  - Atomic operations
  - Snapshot support
- [x] Implement `FileSystemKeyStore`:
  - File-based persistence
  - Atomic writes (temp file + rename)
  - Encryption at rest (AES-256-GCM)
- [ ] Database persistence (future)

#### 2.3 Key Lifecycle Management
- [x] Implement `KeyLifecycleManager`:
  - Key creation (pending state)
  - Key activation
  - Key expiration
  - Key revocation
  - Mark failed (for error recovery)
- [x] Add key metadata tracking
- [x] Implement key audit logging (via Logger interface)

### Phase 3: Provider Adapters (Week 3-4)

#### 3.1 AWS Secrets Manager Adapter
- [x] Implement `AWSProvider`:
  - AWS SDK v3 integration
  - Secret versioning support
  - Version stage management (AWSCURRENT, AWSPENDING, AWSPREVIOUS)
  - Region configuration
  - Custom endpoint support (e.g., LocalStack)
- [ ] Add AWS-specific features:
  - Secret rotation Lambda integration
  - CloudWatch metrics
  - EventBridge integration

#### 3.2 GCP Secret Manager Adapter
- [x] Implement `GCPProvider`:
  - GCP Secret Manager API integration
  - Secret versioning support
  - Label-based rotation state tracking
  - Project configuration
  - Custom endpoint support
- [ ] Add GCP-specific features:
  - Cloud Monitoring integration
  - Pub/Sub notifications
  - Secret version states

#### 3.3 HashiCorp Vault Adapter
- [x] Implement `VaultProvider`:
  - Vault API integration (node-vault)
  - KV v2 support
  - Token-based authentication (via `VAULT_TOKEN`)
  - Custom mount path configuration
  - ESM compatibility (via `createRequire`)
- [ ] Add Vault-specific features:
  - Dynamic secrets support
  - Lease management
  - AppRole / Kubernetes authentication

#### 3.4 Provider Abstraction
- [x] Implement `ProviderFactory`:
  - Configuration-based selection
  - Required field validation per provider
- [x] Create provider health monitoring (via `health()` method on each provider)
- [ ] Implement provider connection pooling

### Phase 4: Rotation Orchestration (Week 5)

#### 4.1 Rotation Scheduler
- [x] Implement interval-based scheduling (via `RotationManager.start()`)
- [x] Manual rotation API (via `RotationManager.rotate()`)
- [ ] Cron-based scheduling
- [ ] Event-triggered rotation
- [ ] Usage-based rotation

#### 4.2 Rotation Workflow
- [x] Implement `RotationWorkflow`:
  1. Generate new key
  2. Save to key store
  3. Begin provider rotation session
  4. Store secret value in provider
  5. Verify propagation
  6. Activate new key (expire old)
  7. Complete provider rotation
- [x] Add workflow state management (via `KeyLifecycleManager`)
- [x] Implement workflow recovery (cancel rotation session, mark key failed on error)

#### 4.3 Overlapping Key Windows
- [x] Basic key window management (activation expires previous active key)
- [x] Key selection logic (prefer newest active key via `KeyStore.getActive()`)
- [ ] Dedicated `KeyWindowManager` with configurable overlap/grace periods
- [ ] Multi-key support with programmable validity windows

### Phase 5: Propagation Verification (Week 6) — The Hard Part ⚠️ Critical Path

> **This phase is the core differentiator of the library.** It must be rock-solid before any release.

#### 5.1 Propagation Detection
- [ ] Implement `PropagationDetector`:
  - Consumer acknowledgment tracking
  - Key usage monitoring
  - Version detection
  - Health check integration
- [ ] Add propagation metrics:
  - Time to propagate
  - Consumer coverage
  - Failed propagations

#### 5.2 Verification Strategies
- [x] Implement `PollingPropagationVerifier`:
  - Polls provider to confirm new secret version is readable
  - Configurable polling interval and timeout
  - Cancellable verification
  - Progress tracking and status reporting
- [ ] Implement `ActiveVerification` (consumer-level polling)
- [ ] Implement `PassiveVerification` (key usage / error rate monitoring)

#### 5.3 Verification Policies
- [x] Implement basic verification policies:
  - Minimum coverage threshold (`minConsumerCoverage`)
  - Maximum wait time (`verificationTimeoutMs`)
  - Graceful timeout handling
- [ ] Retry strategies with exponential backoff
- [ ] Per-consumer timeout configuration

#### 5.4 Consumer Tracking
- [x] Define consumer types (`Consumer`, `ConsumerCapabilities`, `ConsumerAuthConfig`)
- [ ] Implement `ConsumerRegistry`:
  - Consumer registration
  - Consumer health monitoring
  - Consumer capability tracking
  - Dynamic consumer discovery
- [ ] Add consumer groups:
  - Group-based verification
  - Staged rollouts
  - Canary deployments

### Phase 6: Event System (Week 7)

**Parallel track**: Can be built alongside Phase 5. The local event bus is required for MVP; remote transports are post-MVP.

#### 6.1 Event Emission
- [x] Implement `InMemoryEventEmitter`:
  - Event types (generated, propagated, verified, activated, rotation_failed)
  - Event payload standardization
  - Bounded event history (configurable `maxHistory`)
- [x] Add event filtering:
  - Event type filtering (via `EventFilters`)
  - Secret name filtering
  - Event replay support

#### 6.2 Event Transport
- [x] Implement local event bus (`InMemoryEventEmitter`):
  - In-process event bus
  - Subscriber management (`on`/`off`)
  - Event replay (`replay`)
- [ ] Implement `RemoteEventBus`:
  - HTTP webhook delivery
  - Message queue integration (SQS, Pub/Sub, etc.)
  - Event streaming (Kafka, Kinesis)

#### 6.3 Event Persistence
- [ ] Implement `EventStore`:
  - Event persistence
  - Event querying
  - Event replay
  - Event archival
- [ ] Add event audit trail:
  - Complete rotation history
  - Compliance reporting
  - Forensic analysis

### Phase 7: Sidecar Implementation (Week 8)

**Post-MVP track**. Do not start until Phases 1–5 are complete and the core library is passing integration tests.

#### 7.1 Sidecar Core
- [ ] Implement `SidecarServer`:
  - HTTP/gRPC API
  - Health check endpoint
  - Metrics endpoint
  - Configuration endpoint
- [ ] Add sidecar discovery:
  - Service registration
  - DNS-based discovery
  - Consul integration

#### 7.2 Sidecar Communication
- [ ] Implement `SidecarClient`:
  - Library-sidecar communication
  - Connection pooling
  - Retry logic
  - Circuit breaker
- [ ] Add client SDK:
  - TypeScript client
  - JavaScript client
  - gRPC client

#### 7.3 Sidecar Deployment
- [ ] Create Docker image
- [ ] Create Kubernetes manifests
- [ ] Create Helm chart
- [ ] Add deployment guides

### Phase 8: Error Handling & Resilience (Week 9)

#### 8.1 Error Handling
- [x] Implement comprehensive error types:
  - `RotationError` (base)
  - `ProviderError`
  - `PropagationError`
  - `VerificationError`
  - `TimeoutError`
- [x] Error recovery (cancel rotation session, mark key failed)
- [x] Graceful degradation (event emitter failures don't block rotation)
- [ ] Retry logic with exponential backoff
- [ ] Circuit breaker

#### 8.2 Resilience Patterns
- [ ] Add retry logic with exponential backoff
- [ ] Implement circuit breaker
- [ ] Add timeout handling
- [ ] Implement idempotency keys
- [ ] Add dead letter queue support

#### 8.3 Rollback Mechanisms
- [ ] Implement `RollbackManager`:
  - Automatic rollback on failure
  - Manual rollback API
  - Rollback verification
  - Rollback audit trail
- [ ] Add rollback strategies:
  - Immediate rollback
  - Staged rollback
  - Partial rollback

### Phase 9: Observability & Monitoring (Week 10)

#### 9.1 Logging & Metrics
- [ ] Implement structured logging:
  - Rotation lifecycle events
  - Performance metrics
  - Error tracking
- [ ] Add metrics collection:
  - Rotation success rate
  - Average rotation time
  - Propagation verification time
  - Key age distribution

#### 9.2 Debugging & Tracing
- [ ] Implement distributed tracing:
  - Correlation IDs
  - Span tracking
  - Context propagation
- [ ] Add debug mode
- [ ] Implement rotation replay capability

#### 9.3 Alerting
- [ ] Implement alert rules:
  - Rotation failures
  - Propagation timeouts
  - Key expiration warnings
  - Provider health issues
- [ ] Add alert integrations:
  - PagerDuty
  - Slack
  - Email

### Phase 10: Testing & Quality Assurance (Week 11)

#### 10.1 Unit Tests
- [x] Achieve >95% code coverage (currently 98.15%)
- [x] Test all core types and interfaces (18 test files, 239 tests)
- [x] Test provider adapters (AWS, GCP, Vault, ProviderFactory)
- [x] Test rotation workflows (end-to-end with mock dependencies)
- [x] Test verification strategies (polling, timeout, cancellation)

#### 10.2 Integration Tests
- [ ] Test with AWS Secrets Manager (use localstack)
- [ ] Test with GCP Secret Manager (use emulator)
- [ ] Test with HashiCorp Vault (use dev server)
- [ ] Test multi-provider scenarios
- [ ] Test error scenarios

#### 10.3 End-to-End Tests
- [ ] Test complete rotation workflow
- [ ] Test propagation verification
- [ ] Test sidecar communication
- [ ] Test event emission
- [ ] Test rollback scenarios

### Phase 11: Documentation & Examples (Week 12)

#### 11.1 API Documentation
- [ ] Generate TypeDoc documentation
- [ ] Write comprehensive README
- [ ] Create API reference guide
- [ ] Document configuration options
- [ ] Add troubleshooting guide

#### 11.2 Examples & Tutorials
- [ ] Create basic usage examples
- [ ] Build advanced scenario examples
- [ ] Write migration guides
- [ ] Create video tutorials
- [ ] Build interactive playground

#### 11.3 Integration Guides
- [ ] Write AWS integration guide
- [ ] Write GCP integration guide
- [ ] Write Vault integration guide
- [ ] Write sidecar deployment guide
- [ ] Create best practices guide

### Phase 12: Production Readiness (Week 13)

#### 12.1 Security & Compliance
- [ ] Implement input sanitization
- [ ] Add rate limiting
- [ ] Implement authentication/authorization
- [ ] Add audit logging
- [ ] Ensure compliance with security standards

#### 12.2 Performance Optimization
- [ ] Optimize bundle size
- [ ] Add tree-shaking support
- [ ] Implement lazy loading
- [ ] Optimize TypeScript compilation
- [ ] Add performance benchmarks

#### 12.3 Final Polish
- [ ] Complete API stability review
- [ ] Finalize configuration schema
- [ ] Add migration scripts
- [ ] Create changelog
- [ ] Prepare v1.0.0 release

## Technology Stack

### Core Dependencies
- **TypeScript**: Latest stable version (5.x)
- **Runtime**: Node.js 20+ (ES2022 target)
- **Package Manager**: pnpm (latest)
- **Module System**: ESM with CommonJS fallback

### Development Tools
- **Build**: tsup (ESM + CJS dual output)
- **Testing**: Vitest
- **Linting & Formatting**: Biome (replaces ESLint + Prettier; faster, unified config)
- **Git Hooks**: Husky + lint-staged
- **Versioning**: Changesets
- **Documentation**: TypeDoc + Markdown

### Provider SDKs (Peer Dependencies)
- **AWS**: @aws-sdk/client-secrets-manager
- **GCP**: @google-cloud/secret-manager
- **Vault**: vault-sdk or direct HTTP client

### Optional Dependencies
- **Event Bus**: @aws-sdk/client-eventbridge, @google-cloud/pubsub
- **Message Queue**: @aws-sdk/client-sqs, kafkajs
- **Observability**: @opentelemetry/api, pino
- **Validation**: zod or io-ts

## Quality Gates

### Code Quality
- [x] Biome: Zero errors, zero warnings (44 files clean)
- [x] TypeScript: Strict mode enabled (`tsc --noEmit` passes)
- [x] Test Coverage: 98.15% statements, 90.18% branches, 98.63% functions
- [x] Code Review: All changes reviewed
- [ ] Security Scan: Run `pnpm audit` regularly

### Performance
- [x] Rotation Latency: <1s for key generation
- [ ] Bundle Size: Measure gzip size post-build
- [ ] Memory Usage: Profile baseline usage
- [ ] CPU Usage: Minimal impact

### Documentation
- [x] README: Comprehensive guide with quick start and examples
- [x] Architecture: Detailed ARCHITECTURE.md
- [x] Development: DEV_PLAN.md with phases and roadmap
- [ ] API Docs: Generate TypeDoc documentation
- [ ] Migration: Clear upgrade paths

## Success Metrics

### Adoption Metrics
- GitHub stars: >500 in first 3 months
- npm downloads: >10K/month in first 6 months
- Active contributors: >10
- Enterprise adopters: >5

### Technical Metrics
- Rotation success rate: >99.9%
- Average rotation time: <30s
- Propagation verification accuracy: >99%
- Error rate: <0.01%

## Risk Mitigation

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Provider API breaks contract | High | Low | Abstract interfaces; lock SDK versions; nightly integration tests against real APIs |
| Key loss during rotation | Critical | Low | Never delete before verification succeeds; maintain audit trail; automatic rollback on failure |
| Propagation verification false positives | High | Medium | Hybrid verification (active + passive); configurable thresholds; manual override API |
| Scope creep delays MVP | Medium | High | Strict MVP gate (Phases 1–5 only); defer sidecar & remote events |
| Dependency vulnerability | Medium | Medium | Minimize deps; automated Snyk / Dependabot scans; vendor critical crypto code |
| Performance regression | Low | Low | Benchmarks in CI; alert on p95 latency >60s |

## Post-Launch Roadmap

### v1.1 (Month 4)
- Additional provider adapters (Azure Key Vault, etc.)
- Advanced verification strategies
- Multi-region rotation support

### v1.2 (Month 6)
- UI dashboard for rotation monitoring
- Advanced analytics and reporting
- Automated compliance reporting

### v2.0 (Year 1)
- Plugin architecture for custom providers
- Advanced key derivation functions
- Distributed rotation coordination

## Getting Started

```bash
# Clone the repository
git clone https://github.com/reaatech/secret-rotation-kit.git
cd secret-rotation-kit

# Install dependencies
pnpm install

# Run tests
pnpm test

# Build the project
pnpm build

# Run linter
pnpm lint
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.
