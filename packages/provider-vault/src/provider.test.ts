import { describe, expect, it, vi } from 'vitest';
import { VaultProvider } from './provider.js';

function createClient() {
  return {
    read: vi.fn(),
    write: vi.fn(),
    delete: vi.fn(),
    list: vi.fn(),
  };
}

function createProvider(mountPath = 'secret'): {
  provider: VaultProvider;
  client: ReturnType<typeof createClient>;
} {
  const client = createClient();

  const provider = new VaultProvider(
    {
      type: 'vault',
      url: 'http://localhost:8200',
      mountPath,
      authMethod: 'token',
    },
    client,
  );

  return { provider, client };
}

describe('VaultProvider.create', () => {
  it('creates a provider from a pre-built client', () => {
    const client = createClient();
    const provider = VaultProvider.create(
      {
        type: 'vault',
        url: 'http://localhost:8200',
        mountPath: 'secret',
        token: 'root',
      },
      client,
    );
    expect(provider.name).toBe('vault');
    expect(provider.priority).toBe(3);
  });
});

describe('VaultProvider', () => {
  describe('createSecret', () => {
    it('writes to vault', async () => {
      const { provider, client } = createProvider();
      client.write.mockResolvedValueOnce({});

      await provider.createSecret('test-secret', 'secret-value');

      expect(client.write).toHaveBeenCalledWith('secret/data/test-secret', {
        data: { value: 'secret-value' },
      });
    });
  });

  describe('getSecret', () => {
    it('retrieves current version', async () => {
      const { provider, client } = createProvider();
      client.read.mockResolvedValueOnce({
        data: {
          data: { value: 'secret-value' },
          metadata: { version: 1, created_time: '2024-01-01T00:00:00Z' },
        },
      });

      const result = await provider.getSecret('test-secret');

      expect(result.value).toBe('secret-value');
      expect(result.versionId).toBe('1');
    });

    it('uses current date when metadata lacks created_time', async () => {
      const { provider, client } = createProvider();
      client.read.mockResolvedValueOnce({
        data: {
          data: { value: 'secret-value' },
          metadata: { version: 1 },
        },
      });

      const before = Date.now();
      const result = await provider.getSecret('test-secret');
      const after = Date.now();

      expect(result.value).toBe('secret-value');
      expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.createdAt.getTime()).toBeLessThanOrEqual(after);
    });

    it('retrieves specific version', async () => {
      const { provider, client } = createProvider();
      client.read.mockResolvedValueOnce({
        data: {
          data: { value: 'old-value' },
          metadata: { version: 1, created_time: '2024-01-01T00:00:00Z' },
        },
      });

      const result = await provider.getSecret('test-secret', '1');

      expect(client.read).toHaveBeenCalledWith('secret/data/test-secret?version=1');
      expect(result.value).toBe('old-value');
    });
  });

  describe('storeSecretValue', () => {
    it('writes a new version', async () => {
      const { provider, client } = createProvider();
      client.write.mockResolvedValueOnce({
        data: { version: 2, created_time: '2024-01-02T00:00:00Z' },
      });

      const result = await provider.storeSecretValue('test-secret', 'new-value');

      expect(result.versionId).toBe('2');
      expect(result.value).toBe('new-value');
    });

    it('handles missing version and created_time in response', async () => {
      const { provider, client } = createProvider();
      client.write.mockResolvedValueOnce({ data: {} });

      const result = await provider.storeSecretValue('test-secret', 'new-value');

      expect(result.versionId).toBe('');
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('deleteSecret', () => {
    it('soft deletes by default', async () => {
      const { provider, client } = createProvider();
      client.delete.mockResolvedValueOnce({});

      await provider.deleteSecret('test-secret');

      expect(client.delete).toHaveBeenCalledWith('secret/data/test-secret');
    });

    it('permanently deletes metadata when permanent is true', async () => {
      const { provider, client } = createProvider();
      client.delete.mockResolvedValueOnce({});

      await provider.deleteSecret('test-secret', { permanent: true });

      expect(client.delete).toHaveBeenCalledWith('secret/metadata/test-secret');
    });
  });

  describe('listVersions', () => {
    it('returns versions from metadata', async () => {
      const { provider, client } = createProvider();
      client.read.mockResolvedValueOnce({
        data: {
          versions: {
            '1': { created_time: '2024-01-01T00:00:00Z', destroyed: false },
            '2': { created_time: '2024-01-02T00:00:00Z', destroyed: true },
          },
        },
      });

      const versions = await provider.listVersions('test-secret');

      expect(versions).toHaveLength(2);
      expect(versions[0]?.versionId).toBe('1');
      expect(versions[1]?.stages).toEqual(['destroyed']);
    });

    it('returns empty array when metadata has no versions', async () => {
      const { provider, client } = createProvider();
      client.read.mockResolvedValueOnce({
        data: {},
      });

      const versions = await provider.listVersions('test-secret');

      expect(versions).toEqual([]);
    });

    it('handles versions without created_time', async () => {
      const { provider, client } = createProvider();
      client.read.mockResolvedValueOnce({
        data: {
          versions: {
            '1': { destroyed: false },
          },
        },
      });

      const versions = await provider.listVersions('test-secret');

      expect(versions).toHaveLength(1);
      expect(versions[0]?.createdAt).toBeInstanceOf(Date);
    });

    it('returns empty array on error', async () => {
      const { provider, client } = createProvider();
      client.read.mockRejectedValueOnce(new Error('not found'));

      const versions = await provider.listVersions('test-secret');

      expect(versions).toEqual([]);
    });
  });

  describe('getVersion', () => {
    it('delegates to getSecret with version', async () => {
      const { provider, client } = createProvider();
      client.read.mockResolvedValueOnce({
        data: {
          data: { value: 'versioned-value' },
          metadata: { version: 3, created_time: '2024-01-01T00:00:00Z' },
        },
      });

      const result = await provider.getVersion('test-secret', '3');

      expect(client.read).toHaveBeenCalledWith('secret/data/test-secret?version=3');
      expect(result.value).toBe('versioned-value');
      expect(result.versionId).toBe('3');
    });
  });

  describe('deleteVersion', () => {
    it('deletes specific version', async () => {
      const { provider, client } = createProvider();
      client.delete.mockResolvedValueOnce({});

      await provider.deleteVersion('test-secret', '1');

      expect(client.delete).toHaveBeenCalledWith('secret/data/test-secret?version=1');
    });
  });

  describe('rotation', () => {
    it('begins rotation without writing to Vault', async () => {
      const { provider, client } = createProvider();

      const session = await provider.beginRotation('test-secret');

      expect(session.provider).toBe('vault');
      expect(session.sessionId).toMatch(/^vault-rot-/);
      expect(session.state.versionId).toBeUndefined();
      expect(client.write).not.toHaveBeenCalled();
    });

    it('completes rotation is a no-op', async () => {
      const { provider, client } = createProvider();

      await provider.completeRotation({
        sessionId: '2',
        secretName: 'test-secret',
        provider: 'vault',
        state: { versionId: '2' },
        startedAt: new Date(),
      });

      expect(client.write).not.toHaveBeenCalled();
      expect(client.read).not.toHaveBeenCalled();
    });

    it('cancels rotation by deleting version', async () => {
      const { provider, client } = createProvider();
      client.delete.mockResolvedValueOnce({});

      await provider.cancelRotation({
        sessionId: '2',
        secretName: 'test-secret',
        provider: 'vault',
        state: { versionId: '2' },
        startedAt: new Date(),
      });

      expect(client.delete).toHaveBeenCalledWith('secret/data/test-secret?version=2');
    });

    it('continues cancelRotation when deleteVersion throws', async () => {
      const { provider, client } = createProvider();
      client.delete.mockRejectedValueOnce(new Error('not found'));

      await provider.cancelRotation({
        sessionId: '2',
        secretName: 'test-secret',
        provider: 'vault',
        state: { versionId: '2' },
        startedAt: new Date(),
      });

      expect(client.delete).toHaveBeenCalledWith('secret/data/test-secret?version=2');
    });

    it('cancelRotation is a no-op when no versionId was assigned', async () => {
      const { provider, client } = createProvider();

      await provider.cancelRotation({
        sessionId: 'vault-rot-x',
        secretName: 'test-secret',
        provider: 'vault',
        state: {},
        startedAt: new Date(),
      });

      expect(client.delete).not.toHaveBeenCalled();
    });
  });

  describe('health', () => {
    it('returns healthy on success', async () => {
      const { provider, client } = createProvider();
      client.read.mockResolvedValueOnce({ data: { status: 'ok' } });

      const health = await provider.health();

      expect(health.status).toBe('healthy');
    });

    it('returns degraded on error', async () => {
      const { provider, client } = createProvider();
      client.read.mockRejectedValueOnce(new Error('sealed'));

      const health = await provider.health();

      expect(health.status).toBe('degraded');
    });

    it('returns degraded on non-Error rejection', async () => {
      const { provider, client } = createProvider();
      client.read.mockRejectedValueOnce('string-error');

      const health = await provider.health();

      expect(health.status).toBe('degraded');
    });
  });

  describe('capabilities', () => {
    it('advertises rotation and versioning', () => {
      const { provider } = createProvider();
      const caps = provider.capabilities();

      expect(caps.supportsRotation).toBe(true);
      expect(caps.supportsVersioning).toBe(true);
    });
  });

  describe('supportsRotation', () => {
    it('returns true', () => {
      const { provider } = createProvider();
      expect(provider.supportsRotation()).toBe(true);
    });
  });

  describe('constructor with token', () => {
    it('passes token when token is provided in config', () => {
      const _provider = new VaultProvider({
        type: 'vault',
        url: 'http://localhost:8200',
        mountPath: 'secret',
        token: 'test-token',
      });
      expect(_provider).toBeInstanceOf(VaultProvider);
    });

    it('throws when no credentials are provided', () => {
      expect(
        () =>
          new VaultProvider({
            type: 'vault',
            url: 'http://localhost:8200',
            mountPath: 'secret',
          }),
      ).toThrow("Vault provider requires either 'token' or 'roleId' + 'secretId'");
    });
  });

  describe('mount path normalization', () => {
    it('strips leading and trailing slashes', async () => {
      const { provider, client } = createProvider('/custom/vault/path/');
      client.write.mockResolvedValueOnce({});

      await provider.createSecret('test-secret', 'value');

      expect(client.write).toHaveBeenCalledWith('custom/vault/path/data/test-secret', {
        data: { value: 'value' },
      });
    });
  });
});
