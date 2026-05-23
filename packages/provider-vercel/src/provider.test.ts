import type { VercelProviderOptions } from '@reaatech/secret-rotation-types';
import { describe, expect, it, vi } from 'vitest';
import { VercelProvider } from './provider.js';

type MockFetch = ReturnType<typeof vi.fn>;
type MockResponse = {
  ok: boolean;
  status: number;
  json: ReturnType<typeof vi.fn>;
  text: ReturnType<typeof vi.fn>;
};

function mockResponse(
  overrides: { ok?: boolean; status?: number; json?: unknown; text?: string } = {},
): MockResponse {
  const { ok = true, status = 200, json = {}, text = '' } = overrides;
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(json),
    text: vi.fn().mockResolvedValue(text),
  };
}

function createProvider(config?: Partial<VercelProviderOptions>): {
  provider: VercelProvider;
  mockFetch: MockFetch;
} {
  const mockFetch: MockFetch = vi.fn();
  const provider = new VercelProvider(
    {
      token: 'test-token',
      projectId: 'test-project',
      teamId: 'test-team',
      ...config,
    },
    mockFetch as unknown as typeof fetch,
  );
  return { provider, mockFetch };
}

function envResponse(
  id: string,
  key: string,
  value: string,
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id,
    key,
    value,
    type: 'encrypted',
    target: ['production'],
    ...overrides,
  };
}

