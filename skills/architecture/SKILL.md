# Architecture Skills

This skill set focuses on system design and architecture decisions for the Secret Rotation Kit project.

## Capabilities

### 1. System Design
- Design scalable and resilient architectures
- Create component diagrams and data flow diagrams
- Define service boundaries and interfaces
- Plan for high availability and fault tolerance

### 2. Design Patterns
- Apply proven design patterns (Factory, Strategy, Observer, etc.)
- Implement dependency injection for testability
- Use event-driven architecture for loose coupling
- Apply circuit breaker pattern for resilience

### 3. API Design
- Design RESTful APIs with proper HTTP semantics
- Create consistent error handling patterns
- Implement proper versioning strategies
- Design for backward compatibility

### 4. Data Modeling
- Design efficient data schemas
- Plan for data migration and versioning
- Implement proper indexing strategies
- Consider data partitioning for scalability

### 5. Performance Optimization
- Identify and eliminate bottlenecks
- Implement caching strategies
- Optimize database queries
- Plan for horizontal scaling

## Architecture Principles

### 1. Separation of Concerns
- Clear layer boundaries (Application, Core, Provider, Infrastructure)
- Single responsibility for each component
- Minimize coupling between components
- Maximize cohesion within components

### 2. Fault Tolerance
- Design for failure at every layer
- Implement retry mechanisms with exponential backoff
- Use circuit breakers to prevent cascade failures
- Provide graceful degradation

### 3. Observability
- Comprehensive logging with correlation IDs
- Metrics for all critical operations
- Distributed tracing for request flows
- Health checks for all services

### 4. Security by Design
- Zero trust architecture
- Defense in depth
- Principle of least privilege
- Secure defaults

## Component Architecture

### Application Layer
```
┌─────────────────────────────────────────────────────┐
│                   Application Layer                  │
│  ┌─────────────────┐  ┌─────────────────┐          │
│  │ RotationManager │  │ ConsumerRegistry│  Sidecar │
│  └─────────────────┘  └─────────────────┘  Server  │
└─────────────────────────────────────────────────────┘
```

**Responsibilities:**
- Orchestrate rotation workflows
- Manage consumer registrations
- Handle API requests
- Coordinate between components

### Core Services Layer
```
┌─────────────────────────────────────────────────────┐
│                Core Services Layer                   │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │KeyRotator│ │Propagation   │ │KeyWindow       │  │
│  │          │ │Verifier      │ │Manager         │  │
│  └──────────┘ └──────────────┘ └────────────────┘  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │Rotation      │ │Rollback      │ │Event       │  │
│  │Scheduler     │ │Manager       │ │Emitter     │  │
│  └──────────────┘ └──────────────┘ └────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Responsibilities:**
- Core rotation logic
- Propagation verification
- Key window management
- Scheduling and coordination
- Event emission

### Provider Layer
```
┌─────────────────────────────────────────────────────┐
│                   Provider Layer                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ AWS      │ │ GCP      │ │ Vault    │  Provider  │
│  │Provider  │ │Provider  │ │Provider  │  Factory   │
│  └──────────┘ └──────────┘ └──────────┘            │
└─────────────────────────────────────────────────────┘
```

**Responsibilities:**
- Abstract provider-specific details
- Implement provider interfaces
- Handle provider-specific errors
- Manage provider authentication

### Infrastructure Layer
```
┌─────────────────────────────────────────────────────┐
│                Infrastructure Layer                  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │
│  │Logger        │ │Metrics       │ │Config      │  │
│  │Service       │ │Service       │ │Service     │  │
│  └──────────────┘ └──────────────┘ └────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Responsibilities:**
- Structured logging
- Metrics collection
- Configuration management
- Cross-cutting concerns

## Design Decisions

### 1. Event-Driven Architecture
**Decision:** Use event-driven architecture for loose coupling between rotation and consumer systems.

**Rationale:**
- Enables asynchronous processing
- Allows consumers to react to key changes independently
- Supports multiple consumers with different processing needs
- Improves system resilience

**Implementation:**
```typescript
export interface RotationEvent {
  type: 'key_rotated' | 'key_revoked' | 'rotation_failed';
  secretName: string;
  timestamp: Date;
  correlationId: string;
  payload: {
    oldVersion?: string;
    newVersion?: string;
    error?: string;
  };
}
```

### 2. Provider Factory Pattern
**Decision:** Use factory pattern to create provider instances.

**Rationale:**
- Centralizes provider creation logic
- Enables easy addition of new providers
- Supports provider-specific configuration
- Simplifies testing with mock providers

**Implementation:**
```typescript
export class ProviderFactory {
  static create(config: ProviderConfig): SecretProvider {
    switch (config.type) {
      case 'aws':
        return new AWSProvider(config);
      case 'gcp':
        return new GCPProvider(config);
      case 'vault':
        return new VaultProvider(config);
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }
}
```

### 3. Overlapping Key Windows
**Decision:** Maintain overlapping validity windows for old and new keys.

**Rationale:**
- Ensures zero-downtime during rotation
- Provides grace period for consumer adoption
- Supports gradual rollout of new keys
- Enables rollback if issues detected

**Implementation:**
```typescript
export interface KeyWindow {
  version: string;
  validFrom: Date;
  validUntil: Date;
  status: 'active' | 'pending' | 'revoked';
}
```

## Architecture Decision Records (ADR)

### ADR-001: TypeScript Strict Mode
**Status:** Accepted

**Context:** Need to ensure type safety and catch errors early.

**Decision:** Use TypeScript strict mode for all code.

**Consequences:**
- More verbose code with explicit types
- Better IDE support and autocomplete
- Fewer runtime errors
- Easier refactoring

### ADR-002: ESM with CommonJS Fallback
**Status:** Accepted

**Context:** Need to support both ESM and CommonJS consumers.

**Decision:** Build as ESM with CommonJS fallback.

**Consequences:**
- Dual build output
- Slightly larger package size
- Maximum compatibility
- Future-proof for ESM adoption

### ADR-003: Vitest for Testing
**Status:** Accepted

**Context:** Need a fast, modern testing framework.

**Decision:** Use Vitest as the primary testing framework.

**Consequences:**
- Fast test execution
- Native ESM support
- Jest compatibility
- Built-in coverage reporting

## Performance Considerations

### 1. Caching Strategy
- Cache provider responses to reduce API calls
- Use in-memory cache for frequently accessed data
- Implement cache invalidation on rotation events
- Consider distributed caching for multi-instance deployments

### 2. Database Optimization
- Use connection pooling
- Implement proper indexing
- Consider read replicas for read-heavy workloads
- Use pagination for large result sets

### 3. Network Optimization
- Use connection reuse for external APIs
- Implement request batching where appropriate
- Use compression for large payloads
- Consider CDN for static assets

## Scalability Patterns

### 1. Horizontal Scaling
- Stateless service design
- Shared storage for state
- Load balancing across instances
- Auto-scaling based on metrics

### 2. Vertical Scaling
- Optimize memory usage
- Use efficient data structures
- Profile and optimize hot paths
- Consider garbage collection impact

### 3. Data Partitioning
- Partition by secret ID for parallel processing
- Use consistent hashing for distribution
- Consider geographic partitioning for latency
- Implement cross-partition consistency when needed

---

**Related Skills**: [Code Generation](../code-generation/SKILL.md), [Security](../security/SKILL.md), [DevOps](../devops/SKILL.md)
