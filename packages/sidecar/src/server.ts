import { type IncomingMessage, type Server, type ServerResponse, createServer } from 'node:http';
import type { RotationManager, RotationResult } from '@reaatech/secret-rotation-core';
import { validateSecretName } from '@reaatech/secret-rotation-core';
import { MetricsService } from '@reaatech/secret-rotation-observability';
import type { EventEmitter, Logger } from '@reaatech/secret-rotation-types';

/** Maximum request body size (1 MB). */
const MAX_BODY_SIZE = 1_048_576;

export interface SidecarOptions {
  /** Port to listen on. */
  port?: number;
  /** Host to bind to (default 127.0.0.1). */
  host?: string;
  /** RotationManager instance. */
  manager: RotationManager;
  /** Optional event emitter for SSE streaming. */
  eventEmitter?: EventEmitter;
  /** Optional metrics service. */
  metrics?: MetricsService;
  /** Optional logger. */
  logger?: Logger;
  /** Allowed CORS origin (default "http://localhost:*"). Use "*" for any origin. */
  corsOrigin?: string;
  /** Optional shared secret for bearer token auth on write endpoints. */
  authToken?: string;
}

/**
 * HTTP sidecar server that exposes rotation endpoints.
 *
 * Endpoints:
 * - `POST /rotate` — Trigger a secret rotation
 * - `GET /secrets/:name` — Get rotation state for a secret
 * - `GET /health` — Health check
 * - `GET /metrics` — Prometheus metrics
 * - `GET /events` — Server-Sent Events stream
 */
export class SidecarServer {
  private server: Server | null = null;
  private port: number;
  private readonly host: string;
  private readonly manager: RotationManager;
  private readonly eventEmitter: EventEmitter | undefined;
  private readonly metrics: MetricsService;
  private readonly logger: Logger | undefined;
  private readonly corsOrigin: string;
  private readonly authToken: string | undefined;
  private sseConnections: Set<ServerResponse> = new Set();
  private readonly counters: {
    rotateTotal: { inc: (by?: number) => void };
    rotateFailures: { inc: (by?: number) => void };
  };

  constructor(options: SidecarOptions) {
    this.port = options.port ?? 8080;
    this.host = options.host ?? '127.0.0.1';
    this.manager = options.manager;
    this.eventEmitter = options.eventEmitter;
    this.metrics = options.metrics ?? new MetricsService(options.logger);
    this.logger = options.logger;
    this.corsOrigin = options.corsOrigin ?? 'http://localhost:*';
    this.authToken = options.authToken;

    this.counters = {
      rotateTotal: this.metrics.counter('srk_rotate_requests_total', 'Total rotation requests'),
      rotateFailures: this.metrics.counter('srk_rotate_failures_total', 'Failed rotation requests'),
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      this.server.timeout = 60_000;
      this.server.headersTimeout = 65_000;
      this.server.maxHeadersCount = 100;

      this.server.on('error', (err) => {
        this.logger?.error('Sidecar server error', { error: err.message });
        reject(err);
      });

      this.server.listen(this.port, this.host, () => {
        const addr = this.server?.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
        }
        this.logger?.info('Sidecar server started', {
          host: this.host,
          port: this.port,
        });
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.logger?.info('Sidecar server stopped');
          resolve();
        }
      });
    });
  }

  get address(): string {
    return `http://${this.host}:${this.port}`;
  }

  /** The actual port the server is listening on. */
  get listeningPort(): number {
    return this.port;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    res.setHeader('Access-Control-Allow-Origin', this.corsOrigin);

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        });
        res.end();
      } else if (req.method === 'POST' && url.pathname === '/rotate') {
        if (this.authToken && !this.checkAuth(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        await this.handleRotate(req, res);
      } else if (req.method === 'GET' && url.pathname.startsWith('/secrets/')) {
        if (this.authToken && !this.checkAuth(req)) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        await this.handleGetState(url, res);
      } else if (req.method === 'GET' && url.pathname === '/health') {
        this.handleHealth(res);
      } else if (req.method === 'GET' && url.pathname === '/metrics') {
        this.handleMetrics(res);
      } else if (req.method === 'GET' && url.pathname === '/events') {
        await this.handleEvents(req, res);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      this.logger?.error('Sidecar request error', {
        method: req.method,
        path: url.pathname,
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Internal server error',
        }),
      );
    }
  }

  private async handleRotate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req);
    let parsed: { secretName?: string; force?: boolean };
    try {
      parsed = JSON.parse(body) as {
        secretName?: string;
        force?: boolean;
      };
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    const { secretName, force = false } = parsed;

    if (!secretName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing required field: secretName' }));
      return;
    }

    const validation = validateSecretName(secretName);
    if (!validation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Invalid secretName: ${validation.errors.join('; ')}` }));
      return;
    }

    this.counters.rotateTotal.inc();

    try {
      const result: RotationResult = await this.manager.rotate(secretName, { force });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, result }));
    } catch (error) {
      this.counters.rotateFailures.inc();
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  private async handleGetState(url: URL, res: ServerResponse): Promise<void> {
    const secretName = decodeURIComponent(url.pathname.slice('/secrets/'.length));
    if (!secretName) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing secret name' }));
      return;
    }

    const validation = validateSecretName(secretName);
    if (!validation.valid) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `Invalid secretName: ${validation.errors.join('; ')}` }));
      return;
    }

    const state = await this.manager.getState(secretName);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(state));
  }

  private handleHealth(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      }),
    );
  }

  private handleMetrics(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(this.metrics.collect());
  }

  private async handleEvents(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.eventEmitter) {
      res.writeHead(501, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Event streaming not configured' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const eventTypes = [
      'key_generated',
      'key_propagated',
      'key_verified',
      'key_activated',
      'rotation_failed',
    ];

    this.sseConnections.add(res);

    const handlers: Array<{ eventType: string; handler: (event: unknown) => void }> = [];
    for (const eventType of eventTypes) {
      const handler = (event: unknown) => {
        const re = event as { type: string };
        res.write(`event: ${re.type}\ndata: ${JSON.stringify(event)}\n\n`);
      };
      this.eventEmitter.on(eventType, handler);
      handlers.push({ eventType, handler });
    }

    res.write(':ok\n\n');

    const cleanup = () => {
      this.sseConnections.delete(res);
      for (const { eventType, handler } of handlers) {
        this.eventEmitter?.off(eventType, handler);
      }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  private checkAuth(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (!header) return false;
    return header === `Bearer ${this.authToken}`;
  }
}

async function readBody(req: IncomingMessage): Promise<string> {
  const contentLength = Number.parseInt(req.headers['content-length'] ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE) {
    throw new Error('Request body exceeds size limit');
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;
    req.on('data', (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > MAX_BODY_SIZE) {
        req.destroy(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}
