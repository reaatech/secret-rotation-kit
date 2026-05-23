#!/usr/bin/env node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.SRK_PROVIDER = 'aws';
  process.env.SRK_AWS_REGION = 'us-east-1';
  process.env.SRK_HOST = '127.0.0.1';
});

vi.mock('@reaatech/secret-rotation-core', () => ({
  InMemoryEventEmitter: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    replay: vi.fn(),
  })),
  RotationManager: vi.fn(() => ({
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    rotate: vi.fn(),
    getState: vi.fn(),
  })),
}));

vi.mock('@reaatech/secret-rotation-observability', () => ({
  LoggerService: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  MetricsService: vi.fn(() => ({ counter: vi.fn(() => ({ inc: vi.fn() })), collect: vi.fn() })),
}));

vi.mock('@reaatech/secret-rotation-types', () => ({
  createProvider: vi.fn(() => ({})),
  registerProvider: vi.fn(),
}));

vi.mock('./server.js', () => ({
  SidecarServer: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    address: 'http://127.0.0.1:8080',
    listeningPort: 8080,
  })),
}));

vi.mock('@reaatech/secret-rotation-provider-aws', () => ({}));
vi.mock('@reaatech/secret-rotation-provider-gcp', () => ({}));
vi.mock('@reaatech/secret-rotation-provider-vault', () => ({}));
vi.mock('@reaatech/secret-rotation-provider-vercel', () => ({}));

vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

describe('requireEnv', () => {
  beforeEach(() => {
    process.env.REQUIRE_ENV_TEST_VAR = 'test-value';
  });

  afterEach(() => {
    delete process.env.REQUIRE_ENV_TEST_VAR;
  });

  it('returns the value when env var is set', async () => {
    const { requireEnv } = await import('./cli.js');
    expect(requireEnv('REQUIRE_ENV_TEST_VAR')).toBe('test-value');
  });

  it('throws when env var is missing', async () => {
    const { requireEnv } = await import('./cli.js');
    expect(() => requireEnv('REQUIRE_ENV_MISSING_VAR')).toThrow(
      'Missing required environment variable: REQUIRE_ENV_MISSING_VAR',
    );
  });
});

