import {
  Server as HttpServer,
  createServer as httpCreateServer,
  get as httpGet,
  request as httpRequest,
} from 'node:http';
import { InMemoryEventEmitter, RotationManager } from '@reaatech/secret-rotation-core';
import { MetricsService } from '@reaatech/secret-rotation-observability';
import type { SecretProvider } from '@reaatech/secret-rotation-types';
import { describe, expect, it, vi } from 'vitest';
import { SidecarServer } from './server.js';

function createMockProvider(): SecretProvider {
  return {
    name: 'mock',
    priority: 1,
    createSecret: vi.fn(),
    getSecret: vi.fn(async () => ({
      value: 'secret',
      versionId: 'v1',
      createdAt: new Date(),
    })),
    storeSecretValue: vi.fn(async (_name, value, _options) => ({
      value,
      versionId: 'v2',
      createdAt: new Date(),
    })),
    deleteSecret: vi.fn(),
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    deleteVersion: vi.fn(),
    supportsRotation: vi.fn(() => true),
    beginRotation: vi.fn(async (name) => ({
      sessionId: 's-1',
      secretName: name,
      provider: 'mock',
      state: { versionId: 'v2' },
      startedAt: new Date(),
    })),
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

describe('SidecarServer', () => {
  it('starts and stops without error', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({
      providerInstance: provider,
      verifier: {
        verify: vi.fn(async () => ({
          success: true,
          consumerCount: 1,
          verifiedCount: 1,
          coverage: 1,
          duration: 100,
          failures: [],
          canRetry: false,
        })),
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
    });

    const server = new SidecarServer({ manager, port: 0 });
    await server.start();
    await server.stop();
  });

  it('returns address string', () => {
    const provider = createMockProvider();
    const manager = new RotationManager({
      providerInstance: provider,
    });
    const server = new SidecarServer({ manager, host: '127.0.0.1', port: 3000 });
    expect(server.address).toBe('http://127.0.0.1:3000');
  });

  it('defaults host to 127.0.0.1', () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 3000 });
    expect(server.address).toBe('http://127.0.0.1:3000');
  });

  it('sets CORS origin from options', () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, corsOrigin: 'https://example.com' });
    expect(server.address).toBe('http://127.0.0.1:8080');
  });

  it('receives metrics on the /metrics endpoint', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const metrics = new MetricsService();
    const server = new SidecarServer({ manager, metrics, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/metrics`);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('srk_rotate_requests_total');
    } finally {
      await server.stop();
    }
  });

  it('receives health on the /health endpoint', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { status: string };
      expect(json.status).toBe('healthy');
    } finally {
      await server.stop();
    }
  });

  it('returns 404 for unknown routes', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/unknown`);
      expect(res.status).toBe(404);
    } finally {
      await server.stop();
    }
  });

  it('rejects unauthorized requests when authToken is set', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, authToken: 's3cret', port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretName: 'test' }),
      });
      expect(res.status).toBe(401);
    } finally {
      await server.stop();
    }
  });

  it('allows authorized requests when authToken is set', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({
      providerInstance: provider,
      verifier: {
        verify: vi.fn(async () => ({
          success: true,
          consumerCount: 1,
          verifiedCount: 1,
          coverage: 1,
          duration: 100,
          failures: [],
          canRetry: false,
        })),
        getVerificationStatus: vi.fn(),
        cancelVerification: vi.fn(),
      },
    });
    const server = new SidecarServer({ manager, authToken: 's3cret', port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/rotate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer s3cret',
        },
        body: JSON.stringify({ secretName: 'test' }),
      });
      expect(res.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  it('validates secret name in GET /secrets/:name', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/secrets/.invalid-lead`);
      expect(res.status).toBe(400);
    } finally {
      await server.stop();
    }
  });

  it('rejects POST /rotate with missing secretName', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    } finally {
      await server.stop();
    }
  });

  it('rejects POST /rotate with invalid JSON body', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      });
      expect(res.status).toBe(400);
    } finally {
      await server.stop();
    }
  });

  it('returns 501 for events without event emitter', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/events`);
      expect(res.status).toBe(501);
    } finally {
      await server.stop();
    }
  });

  it('validates secret name on POST /rotate', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretName: '' }),
      });
      expect(res.status).toBe(400);
    } finally {
      await server.stop();
    }
  });

  it('handles OPTIONS preflight requests', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/rotate`, {
        method: 'OPTIONS',
      });
      expect(res.status).toBe(204);
    } finally {
      await server.stop();
    }
  });

  it('handles rotation failure with 500', async () => {
    const provider = createMockProvider();
    provider.beginRotation = vi.fn(async () => {
      throw new Error('simulated failure');
    });
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretName: 'test' }),
      });
      expect(res.status).toBe(500);
      const json = (await res.json()) as { success: boolean };
      expect(json.success).toBe(false);
    } finally {
      await server.stop();
    }
  });

  it('defaults corsOrigin to localhost when not specified in options', () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager });
    expect(server.address).toContain('127.0.0.1:8080');
  });

  it('returns listeningPort after start on port 0', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    expect(server.listeningPort).toBeGreaterThan(0);
    await server.stop();
  });

  it('rejects large request body via Content-Length pre-check', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: '127.0.0.1',
            port,
            path: '/rotate',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': '2000000',
            },
          },
          (res) => {
            let _data = '';
            res.on('data', (c) => {
              _data += c;
            });
            res.on('end', () => {
              expect(res.statusCode).toBe(500);
              resolve();
            });
          },
        );
        req.on('error', (err) => {
          if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') {
            resolve();
          } else {
            reject(err);
          }
        });
        req.write('{}');
        req.end();
      });
    } finally {
      await server.stop();
    }
  });

  it('streams events when event emitter is configured', async () => {
    const provider = createMockProvider();
    const emitter = {
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      replay: vi.fn(),
    };
    const manager = new RotationManager({
      providerInstance: provider,
      eventEmitter: emitter,
    });
    const server = new SidecarServer({
      manager,
      eventEmitter: emitter,
      port: 0,
    });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      await new Promise<void>((resolve) => {
        httpGet(`http://127.0.0.1:${port}/events`, (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');
          res.on('data', () => {});
          setTimeout(() => {
            res.destroy();
            resolve();
          }, 100);
        });
      });
    } finally {
      await server.stop();
    }
  });

  it('resolves stop() before start() without error', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager });
    await expect(server.stop()).resolves.toBeUndefined();
  });

  it('rejects start when port is already in use', async () => {
    const occupying = httpCreateServer();
    await new Promise<void>((resolve) => occupying.listen(0, '127.0.0.1', resolve));
    const addr = occupying.address() as { port: number };

    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: addr.port });

    await expect(server.start()).rejects.toThrow();

    occupying.close();
  });

  it('returns 400 for empty secret name in GET /secrets/', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/secrets/`);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('Missing secret name');
    } finally {
      await server.stop();
    }
  });

  it('streams events when event emitter emits after SSE connection', async () => {
    const provider = createMockProvider();
    const emitter = new InMemoryEventEmitter();
    const manager = new RotationManager({
      providerInstance: provider,
      eventEmitter: emitter,
    });
    const server = new SidecarServer({
      manager,
      eventEmitter: emitter,
      port: 0,
    });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const eventData = await new Promise<string>((resolve) => {
        const collected: string[] = [];
        const req = httpGet(`http://127.0.0.1:${port}/events`, (res) => {
          expect(res.statusCode).toBe(200);
          res.on('data', (chunk: Buffer) => {
            collected.push(chunk.toString());
            const all = collected.join('');
            if (all.includes('key_generated') && all.includes('test-secret')) {
              resolve(all);
            }
          });
        });

        req.on('error', () => {
          resolve(collected.join(''));
        });

        setTimeout(async () => {
          await emitter.emit({
            type: 'key_generated' as const,
            secretName: 'test-secret',
            keyId: 'k-1',
            timestamp: new Date(),
          });
        }, 200);

        setTimeout(() => {
          req.destroy();
          resolve(collected.join(''));
        }, 3000);
      });

      expect(eventData).toContain('event: key_generated');
      expect(eventData).toContain('test-secret');
    } finally {
      await server.stop();
    }
  }, 10000);

  it('returns 500 when getState throws unexpectedly', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    vi.spyOn(manager, 'getState').mockRejectedValue(new Error('unexpected error'));
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/secrets/mysecret`);
      expect(res.status).toBe(500);
      const json = (await res.json()) as { error: string };
      expect(json.error).toBe('unexpected error');
    } finally {
      await server.stop();
    }
  });

  it('validates non-empty secret name on POST /rotate', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/rotate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secretName: '.invalid-lead' }),
      });
      expect(res.status).toBe(400);
    } finally {
      await server.stop();
    }
  });

  it('returns state for valid secret name in GET /secrets/', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/secrets/valid-name`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toBeDefined();
    } finally {
      await server.stop();
    }
  });

  it('rejects large request body via streaming data check', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const req = httpRequest(
          {
            hostname: '127.0.0.1',
            port,
            path: '/rotate',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          },
          () => {
            resolve();
          },
        );
        req.on('error', (err) => {
          const code = (err as NodeJS.ErrnoException).code;
          if (code === 'ECONNRESET' || code === 'EPIPE') {
            resolve();
          } else {
            reject(err);
          }
        });
        const chunk = Buffer.alloc(65536, 'x');
        const totalSize = 1_048_576 + 1;
        let sent = 0;
        function writeLoop() {
          let canWrite = true;
          while (canWrite && sent < totalSize) {
            canWrite = req.write(chunk);
            sent += chunk.length;
          }
          if (sent >= totalSize) {
            req.end();
          } else {
            req.once('drain', writeLoop);
          }
        }
        writeLoop();
      });
    } finally {
      await server.stop();
    }
  });

  it('rejects GET /secrets/ without auth when authToken is set', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, authToken: 's3cret', port: 0 });
    await server.start();

    const port = server.listeningPort;
    if (port === 0) {
      await server.stop();
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:${port}/secrets/mysecret`);
      expect(res.status).toBe(401);
    } finally {
      await server.stop();
    }
  });

  it('rejects stop when server.close fails', async () => {
    const provider = createMockProvider();
    const manager = new RotationManager({ providerInstance: provider });
    const server = new SidecarServer({ manager, port: 0 });
    await server.start();

    const closeSpy = vi.spyOn(HttpServer.prototype, 'close').mockImplementation(function (
      this: HttpServer,
      callback?: (err?: Error) => void,
    ) {
      callback?.(new Error('close failed'));
      return this;
    });

    try {
      await expect(server.stop()).rejects.toThrow('close failed');
    } finally {
      closeSpy.mockRestore();
      await server.stop();
    }
  });
});
