# Code Generation Skills

This skill set focuses on generating production-ready TypeScript code for the Secret Rotation Kit project.

## Capabilities

### 1. TypeScript Implementation
- Write type-safe code following strict TypeScript guidelines
- Implement proper error handling with custom error classes
- Create reusable utilities and helper functions
- Follow established patterns from existing codebase

### 2. API Design
- Design intuitive and consistent APIs
- Implement proper input validation and sanitization
- Create comprehensive type definitions
- Document function signatures with JSDoc

### 3. Provider Implementation
- Implement AWS Secrets Manager provider
- Implement GCP Secret Manager provider
- Implement HashiCorp Vault provider
- Create provider factory pattern

### 4. Core Services
- Implement KeyRotator service
- Implement PropagationVerifier service
- Implement KeyWindowManager service
- Implement RotationScheduler service

### 5. Event System
- Design event-driven architecture
- Implement event emitters and listeners
- Create typed event payloads
- Handle event ordering and deduplication

## Best Practices

1. **Type Safety First**: Always use proper TypeScript types, avoid `any`
2. **Error Boundaries**: Implement comprehensive error handling at all layers
3. **Logging**: Use structured logging with correlation IDs
4. **Testing**: Write testable code with dependency injection
5. **Documentation**: Include inline documentation for complex logic

## Code Standards

- Use ES modules (ESM) with CommonJS fallback
- Follow functional programming patterns where appropriate
- Prefer immutability and pure functions
- Use async/await for asynchronous operations
- Implement proper resource cleanup with finally blocks

## Example Patterns

```typescript
// Error handling pattern
export class RotationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RotationError';
  }
}

// Provider interface pattern
export interface SecretProvider {
  rotate(secretId: string, options?: RotationOptions): Promise<RotationResult>;
  verify(secretId: string): Promise<VerificationResult>;
}
```

---

**Related Skills**: [Testing](../testing/SKILL.md), [Security](../security/SKILL.md), [Architecture](../architecture/SKILL.md)