describe('buildProviderConfig', () => {
  beforeEach(() => {
    process.env.SRK_AWS_REGION = 'us-west-2';
    process.env.SRK_GCP_PROJECT_ID = 'my-gcp-project';
    process.env.SRK_VAULT_URL = 'http://vault:8200';
    process.env.SRK_VERCEL_TOKEN = 'vercel-token';
    process.env.SRK_VERCEL_PROJECT_ID = 'vercel-project';

    process.env.SRK_AWS_ENDPOINT = 'http://localhost:4566';
    process.env.SRK_GCP_ENDPOINT = 'http://localhost:8085';
    process.env.SRK_VAULT_TOKEN = 'root-token';
    process.env.SRK_VAULT_MOUNT = 'kv-v2';
    process.env.SRK_VERCEL_TEAM_ID = 'team_abc';
    process.env.SRK_VERCEL_TARGET = 'production,preview';
  });

  afterEach(() => {
    delete process.env.SRK_AWS_REGION;
    delete process.env.SRK_AWS_ENDPOINT;
    delete process.env.SRK_GCP_PROJECT_ID;
    delete process.env.SRK_GCP_ENDPOINT;
    delete process.env.SRK_VAULT_URL;
    delete process.env.SRK_VAULT_TOKEN;
    delete process.env.SRK_VAULT_MOUNT;
    delete process.env.SRK_VERCEL_TOKEN;
    delete process.env.SRK_VERCEL_PROJECT_ID;
    delete process.env.SRK_VERCEL_TEAM_ID;
    delete process.env.SRK_VERCEL_TARGET;
  });

  it('builds aws provider config with region and optional endpoint', async () => {
    const { buildProviderConfig } = await import('./cli.js');
    const config = buildProviderConfig('aws');
    expect(config).toEqual({
      type: 'aws',
      region: 'us-west-2',
      endpoint: 'http://localhost:4566',
    });
  });

  it('builds aws provider config without endpoint', async () => {
    delete process.env.SRK_AWS_ENDPOINT;
    const { buildProviderConfig } = await import('./cli.js');
    const config = buildProviderConfig('aws');
    expect(config).toEqual({
      type: 'aws',
      region: 'us-west-2',
    });
  });

  it('builds gcp provider config with project id and optional endpoint', async () => {
    const { buildProviderConfig } = await import('./cli.js');
    const config = buildProviderConfig('gcp');
    expect(config).toEqual({
      type: 'gcp',
      projectId: 'my-gcp-project',
      endpoint: 'http://localhost:8085',
    });
  });

  it('builds gcp provider config without endpoint', async () => {
    delete process.env.SRK_GCP_ENDPOINT;
    const { buildProviderConfig } = await import('./cli.js');
    const config = buildProviderConfig('gcp');
    expect(config).toEqual({
      type: 'gcp',
      projectId: 'my-gcp-project',
    });
  });

  it('builds vault provider config with url, mount, token', async () => {
    const { buildProviderConfig } = await import('./cli.js');
    const config = buildProviderConfig('vault');
    expect(config).toEqual({
      type: 'vault',
      url: 'http://vault:8200',
      mountPath: 'kv-v2',
      token: 'root-token',
    });
  });

  it('builds vault provider config with defaults', async () => {
    delete process.env.SRK_VAULT_TOKEN;
    delete process.env.SRK_VAULT_MOUNT;
    const { buildProviderConfig } = await import('./cli.js');
    const config = buildProviderConfig('vault');
    expect(config).toEqual({
      type: 'vault',
      url: 'http://vault:8200',
      mountPath: 'secret',
    });
  });

  it('builds vercel provider config with all fields', async () => {
    const { buildProviderConfig } = await import('./cli.js');
    const config = buildProviderConfig('vercel');
    expect(config).toEqual({
      type: 'vercel',
      token: 'vercel-token',
      projectId: 'vercel-project',
      teamId: 'team_abc',
      target: ['production', 'preview'],
    });
  });

  it('builds vercel provider config without optional fields', async () => {
    delete process.env.SRK_VERCEL_TEAM_ID;
    delete process.env.SRK_VERCEL_TARGET;
    const { buildProviderConfig } = await import('./cli.js');
    const config = buildProviderConfig('vercel');
    expect(config).toEqual({
      type: 'vercel',
      token: 'vercel-token',
      projectId: 'vercel-project',
    });
  });

  it('throws for unknown provider type', async () => {
    const { buildProviderConfig } = await import('./cli.js');
    expect(() => buildProviderConfig('unknown')).toThrow(
      'Unknown SRK_PROVIDER "unknown". Expected one of: aws, gcp, vault, vercel',
    );
  });
});

