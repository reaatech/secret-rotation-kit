import type { SecretProvider } from '@reaatech/secret-rotation-types';
import type { Consumer } from '@reaatech/secret-rotation-types';
import { describe, expect, it, vi } from 'vitest';
import { ActivePropagationVerifier } from './active-verifier.js';
import { ConsumerRegistry } from './consumer-registry.js';

function createMockFetch(
  responders: Record<string, (url: string) => { status: number; body: unknown }>,
) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const responder = responders[url];
    if (!responder) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      } as Response;
    }
    const { status, body } = responder(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
}

function createMockProvider(): SecretProvider {
  return {
    name: 'mock',
    priority: 1,
    createSecret: vi.fn(),
    getSecret: vi.fn(),
    storeSecretValue: vi.fn(),
    deleteSecret: vi.fn(),
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    deleteVersion: vi.fn(),
    supportsRotation: vi.fn(() => true),
    beginRotation: vi.fn(),
    completeRotation: vi.fn(),
    cancelRotation: vi.fn(),
    health: vi.fn(),
    capabilities: vi.fn(() => ({
      supportsRotation: true,
      supportsVersioning: true,
      supportsLabels: false,
    })),
  };
}

function createConsumer(id: string, version?: string): Consumer {
  return {
    id,
    endpoint: `https://consumer.example.com/${id}`,
    interestedSecrets: ['test-secret'],
    capabilities: {
      supportsVersionCheck: true,
      supportsHealthCheck: false,
      supportsCallback: false,
    },
    ...(version !== undefined && { version }),
  } as Consumer & { version?: string };
}

describe('ActivePropagationVerifier', () => {
  const session = {
    sessionId: 'sess-1',
    secretName: 'test-secret',
    provider: 'mock',
    state: { versionId: 'v2' },
    startedAt: new Date(),
  };

  it('succeeds when all consumers verify', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry();
    await registry.register(createConsumer('c1'));
    await registry.register(createConsumer('c2'));

    const mockFetch = createMockFetch({
      'https://consumer.example.com/c1/secret/test-secret/version': () => ({
        status: 200,
        body: { version: 'v2' },
      }),
      'https://consumer.example.com/c2/secret/test-secret/version': () => ({
        status: 200,
        body: { version: 'v2' },
      }),
    });

    const verifier = new ActivePropagationVerifier(provider, registry, {
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    const result = await verifier.verify(session, { timeout: 5000 });

    expect(result.success).toBe(true);
    expect(result.consumerCount).toBe(2);
    expect(result.verifiedCount).toBe(2);
    expect(result.coverage).toBe(1);
  });

  it('returns success with no consumers (empty consumer list)', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry();

    const verifier = new ActivePropagationVerifier(provider, registry);
    const result = await verifier.verify(session, { timeout: 5000 });

    expect(result.success).toBe(true);
    expect(result.consumerCount).toBe(0);
  });

  it('fails when coverage is below threshold', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry();
    await registry.register(createConsumer('c1'));
    await registry.register(createConsumer('c2'));

    const mockFetch = createMockFetch({
      'https://consumer.example.com/c1/secret/test-secret/version': () => ({
        status: 500,
        body: {},
      }),
      'https://consumer.example.com/c2/secret/test-secret/version': () => ({
        status: 500,
        body: {},
      }),
    });

    const verifier = new ActivePropagationVerifier(provider, registry, {
      retryPolicy: { maxRetries: 0, initialDelayMs: 0 },
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    const result = await verifier.verify(session, {
      timeout: 5000,
      minConsumerCoverage: 0.5,
    });

    expect(result.success).toBe(false);
    expect(result.failures).toHaveLength(2);
    expect(result.canRetry).toBe(true);
  });

  it('fails when consumer reports wrong version', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry();
    await registry.register(createConsumer('c1'));

    const mockFetch = createMockFetch({
      'https://consumer.example.com/c1/secret/test-secret/version': () => ({
        status: 200,
        body: { version: 'v1' },
      }),
    });

    const verifier = new ActivePropagationVerifier(provider, registry, {
      retryPolicy: { maxRetries: 0, initialDelayMs: 0 },
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    const result = await verifier.verify(session, {
      timeout: 5000,
      minConsumerCoverage: 0.5,
    });

    expect(result.success).toBe(false);
    expect(result.failures).toHaveLength(1);
  });

  it('succeeds with health check fallback', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry();
    const healthConsumer: Consumer = {
      id: 'hc1',
      endpoint: 'https://consumer.example.com/hc1',
      interestedSecrets: ['test-secret'],
      capabilities: {
        supportsVersionCheck: false,
        supportsHealthCheck: true,
        supportsCallback: false,
      },
    };
    await registry.register(healthConsumer);

    const mockFetch = createMockFetch({
      'https://consumer.example.com/hc1/health': () => ({
        status: 200,
        body: {},
      }),
    });

    const verifier = new ActivePropagationVerifier(provider, registry, {
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    const result = await verifier.verify(session, { timeout: 5000 });

    expect(result.success).toBe(true);
    expect(result.verifiedCount).toBe(1);
  });

  it('reports verification status', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry();
    await registry.register(createConsumer('c1'));

    const mockFetch = createMockFetch({
      'https://consumer.example.com/c1/secret/test-secret/version': () => ({
        status: 200,
        body: { version: 'v2' },
      }),
    });

    const verifier = new ActivePropagationVerifier(provider, registry, {
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    await verifier.verify(session, { timeout: 5000 });

    const status = await verifier.getVerificationStatus(session);
    expect(status.state).toBe('completed');
    expect(status.progress).toBe(1);
  });

  it('reports completed for non-existent sessions', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry();

    const verifier = new ActivePropagationVerifier(provider, registry);
    const nonExistentSession = { ...session, sessionId: 'nonexistent' };
    const status = await verifier.getVerificationStatus(nonExistentSession);

    expect(status.state).toBe('completed');
  });

  it('updates consumer health on success', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry();
    await registry.register(createConsumer('c1'));

    const mockFetch = createMockFetch({
      'https://consumer.example.com/c1/secret/test-secret/version': () => ({
        status: 200,
        body: { version: 'v2' },
      }),
    });

    const verifier = new ActivePropagationVerifier(provider, registry, {
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    await verifier.verify(session, { timeout: 5000 });

    const health = registry.getHealth('c1');
    expect(health?.status).toBe('healthy');
  });

  it('updates consumer health on failure', async () => {
    const provider = createMockProvider();
    const registry = new ConsumerRegistry({ maxFailures: 5 });
    await registry.register(createConsumer('c1'));

    const mockFetch = createMockFetch({
      'https://consumer.example.com/c1/secret/test-secret/version': () => ({
        status: 500,
        body: {},
      }),
    });

    const verifier = new ActivePropagationVerifier(provider, registry, {
      retryPolicy: { maxRetries: 0, initialDelayMs: 0 },
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });
    await verifier.verify(session, {
      timeout: 5000,
      minConsumerCoverage: 0,
    });

    const health = registry.getHealth('c1');
    expect(health?.failures).toBeGreaterThan(0);
  });
});
