import type { Logger, PropagationVerifier, SecretProvider } from '@reaatech/secret-rotation-types';
import type { RotationSession } from '@reaatech/secret-rotation-types';
import type {
  Consumer,
  ConsumerAuthConfig,
  ConsumerVerificationFailure,
  ConsumerVerificationResult,
  RetryPolicy,
  VerificationOptions,
  VerificationResult,
  VerificationStatus,
} from '@reaatech/secret-rotation-types';
import type { ConsumerRegistry } from './consumer-registry.js';
import { TimeoutError, VerificationError } from './errors.js';
import { RetryHandler } from './retry-handler.js';

export interface ActiveVerifierOptions {
  retryPolicy?: Partial<RetryPolicy>;
  logger?: Logger;
  fetch?: typeof globalThis.fetch;
}

/**
 * Active propagation verifier that reaches out to each registered consumer
 * and confirms it is serving the new secret version.
 *
 * Consumers must advertise their capabilities so the verifier can choose
 * the right check strategy:
 * - `supportsVersionCheck`: calls GET `${endpoint}/secret/${secretName}/version`
 *   and expects `{ version: string }` matching the expected versionId.
 * - `supportsHealthCheck`: calls GET `${endpoint}/health` as a fallback.
 * - `supportsCallback`: not yet implemented; consumer is skipped.
 *
 * If a consumer supports neither version-check nor health-check, it is
 * skipped (treated as verified).
 */
export class ActivePropagationVerifier implements PropagationVerifier {
  private activeVerifications: Map<string, VerificationState> = new Map();
  private retryHandler: RetryHandler;
  private readonly httpFetch: typeof globalThis.fetch;
  private readonly logger: Logger | undefined;

  constructor(
    readonly provider: SecretProvider,
    private readonly registry: ConsumerRegistry,
    options?: ActiveVerifierOptions,
  ) {
    this.retryHandler = new RetryHandler(options?.retryPolicy);
    this.httpFetch = options?.fetch ?? globalThis.fetch.bind(globalThis);
    this.logger = options?.logger;
  }

  async verify(
    session: RotationSession,
    options?: VerificationOptions,
  ): Promise<VerificationResult> {
    const startTime = Date.now();
    const timeout = options?.timeout ?? 30_000;
    const deadline = startTime + timeout;
    const minCoverage = options?.minConsumerCoverage ?? 0.95;

    const existing = this.activeVerifications.get(session.sessionId);
    if (existing && existing.state === 'in_progress') {
      throw new VerificationError(
        'Verification already in progress for this session',
        'verification',
        true,
      );
    }

    const state: VerificationState = {
      state: 'in_progress',
      progress: 0,
      checkedConsumers: [],
      failedConsumers: [],
      startedAt: new Date(),
    };
    this.activeVerifications.set(session.sessionId, state);

    try {
      const consumers = await this.registry.getConsumers(session.secretName);

      if (consumers.length === 0) {
        return {
          success: true,
          consumerCount: 0,
          verifiedCount: 0,
          coverage: 1,
          duration: Date.now() - startTime,
          failures: [],
          canRetry: false,
        };
      }

      const results = await this.verifyConsumers(consumers, session, deadline);
      const failures = results.filter((r) => !r.success);

      const consumerCount = results.length;
      const verifiedCount = consumerCount - failures.length;
      const coverage = consumerCount > 0 ? verifiedCount / consumerCount : 0;
      const duration = Date.now() - startTime;

      state.progress = 1;
      state.state = coverage >= minCoverage ? 'completed' : 'failed';
      state.checkedConsumers = results.map((r) => r.consumerId);
      state.failedConsumers = failures.map((f) => f.consumerId);

      if (coverage < minCoverage) {
        return {
          success: false,
          consumerCount,
          verifiedCount,
          coverage,
          duration,
          failures: this.mapFailures(failures),
          canRetry: failures.some((f) => f.canRetry),
        };
      }

      return {
        success: true,
        consumerCount,
        verifiedCount,
        coverage,
        duration,
        failures: this.mapFailures(failures),
        canRetry: false,
      };
    } catch (error) {
      state.state = 'failed';
      throw error;
    } finally {
      if (this.activeVerifications.get(session.sessionId) === state) {
        this.activeVerifications.delete(session.sessionId);
      }
    }
  }

  async getVerificationStatus(session: RotationSession): Promise<VerificationStatus> {
    const state = this.activeVerifications.get(session.sessionId);
    if (!state) {
      return {
        state: 'completed',
        progress: 1,
        checkedConsumers: [],
        failedConsumers: [],
        startedAt: new Date(),
      };
    }
    return {
      state: state.state,
      progress: state.progress,
      checkedConsumers: [...state.checkedConsumers],
      failedConsumers: [...state.failedConsumers],
      startedAt: state.startedAt,
    };
  }

  async cancelVerification(session: RotationSession): Promise<void> {
    const state = this.activeVerifications.get(session.sessionId);
    if (state) {
      state.state = 'cancelled';
      state.cancelResolver?.();
    }
  }