describe('main', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    process.env.SRK_PROVIDER = 'aws';
    process.env.SRK_AWS_REGION = 'us-east-1';
    process.env.SRK_HOST = '127.0.0.1';
    process.env.SRK_LOG_LEVEL = 'info';
    process.env.SRK_LOG_STRUCTURED = 'true';
    delete process.env.SRK_PORT;
    delete process.env.SRK_SECRETS;
    delete process.env.SRK_ROTATION_INTERVAL_MS;
    delete process.env.SRK_CORS_ORIGIN;
    delete process.env.SRK_AUTH_TOKEN;

    await import('./cli.js');
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.SRK_SECRETS;
    delete process.env.SRK_ROTATION_INTERVAL_MS;
    delete process.env.SRK_CORS_ORIGIN;
    delete process.env.SRK_AUTH_TOKEN;
    delete process.env.SRK_PORT;
    // Each main() registers SIGTERM/SIGINT handlers; remove them so repeated
    // runs don't leak listeners (and trip Node's MaxListeners warning).
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
  });

  it('starts server with default options', async () => {
    const cli = await import('./cli.js');
    const { SidecarServer } = await import('./server.js');

    await cli.main();

    expect(SidecarServer).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 8080,
        host: '127.0.0.1',
      }),
    );
  });

  it('uses SRK_PORT when set', async () => {
    process.env.SRK_PORT = '3000';
    const cli = await import('./cli.js');
    const { SidecarServer } = await import('./server.js');

    await cli.main();

    expect(SidecarServer).toHaveBeenCalledWith(expect.objectContaining({ port: 3000 }));
  });

  it('uses PORT env var when SRK_PORT not set', async () => {
    process.env.PORT = '4000';
    const cli = await import('./cli.js');
    const { SidecarServer } = await import('./server.js');

    await cli.main();

    expect(SidecarServer).toHaveBeenCalledWith(expect.objectContaining({ port: 4000 }));

    delete process.env.PORT;
  });

  it('passes authToken when SRK_AUTH_TOKEN is set', async () => {
    process.env.SRK_AUTH_TOKEN = 'my-token';
    const cli = await import('./cli.js');
    const { SidecarServer } = await import('./server.js');

    await cli.main();

    expect(SidecarServer).toHaveBeenCalledWith(expect.objectContaining({ authToken: 'my-token' }));
  });

  it('passes corsOrigin when SRK_CORS_ORIGIN is set', async () => {
    process.env.SRK_CORS_ORIGIN = 'https://example.com';
    const cli = await import('./cli.js');
    const { SidecarServer } = await import('./server.js');

    await cli.main();

    expect(SidecarServer).toHaveBeenCalledWith(
      expect.objectContaining({ corsOrigin: 'https://example.com' }),
    );
  });

  it('starts rotation when SRK_SECRETS and SRK_ROTATION_INTERVAL_MS are set', async () => {
    process.env.SRK_SECRETS = 'secret-a,secret-b';
    process.env.SRK_ROTATION_INTERVAL_MS = '60000';
    const cli = await import('./cli.js');
    const { RotationManager } = await import('@reaatech/secret-rotation-core');

    await cli.main();

    const managerCalls = vi.mocked(RotationManager).mock.calls;
    expect(managerCalls.length).toBeGreaterThanOrEqual(1);
    const managerOptions = managerCalls[managerCalls.length - 1][0];
    expect(managerOptions).toHaveProperty('rotationIntervalMs', 60000);

    const managerInstance = vi.mocked(RotationManager).mock.results[managerCalls.length - 1].value;
    expect(managerInstance.start).toHaveBeenCalledWith(['secret-a', 'secret-b']);
  });

  it('warns when SRK_SECRETS set without SRK_ROTATION_INTERVAL_MS', async () => {
    process.env.SRK_SECRETS = 'secret-a';
    delete process.env.SRK_ROTATION_INTERVAL_MS;
    const cli = await import('./cli.js');
    const { LoggerService } = await import('@reaatech/secret-rotation-observability');

    await cli.main();

    const loggerCalls = vi.mocked(LoggerService).mock.calls;
    const loggerInstance = vi.mocked(LoggerService).mock.results[loggerCalls.length - 1].value;
    expect(loggerInstance.warn).toHaveBeenCalledWith(
      'SRK_SECRETS set but SRK_ROTATION_INTERVAL_MS missing; scheduling disabled',
    );
  });

  it('does not start rotation when SRK_SECRETS is empty', async () => {
    process.env.SRK_SECRETS = '';
    const cli = await import('./cli.js');
    const { RotationManager } = await import('@reaatech/secret-rotation-core');

    await cli.main();

    const managerCalls = vi.mocked(RotationManager).mock.calls;
    const managerInstance = vi.mocked(RotationManager).mock.results[managerCalls.length - 1].value;
    expect(managerInstance.start).not.toHaveBeenCalled();
  });

  it('disables structured logging when SRK_LOG_STRUCTURED=false', async () => {
    process.env.SRK_LOG_STRUCTURED = 'false';
    const cli = await import('./cli.js');
    const { LoggerService } = await import('@reaatech/secret-rotation-observability');

    await cli.main();

    const lastCallArgs =
      vi.mocked(LoggerService).mock.calls[vi.mocked(LoggerService).mock.calls.length - 1][0];
    expect(lastCallArgs).toHaveProperty('structured', false);
  });

  it('calls server.start()', async () => {
    const cli = await import('./cli.js');
    const { SidecarServer } = await import('./server.js');

    await cli.main();

    const serverCalls = vi.mocked(SidecarServer).mock.calls;
    const serverInstance = vi.mocked(SidecarServer).mock.results[serverCalls.length - 1].value;
    expect(serverInstance.start).toHaveBeenCalled();
  });

  it('handles SIGTERM signal gracefully', async () => {
    const cli = await import('./cli.js');
    const { RotationManager } = await import('@reaatech/secret-rotation-core');
    const { SidecarServer } = await import('./server.js');

    await cli.main();

    const managerCalls = vi.mocked(RotationManager).mock.calls;
    const serverCalls = vi.mocked(SidecarServer).mock.calls;
    const managerInstance = vi.mocked(RotationManager).mock.results[managerCalls.length - 1].value;
    const serverInstance = vi.mocked(SidecarServer).mock.results[serverCalls.length - 1].value;

    process.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(managerInstance.stop).toHaveBeenCalled();
    expect(serverInstance.stop).toHaveBeenCalled();
  });

  it('handles double SIGTERM gracefully (shuttingDown guard)', async () => {
    const cli = await import('./cli.js');
    const { RotationManager } = await import('@reaatech/secret-rotation-core');
    const { SidecarServer } = await import('./server.js');

    await cli.main();

    const managerCalls = vi.mocked(RotationManager).mock.calls;
    const serverCalls = vi.mocked(SidecarServer).mock.calls;
    const managerInstance = vi.mocked(RotationManager).mock.results[managerCalls.length - 1].value;
    const serverInstance = vi.mocked(SidecarServer).mock.results[serverCalls.length - 1].value;

    process.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));
    process.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(managerInstance.stop).toHaveBeenCalledTimes(1);
    expect(serverInstance.stop).toHaveBeenCalledTimes(1);
  });

  it('handles shutdown error when manager.stop() throws', async () => {
    const cli = await import('./cli.js');
    const { RotationManager } = await import('@reaatech/secret-rotation-core');
    const { LoggerService } = await import('@reaatech/secret-rotation-observability');

    await cli.main();

    const managerCalls = vi.mocked(RotationManager).mock.calls;
    const managerInstance = vi.mocked(RotationManager).mock.results[managerCalls.length - 1].value;
    managerInstance.stop.mockRejectedValue(new Error('stop error'));

    const loggerCall =
      vi.mocked(LoggerService).mock.results[vi.mocked(LoggerService).mock.calls.length - 1].value;

    process.emit('SIGTERM', 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(managerInstance.stop).toHaveBeenCalled();
    expect(loggerCall.error).toHaveBeenCalledWith(
      'Error during shutdown',
      expect.objectContaining({ error: 'stop error' }),
    );
  });
});

describe('loadProviderPackage', () => {
  it('loads known provider packages without error', async () => {
    const { loadProviderPackage } = await import('./cli.js');
    await expect(loadProviderPackage('aws')).resolves.toBeUndefined();
    await expect(loadProviderPackage('gcp')).resolves.toBeUndefined();
    await expect(loadProviderPackage('vault')).resolves.toBeUndefined();
    await expect(loadProviderPackage('vercel')).resolves.toBeUndefined();
  });

  it('throws for unknown provider type', async () => {
    const { loadProviderPackage } = await import('./cli.js');
    await expect(loadProviderPackage('unknown')).rejects.toThrow(
      'Unknown SRK_PROVIDER "unknown". Expected one of: aws, gcp, vault, vercel',
    );
  });

  it('throws when provider package import fails', async () => {
    vi.doMock('@reaatech/secret-rotation-provider-aws', () => {
      throw new Error('Cannot find module');
    });
    vi.resetModules();
    const { loadProviderPackage } = await import('./cli.js');
    await expect(loadProviderPackage('aws')).rejects.toThrow(
      /Provider package "@reaatech\/secret-rotation-provider-aws" is not installed/,
    );
  });
});
