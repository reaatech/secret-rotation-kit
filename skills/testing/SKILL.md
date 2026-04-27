# Testing Skills

This skill set focuses on comprehensive testing strategies for the Secret Rotation Kit project.

## Capabilities

### 1. Unit Testing
- Write isolated unit tests with Vitest
- Mock external dependencies and providers
- Test edge cases and error scenarios
- Achieve high code coverage (>95%)

### 2. Integration Testing
- Test provider integrations (AWS, GCP, Vault)
- Test database and cache interactions
- Test event system and message queues
- Test API endpoints and sidecar server

### 3. End-to-End Testing
- Test complete rotation workflows
- Test multi-provider scenarios
- Test failure and recovery scenarios
- Test zero-downtime guarantees

### 4. Performance Testing
- Load testing for high-volume rotations
- Stress testing for concurrent operations
- Latency measurements for critical paths
- Resource usage monitoring

### 5. Security Testing
- Test encryption and decryption flows
- Test access control and permissions
- Test audit logging completeness
- Test secret leakage prevention

## Testing Framework

- **Test Runner**: Vitest
- **Assertions**: Vitest built-in assertions
- **Mocking**: Vitest mocking utilities
- **Coverage**: Vitest coverage with c8
- **E2E Testing**: Playwright or custom test harness

## Test Organization

```
src/
  __tests__/
    unit/
      services/
      providers/
      utils/
    integration/
      providers/
      database/
    e2e/
      rotation-workflows/
      multi-provider/
```

## Best Practices

1. **Test Isolation**: Each test should be independent and runnable in any order
2. **Descriptive Names**: Test names should describe the expected behavior
3. **Arrange-Act-Assert**: Follow the AAA pattern for test structure
4. **Test Data**: Use factories and fixtures for test data generation
5. **Cleanup**: Properly clean up resources after each test

## Example Test Structure

```typescript
describe('KeyRotator', () => {
  describe('rotate()', () => {
    it('should create new key version', async () => {
      // Arrange
      const rotator = new KeyRotator(mockProvider);
      
      // Act
      const result = await rotator.rotate('test-secret');
      
      // Assert
      expect(result.success).toBe(true);
      expect(result.newVersion).toBeDefined();
    });

    it('should handle provider errors gracefully', async () => {
      // Arrange
      mockProvider.rotate.mockRejectedValue(new Error('API Error'));
      const rotator = new KeyRotator(mockProvider);
      
      // Act & Assert
      await expect(rotator.rotate('test-secret'))
        .rejects
        .toThrow(RotationError);
    });
  });
});
```

## CI/CD Integration

- Run tests on every pull request
- Require passing tests before merge
- Generate coverage reports
- Run security scans on dependencies

---

**Related Skills**: [Code Generation](../code-generation/SKILL.md), [Security](../security/SKILL.md), [DevOps](../devops/SKILL.md)