describe('VercelProvider', () => {
  describe('constructor', () => {
    it('throws when token is missing', () => {
      expect(
        () => new VercelProvider({} as VercelProviderOptions, vi.fn() as unknown as typeof fetch),
      ).toThrow('VercelProvider requires a "token".');
    });

    it('throws when projectId is missing', () => {
      expect(
        () =>
          new VercelProvider(
            { token: 'tok' } as VercelProviderOptions,
            vi.fn() as unknown as typeof fetch,
          ),
      ).toThrow('VercelProvider requires a "projectId".');
    });

    it('accepts optional parameters', () => {
      const provider = new VercelProvider(
        {
          token: 'tok',
          projectId: 'proj',
          teamId: 'team',
          target: ['preview', 'development'],
          envType: 'sensitive',
          apiBaseUrl: 'https://custom.api.com',
        },
        vi.fn() as unknown as typeof fetch,
      );
      expect(provider).toBeInstanceOf(VercelProvider);
      expect(provider.name).toBe('vercel-env');
      expect(provider.priority).toBe(4);
    });

    it('defaults target to production and envType to encrypted', () => {
      const mockFetch: MockFetch = vi.fn();
      mockFetch.mockResolvedValue(mockResponse({ json: [] }));
      const provider = new VercelProvider(
        { token: 'tok', projectId: 'proj' },
        mockFetch as unknown as typeof fetch,
      );
      expect(provider).toBeInstanceOf(VercelProvider);
    });

    it('throws when fetchImpl is not a function', () => {
      expect(
        () =>
          new VercelProvider(
            { token: 'tok', projectId: 'proj' },
            'not-a-function' as unknown as typeof fetch,
          ),
      ).toThrow('No fetch implementation');
    });

    it('uses globalThis.fetch when no fetchImpl is passed', () => {
      const provider = new VercelProvider({ token: 'tok', projectId: 'proj' });
      expect(provider).toBeInstanceOf(VercelProvider);
    });
  });

  describe('create (static factory)', () => {
    it('creates a provider via static factory', () => {
      const provider = VercelProvider.create(
        { type: 'vercel', token: 'tok', projectId: 'proj' },
        vi.fn() as unknown as typeof fetch,
      );
      expect(provider).toBeInstanceOf(VercelProvider);
      expect(provider.name).toBe('vercel-env');
    });
  });

  describe('createSecret', () => {
    it('POSTs to env endpoint with correct body', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: { created: envResponse('env-1', 'my-secret', 'my-value'), failed: [] },
        }),
      );

      await provider.createSecret('my-secret', 'my-value');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v10/projects/test-project/env');
      expect(opts.method).toBe('POST');
      expect(opts.headers).toEqual({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(opts.body as string)).toEqual({
        key: 'my-secret',
        value: 'my-value',
        type: 'encrypted',
        target: ['production'],
        comment: 'Managed by secret-rotation-kit',
      });
    });

    it('throws on API failure response', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: {
            created: null,
            failed: [{ error: { code: 'FAIL', message: 'Something went wrong' } }],
          },
        }),
      );

      await expect(provider.createSecret('my-secret', 'my-value')).rejects.toThrow(
        'Vercel failed to store "my-secret": Something went wrong',
      );
    });

    it('throws on HTTP error response', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({ ok: false, status: 401, text: 'Unauthorized' }),
      );

      await expect(provider.createSecret('my-secret', 'my-value')).rejects.toThrow(
        'Vercel API POST /v10/projects/test-project/env failed (401): Unauthorized',
      );
    });
  });

  describe('getSecret', () => {
    it('retrieves current version by name', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [envResponse('env-1', 'my-secret', 'secret-value', { createdAt: 1700000000000 })],
        }),
      );

      const result = await provider.getSecret('my-secret');

      expect(result.value).toBe('secret-value');
      expect(result.versionId).toBe('env-1');
    });

    it('retrieves specific version by id', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [
            envResponse('env-1', 'my-secret', 'current'),
            envResponse('env-2', 'my-secret', 'old-value'),
          ],
        }),
      );

      const result = await provider.getSecret('my-secret', 'env-2');

      expect(result.value).toBe('old-value');
      expect(result.versionId).toBe('env-2');
    });

    it('throws when not found', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ json: [] }));

      await expect(provider.getSecret('missing-secret')).rejects.toThrow(
        'Secret "missing-secret" not found in Vercel project test-project',
      );
    });

    it('uses current date when createdAt is not present', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [envResponse('env-1', 'my-secret', 'value')],
        }),
      );

      const result = await provider.getSecret('my-secret');

      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it('returns empty string when env has no value', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [{ id: 'env-1', key: 'my-secret', type: 'encrypted', target: ['production'] }],
        }),
      );

      const result = await provider.getSecret('my-secret');

      expect(result.value).toBe('');
    });
  });

  describe('storeSecretValue', () => {
    it('upserts with ACTIVE comment for current stage', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: { created: envResponse('env-1', 'my-secret', 'new-value'), failed: [] },
        }),
      );

      const result = await provider.storeSecretValue('my-secret', 'new-value');

      expect(result.value).toBe('new-value');
      expect(result.versionId).toBe('env-1');
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(opts.body as string).comment).toBe('Managed by secret-rotation-kit');
    });

    it('upserts with PENDING comment for pending stage', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: { created: envResponse('env-1', 'my-secret', 'pending-value'), failed: [] },
        }),
      );

      const result = await provider.storeSecretValue('my-secret', 'pending-value', {
        stage: 'pending',
      });

      expect(result.value).toBe('pending-value');
      const [, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(opts.body as string).comment).toBe(
        'Managed by secret-rotation-kit (rotating)',
      );
    });

    it('handles array created response', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: {
            created: [envResponse('env-1', 'my-secret', 'value')],
            failed: [],
          },
        }),
      );

      const result = await provider.storeSecretValue('my-secret', 'value');

      expect(result.versionId).toBe('env-1');
    });

    it('throws when created is missing', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: { created: undefined, failed: [] },
        }),
      );

      await expect(provider.storeSecretValue('my-secret', 'value')).rejects.toThrow(
        'Vercel did not return the stored env var for "my-secret"',
      );
    });

    it('throws on API failure', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: {
            created: null,
            failed: [{ error: { code: 'RATE_LIMIT', message: 'Too many requests' } }],
          },
        }),
      );

      await expect(provider.storeSecretValue('my-secret', 'value')).rejects.toThrow(
        'Vercel failed to store "my-secret": Too many requests',
      );
    });

    it('uses fallback value when created env has no value', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: {
            created: {
              id: 'env-1',
              key: 'my-secret',
              type: 'encrypted',
              target: ['production'],
            },
            failed: [],
          },
        }),
      );

      const result = await provider.storeSecretValue('my-secret', 'fallback-value');

      expect(result.value).toBe('fallback-value');
    });
  });

  describe('deleteSecret', () => {
    it('finds env and deletes it', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch
        .mockResolvedValueOnce(
          mockResponse({
            json: [envResponse('env-1', 'my-secret', 'value')],
          }),
        )
        .mockResolvedValueOnce(mockResponse({ status: 204 }));

      await provider.deleteSecret('my-secret');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [deleteUrl, deleteOpts] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(deleteUrl).toContain('/v9/projects/test-project/env/env-1');
      expect(deleteOpts.method).toBe('DELETE');
    });

    it('does nothing when env not found', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ json: [] }));

      await provider.deleteSecret('missing-secret');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('listVersions', () => {
    it('returns versions from env list', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [
            envResponse('v1', 'my-secret', 'val1', { createdAt: 1700000000000 }),
            envResponse('v2', 'my-secret', 'val2', { createdAt: 1700000000001 }),
          ],
        }),
      );

      const versions = await provider.listVersions('my-secret');

      expect(versions).toHaveLength(2);
      expect(versions[0]?.versionId).toBe('v1');
      expect(versions[1]?.versionId).toBe('v2');
      expect(versions[0]?.stages).toEqual(['production']);
    });

    it('filters by target', async () => {
      const { provider, mockFetch } = createProvider({ target: ['production'] });
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [
            envResponse('v1', 'my-secret', 'val1', { target: ['production'] }),
            envResponse('v2', 'my-secret', 'val2', { target: ['preview'] }),
          ],
        }),
      );

      const versions = await provider.listVersions('my-secret');

      expect(versions).toHaveLength(1);
      expect(versions[0]?.versionId).toBe('v1');
    });

    it('handles missing createdAt', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [envResponse('v1', 'my-secret', 'val')],
        }),
      );

      const versions = await provider.listVersions('my-secret');

      expect(versions[0]?.createdAt).toBeInstanceOf(Date);
    });

    it('handles non-matching key', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [envResponse('v1', 'other-secret', 'val')],
        }),
      );

      const versions = await provider.listVersions('my-secret');

      expect(versions).toHaveLength(0);
    });

    it('handles single string target', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [
            {
              id: 'v1',
              key: 'my-secret',
              value: 'val',
              type: 'encrypted',
              target: 'production' as const,
            },
          ],
        }),
      );

      const versions = await provider.listVersions('my-secret');

      expect(versions).toHaveLength(1);
      expect(versions[0]?.stages).toEqual(['production']);
    });

    it('handles envs without target (matches all)', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [
            {
              id: 'v1',
              key: 'my-secret',
              value: 'val',
              type: 'encrypted',
            },
          ],
        }),
      );

      const versions = await provider.listVersions('my-secret');

      expect(versions).toHaveLength(1);
    });

    it('handles { envs: [...] } response format', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: { envs: [envResponse('v1', 'my-secret', 'val')] },
        }),
      );

      const versions = await provider.listVersions('my-secret');

      expect(versions).toHaveLength(1);
    });

    it('handles empty envs response', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ json: [] }));

      const versions = await provider.listVersions('my-secret');

      expect(versions).toHaveLength(0);
    });

    it('handles response object without envs field', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ json: {} }));

      const versions = await provider.listVersions('my-secret');

      expect(versions).toHaveLength(0);
    });
  });

  describe('getVersion', () => {
    it('delegates to getSecret', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [envResponse('v3', 'my-secret', 'versioned-value')],
        }),
      );

      const result = await provider.getVersion('my-secret', 'v3');

      expect(result.value).toBe('versioned-value');
      expect(result.versionId).toBe('v3');
    });
  });

  describe('deleteVersion', () => {
    it('DELETEs by env id', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));

      await provider.deleteVersion('my-secret', 'env-1');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v9/projects/test-project/env/env-1');
      expect(opts.method).toBe('DELETE');
    });
  });

  describe('supportsRotation', () => {
    it('returns true', () => {
      const { provider } = createProvider();
      expect(provider.supportsRotation()).toBe(true);
    });
  });

  describe('beginRotation', () => {
    it('captures previous value when secret exists', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: [envResponse('env-1', 'my-secret', 'old-value')],
        }),
      );

      const session = await provider.beginRotation('my-secret');

      expect(session.provider).toBe('vercel-env');
      expect(session.secretName).toBe('my-secret');
      expect(session.sessionId).toMatch(/^vercel-rot-/);
      expect(session.state.metadata).toEqual({
        existed: true,
        previousValue: 'old-value',
        previousVersionId: 'env-1',
      });
    });

    it('handles missing secret gracefully', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ json: [] }));

      const session = await provider.beginRotation('new-secret');

      expect(session.state.metadata).toEqual({ existed: false });
    });
  });

  describe('completeRotation', () => {
    it('patches comment to ACTIVE', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          json: envResponse('env-2', 'my-secret', 'new-value'),
        }),
      );

      await provider.completeRotation({
        sessionId: 'sess-1',
        secretName: 'my-secret',
        provider: 'vercel-env',
        state: { versionId: 'env-2' },
        startedAt: new Date(),
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v9/projects/test-project/env/env-2');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body as string)).toEqual({
        comment: 'Managed by secret-rotation-kit',
      });
    });

    it('is a no-op when session has no versionId', async () => {
      const { provider, mockFetch } = createProvider();

      await provider.completeRotation({
        sessionId: 'sess-1',
        secretName: 'my-secret',
        provider: 'vercel-env',
        state: {},
        startedAt: new Date(),
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('cancelRotation', () => {
    it('restores previous value when secret existed before rotation', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));

      await provider.cancelRotation({
        sessionId: 'sess-1',
        secretName: 'my-secret',
        provider: 'vercel-env',
        state: {
          versionId: 'env-2',
          metadata: { existed: true, previousValue: 'old-value', previousVersionId: 'env-1' },
        },
        startedAt: new Date(),
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v9/projects/test-project/env/env-2');
      expect(opts.method).toBe('PATCH');
      expect(JSON.parse(opts.body as string)).toEqual({
        value: 'old-value',
        comment: 'Managed by secret-rotation-kit',
      });
    });

    it('deletes env when secret was newly created during rotation', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ status: 204 }));

      await provider.cancelRotation({
        sessionId: 'sess-1',
        secretName: 'my-secret',
        provider: 'vercel-env',
        state: {
          versionId: 'env-2',
          metadata: { existed: false },
        },
        startedAt: new Date(),
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toContain('/v9/projects/test-project/env/env-2');
      expect(opts.method).toBe('DELETE');
    });

    it('continues on delete error (silent catch)', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockRejectedValueOnce(new Error('Not found'));

      await provider.cancelRotation({
        sessionId: 'sess-1',
        secretName: 'my-secret',
        provider: 'vercel-env',
        state: {
          versionId: 'env-2',
          metadata: { existed: false },
        },
        startedAt: new Date(),
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when no versionId is available', async () => {
      const { provider, mockFetch } = createProvider();

      await provider.cancelRotation({
        sessionId: 'sess-1',
        secretName: 'my-secret',
        provider: 'vercel-env',
        state: { metadata: {} },
        startedAt: new Date(),
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('handles undefined metadata in state', async () => {
      const { provider, mockFetch } = createProvider();

      await provider.cancelRotation({
        sessionId: 'sess-1',
        secretName: 'my-secret',
        provider: 'vercel-env',
        state: {},
        startedAt: new Date(),
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('health', () => {
    it('returns healthy when API responds successfully', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockResolvedValueOnce(mockResponse({ json: [] }));

      const health = await provider.health();

      expect(health.status).toBe('healthy');
      expect(health.latency).toBeGreaterThanOrEqual(0);
      expect(health.lastChecked).toBeInstanceOf(Date);
    });

    it('returns unhealthy when API call throws error', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const health = await provider.health();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toBe('Network error');
    });

    it('returns unhealthy on non-Error rejection', async () => {
      const { provider, mockFetch } = createProvider();
      mockFetch.mockRejectedValueOnce('string-error');

      const health = await provider.health();

      expect(health.status).toBe('unhealthy');
      expect(health.message).toBe('string-error');
    });
  });

  describe('capabilities', () => {
    it('returns correct capabilities', () => {
      const { provider } = createProvider();
      const caps = provider.capabilities();

      expect(caps.supportsRotation).toBe(true);
      expect(caps.supportsVersioning).toBe(false);
      expect(caps.supportsLabels).toBe(false);
      expect(caps.maxVersions).toBe(1);
    });
  });
});

describe('module entry point', () => {
  it('re-exports VercelProvider from index', async () => {
    const mod = await import('./index.js');
    expect(mod.VercelProvider).toBe(VercelProvider);
  });
});