  private async verifyConsumers(
    consumers: Consumer[],
    session: RotationSession,
    deadline: number,
  ): Promise<ConsumerVerificationResult[]> {
    const perConsumerTimeout = deadline - Date.now();

    const tasks = consumers.map((consumer) =>
      this.verifyConsumer(consumer, session, perConsumerTimeout),
    );

    return Promise.all(tasks);
  }

  private async verifyConsumer(
    consumer: Consumer,
    session: RotationSession,
    timeoutMs: number,
  ): Promise<ConsumerVerificationResult> {
    const startTime = Date.now();
    const controller = new AbortController();
    const fetchTimeout = timeoutMs > 0 ? timeoutMs : 5_000;

    try {
      const expectedVersion = session.state.versionId ?? '';

      const result = await this.withTimeout(
        this.retryHandler.execute(
          async () => {
            if (controller.signal.aborted) {
              throw new TimeoutError('Consumer verification aborted');
            }

            if (consumer.capabilities.supportsVersionCheck) {
              return this.checkConsumerVersion(
                consumer,
                session.secretName,
                expectedVersion,
                fetchTimeout,
              );
            }

            if (consumer.capabilities.supportsHealthCheck) {
              return this.checkConsumerHealth(consumer, fetchTimeout);
            }

            this.logger?.warn('Consumer has no supported verification capability — skipping', {
              consumerId: consumer.id,
              capabilities: consumer.capabilities,
            });
            return { versionId: expectedVersion };
          },
          () => !controller.signal.aborted,
        ),
        timeoutMs,
        controller,
      );

      this.registry.recordSuccess(consumer.id, Date.now() - startTime);

      return {
        consumerId: consumer.id,
        success: true,
        currentVersion: result.result.versionId,
        verifiedAt: new Date(),
        canRetry: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.registry.recordFailure(consumer.id);

      return {
        consumerId: consumer.id,
        success: false,
        error: message,
        canRetry: !(error instanceof TimeoutError),
      };
    }
  }

  private async checkConsumerVersion(
    consumer: Consumer,
    secretName: string,
    expectedVersion: string,
    timeoutMs: number,
  ): Promise<{ versionId: string }> {
    const url = `${consumer.endpoint}/secret/${encodeURIComponent(secretName)}/version`;
    const headers = this.buildAuthHeaders(consumer);

    const response = await this.httpFetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new VerificationError(
        `Consumer ${consumer.id} returned HTTP ${response.status}`,
        'verification',
        true,
      );
    }

    const body = (await response.json()) as { version?: string; versionId?: string };
    const reportedVersion = body.version ?? body.versionId ?? '';

    if (!reportedVersion) {
      throw new VerificationError(
        `Consumer ${consumer.id} did not report a version`,
        'verification',
        true,
      );
    }

    if (expectedVersion && reportedVersion !== expectedVersion) {
      throw new VerificationError(
        `Consumer ${consumer.id} has version ${reportedVersion}, expected ${expectedVersion}`,
        'verification',
        true,
      );
    }

    return { versionId: reportedVersion };
  }

  private async checkConsumerHealth(
    consumer: Consumer,
    timeoutMs: number,
  ): Promise<{ versionId: string }> {
    const url = `${consumer.endpoint}/health`;
    const headers = this.buildAuthHeaders(consumer);

    const response = await this.httpFetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new VerificationError(
        `Consumer ${consumer.id} health check returned HTTP ${response.status}`,
        'verification',
        true,
      );
    }

    return { versionId: 'healthy' };
  }

  private buildAuthHeaders(consumer: Consumer): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };

    if (consumer.auth) {
      switch (consumer.auth.type) {
        case 'bearer': {
          const token = consumer.auth.credentials.token ?? '';
          headers.Authorization = `Bearer ${token}`;
          break;
        }
        case 'api-key': {
          const key = consumer.auth.credentials['api-key'] ?? consumer.auth.credentials.key ?? '';
          const headerName = consumer.auth.credentials.header ?? 'X-API-Key';
          headers[headerName] = key;
          break;
        }
        case 'mtls':
          throw new Error(
            `Consumer ${consumer.id}: mTLS auth is not yet supported. Use "bearer" or "api-key" instead.`,
          );
        default:
          throw new Error(
            `Consumer ${consumer.id}: unknown auth type "${(consumer.auth as ConsumerAuthConfig).type}"`,
          );
      }
    }

    return headers;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    controller?: AbortController,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        controller?.abort();
        reject(new TimeoutError(`Consumer verification timed out after ${ms}ms`));
      }, ms);
      promise.then(
        (val) => {
          clearTimeout(timer);
          resolve(val);
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });
  }

  private mapFailures(results: ConsumerVerificationResult[]): ConsumerVerificationFailure[] {
    return results.map((r) => ({
      consumerId: r.consumerId,
      reason: r.error ?? 'Unknown failure',
      canRetry: r.canRetry,
    }));
  }
}

interface VerificationState {
  state: VerificationStatus['state'];
  progress: number;
  checkedConsumers: string[];
  failedConsumers: string[];
  startedAt: Date;
  cancelResolver?: (() => void) | undefined;
}
