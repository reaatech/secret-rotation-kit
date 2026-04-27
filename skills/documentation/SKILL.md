# Documentation Skills

This skill set focuses on technical writing and documentation for the Secret Rotation Kit project.

## Capabilities

### 1. API Documentation
- Write comprehensive API reference documentation
- Document all public interfaces and types
- Provide usage examples for each API
- Maintain JSDoc comments in source code

### 2. User Guides
- Create getting started guides
- Write configuration tutorials
- Document common use cases and patterns
- Provide troubleshooting guides

### 3. Architecture Documentation
- Document system architecture and design decisions
- Create sequence diagrams for complex workflows
- Document data flow and state management
- Maintain ADR (Architecture Decision Records)

### 4. Code Comments
- Write meaningful inline comments
- Document complex algorithms and logic
- Explain non-obvious design decisions
- Keep comments up-to-date with code changes

### 5. Release Documentation
- Write release notes and changelogs
- Document breaking changes and migration guides
- Create upgrade guides for new versions
- Maintain version compatibility matrix

## Documentation Standards

### Writing Style
- Use clear, concise language
- Write in active voice
- Include code examples for all concepts
- Use consistent terminology throughout

### Formatting
- Use Markdown for all documentation
- Follow consistent heading hierarchy
- Include tables for configuration options
- Use code blocks with syntax highlighting

### Structure
```
docs/
  getting-started.md
  configuration.md
  providers/
    aws.md
    gcp.md
    vault.md
  guides/
    zero-downtime-rotation.md
    propagation-verification.md
    monitoring-and-alerting.md
  api-reference/
    classes/
    interfaces/
    types/
  troubleshooting.md
```

## Best Practices

1. **Audience Awareness**: Write for the intended audience (beginners vs. experts)
2. **Examples First**: Provide working examples before detailed explanations
3. **Cross-Reference**: Link to related documentation
4. **Keep Updated**: Review and update documentation with each release
5. **Visual Aids**: Use diagrams and flowcharts for complex concepts

## Documentation Checklist

Before marking documentation as complete:

- [ ] All public APIs are documented
- [ ] Code examples are tested and working
- [ ] Links are valid and point to correct locations
- [ ] Spelling and grammar are correct
- [ ] Terminology is consistent
- [ ] Screenshots/diagrams are clear and labeled
- [ ] Configuration options are fully documented
- [ ] Error messages are explained
- [ ] Migration paths are provided for breaking changes

## Example Documentation Format

```markdown
# KeyRotator

The `KeyRotator` class manages the core rotation logic for secrets.

## Constructor

```typescript
constructor(provider: SecretProvider, config: RotationConfig)
```

### Parameters

- `provider` - The secret provider implementation
- `config` - Configuration options for rotation

### Example

```typescript
const rotator = new KeyRotator(awsProvider, {
  overlapPeriod: 300000,
  verificationStrategy: 'hybrid'
});
```

## Methods

### rotate(secretId)

Initiates a rotation for the specified secret.

**Parameters:**
- `secretId` - The identifier of the secret to rotate

**Returns:** `Promise<RotationResult>`

**Throws:** `RotationError` if rotation fails
```

---

**Related Skills**: [Code Generation](../code-generation/SKILL.md), [Architecture](../architecture/SKILL.md)
