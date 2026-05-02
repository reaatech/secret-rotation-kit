import { randomBytes } from 'node:crypto';
import type {
  EventEmitter,
  KeyGenerator,
  KeyStore,
  Logger,
  PropagationVerifier,
  SecretProvider,
} from '@reaatech/secret-rotation-types';
import type {
  RotationEvent,
  RotationFailedEvent,
  RotationSession,
  RotationStage,
  SecretKey,
} from '@reaatech/secret-rotation-types';
import type { VerificationOptions } from '@reaatech/secret-rotation-types';
import { ProviderError, RotationError } from './errors.js';
import { KeyLifecycleManager } from './key-lifecycle-manager.js';
import type { RollbackManager } from './rollback-manager.js';

/** Options for a single rotation execution. */
export interface RotationRequest {
  /** Secret identifier. */
  secretName: string;

  /** Desired key format. */
  keyFormat?: SecretKey['format'];

  /** Force rotation even if one is in progress. */
  force?: boolean;

  /** Overlap period (ms) for the old active key after activation. */
  overlapPeriodMs?: number;

  /** Verification timeout override. */
  verificationTimeout?: number;

  /** Minimum consumer coverage override. */
  minConsumerCoverage?: number;

  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

/** Result of a completed (or failed) rotation. */
export interface RotationResult {
  /** Whether rotation succeeded. */
  success: boolean;

  /** Unique rotation identifier. */
  rotationId: string;

  /** ID of the newly created key. */
  newKeyId: string;

  /** Duration in milliseconds. */
  duration: number;

  /** Completion timestamp. */
  timestamp: Date;
}

/**
 * Orchestrates the complete secret rotation lifecycle:
 *
 * 1. Generate new key
 * 2. Save to local key store
 * 3. Begin provider rotation session
 * 4. Store secret value in provider
 * 5. Verify propagation
 * 6. Activate new key (expire old key)
 * 7. Complete provider rotation session
 * 8. Emit lifecycle events
 *
 * On failure, attempts to cancel the provider session and mark the key as failed.
 */
export class RotationWorkflow {
  private readonly lifecycle: KeyLifecycleManager;

  constructor(
    private readonly keyGenerator: KeyGenerator,
    private readonly provider: SecretProvider,
    private readonly keyStore: KeyStore,
    private readonly verifier: PropagationVerifier,
    private readonly eventEmitter: EventEmitter | undefined,
    private readonly logger: Logger | undefined,
    private readonly rollbackManager: RollbackManager | undefined = undefined,
  ) {
    this.lifecycle = new KeyLifecycleManager(keyStore, logger);
  }

  async execute(request: RotationRequest): Promise<RotationResult> {
    const rotationId = this.generateRotationId();
    const startTime = Date.now();
    const { secretName } = request;

    this.log('info', 'Starting rotation', { rotationId, secretName });

    let session: RotationSession | undefined;
    let newKey: SecretKey | undefined;
    let previousActiveKeyId: string | undefined;
    let stage: RotationStage = 'generation';
    let rollbackEntryId: string | undefined;

    try {
      const previousActive = await this.keyStore.getActive(secretName);
      previousActiveKeyId = previousActive?.keyId;

      newKey = await this.generateKey(request, rotationId);

      if (this.rollbackManager) {
        const entry = this.rollbackManager.startRotation(
          secretName,
          newKey.keyId,
          previousActiveKeyId ?? null,
          null,
        );
        rollbackEntryId = entry.id;
      }

      stage = 'propagation';
      session = await this.beginProviderRotation(secretName, rotationId);
      await this.propagateToProvider(secretName, newKey, session, rotationId);

      stage = 'verification';
      await this.verifyPropagation(session, newKey, request, rotationId);

      stage = 'activation';
      await this.activateNewKey(secretName, newKey.keyId, rotationId, request.overlapPeriodMs);
      await this.completeProviderRotation(session, rotationId);

      const duration = Date.now() - startTime;
      this.log('info', 'Rotation completed', { rotationId, secretName, duration });

      if (this.rollbackManager && rollbackEntryId) {
        this.rollbackManager.markComplete(rollbackEntryId);
      }

      await this.emit({
        type: 'key_activated',
        secretName,
        keyId: newKey.keyId,
        ...(previousActiveKeyId !== undefined && { previousKeyId: previousActiveKeyId }),
        timestamp: new Date(),
        metadata: { rotationId, duration },
      });

      return {
        success: true,
        rotationId,
        newKeyId: newKey.keyId,
        duration,
        timestamp: new Date(),
      };
    } catch (error) {
      this.log('error', 'Rotation failed', {
        rotationId,
        secretName,
        stage,
        error: error instanceof Error ? error.message : String(error),
      });

      await this.handleFailure(
        session,
        newKey,
        secretName,
        error,
        rotationId,
        stage,
        previousActiveKeyId,
        rollbackEntryId,
      );

      throw error;
    }
  }

  // ── Steps ────────────────────────────────────────────────────────────────────

  private async generateKey(request: RotationRequest, rotationId: string): Promise<SecretKey> {
    this.log('debug', 'Generating new key', { rotationId, secretName: request.secretName });

    const key = await this.keyGenerator.generate({
      secretName: request.secretName,
      ...(request.keyFormat !== undefined && { format: request.keyFormat }),
      metadata: { ...request.metadata, rotationId },
    });

    await this.keyStore.save(key);

    await this.emit({
      type: 'key_generated',
      secretName: request.secretName,
      keyId: key.keyId,
      timestamp: new Date(),
      metadata: { rotationId },
    });

    return key;
  }

  private async beginProviderRotation(
    secretName: string,
    rotationId: string,
  ): Promise<RotationSession> {
    this.log('debug', 'Beginning provider rotation', { rotationId, secretName });

    if (!this.provider.supportsRotation()) {
      throw new ProviderError(
        `Provider ${this.provider.name} does not support rotation workflows`,
        this.provider.name,
        'propagation',
        false,
      );
    }

    const session = await this.provider.beginRotation(secretName);
    this.log('debug', 'Provider rotation session started', {
      rotationId,
      sessionId: session.sessionId,
    });
    return session;
  }

  private async propagateToProvider(
    secretName: string,
    key: SecretKey,
    session: RotationSession,
    rotationId: string,
  ): Promise<void> {
    this.log('debug', 'Propagating to provider', { rotationId, secretName });

    const propagated = await this.provider.storeSecretValue(secretName, key.encryptedMaterial, {
      stage: 'pending',
    });

    // Record the actual versionId the provider assigned. Verification and completion
    // both depend on this — without it, AWS would promote the wrong version and the
    // verifier would poll a version that does not contain the new key.
    session.state.versionId = propagated.versionId;
    if (propagated.versionStages) {
      session.state.versionStages = propagated.versionStages;
    }

    await this.emit({
      type: 'key_propagated',
      secretName,
      keyId: key.keyId,
      provider: this.provider.name,
      timestamp: new Date(),
      propagationTime: Date.now() - key.createdAt.getTime(),
      metadata: { rotationId, versionId: propagated.versionId },
    });
  }

  private async verifyPropagation(
    session: RotationSession,
    newKey: SecretKey,
    request: RotationRequest,
    rotationId: string,
  ): Promise<void> {
    this.log('debug', 'Verifying propagation', { rotationId, secretName: session.secretName });

    const options: VerificationOptions = {
      timeout: request.verificationTimeout ?? 30000,
      minConsumerCoverage: request.minConsumerCoverage ?? 1.0,
      metadata: { rotationId },
    };

    const result = await this.verifier.verify(session, options);

    if (!result.success) {
      throw new RotationError(
        `Propagation verification failed: coverage ${(result.coverage * 100).toFixed(1)}%`,
        'verification',
        result.canRetry,
      );
    }

    await this.emit({
      type: 'key_verified',
      secretName: session.secretName,
      keyId: newKey.keyId,
      consumerCount: result.consumerCount,
      verificationTime: result.duration,
      timestamp: new Date(),
      metadata: { rotationId },
    });
  }

  private async activateNewKey(
    secretName: string,
    keyId: string,
    rotationId: string,
    overlapPeriodMs?: number,
  ): Promise<void> {
    this.log('debug', 'Activating new key', { rotationId, secretName, keyId, overlapPeriodMs });
    await this.lifecycle.activate(secretName, keyId, overlapPeriodMs);
  }

  private async completeProviderRotation(
    session: RotationSession,
    rotationId: string,
  ): Promise<void> {
    this.log('debug', 'Completing provider rotation', { rotationId, sessionId: session.sessionId });
    await this.provider.completeRotation(session);
  }

  // ── Failure Handling ─────────────────────────────────────────────────────────

  private async handleFailure(
    session: RotationSession | undefined,
    newKey: SecretKey | undefined,
    secretName: string,
    error: unknown,
    rotationId: string,
    stage: RotationStage,
    previousActiveKeyId: string | undefined,
    rollbackEntryId: string | undefined,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (this.rollbackManager && rollbackEntryId) {
      const entry = this.rollbackManager.getEntry(rollbackEntryId);
      if (entry) {
        try {
          await this.rollbackManager.rollback(entry, errorMessage);
        } catch (rollbackErr) {
          this.log('warn', 'Rollback via rollback manager failed', {
            rotationId,
            error: rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr),
          });
        }
      }
    } else {
      if (session) {
        try {
          await this.provider.cancelRotation(session);
          this.log('info', 'Cancelled provider rotation session', { rotationId });
        } catch (cancelError) {
          this.log('warn', 'Failed to cancel provider rotation session', {
            rotationId,
            error: cancelError instanceof Error ? cancelError.message : String(cancelError),
          });
        }
      }

      if (newKey) {
        try {
          await this.lifecycle.markFailed(secretName, newKey.keyId, errorMessage);
        } catch (markFailedError) {
          this.log('warn', 'Failed to mark key as failed during cleanup', {
            rotationId,
            error:
              markFailedError instanceof Error ? markFailedError.message : String(markFailedError),
          });
        }
      }

      if (previousActiveKeyId) {
        try {
          await this.reactivatePreviousKey(secretName, previousActiveKeyId);
        } catch (reactivateError) {
          this.log('warn', 'Failed to reactivate previous key during rollback', {
            rotationId,
            keyId: previousActiveKeyId,
            error:
              reactivateError instanceof Error ? reactivateError.message : String(reactivateError),
          });
        }
      }
    }

    const failedEvent: RotationFailedEvent = {
      type: 'rotation_failed',
      secretName,
      error: errorMessage,
      stage,
      timestamp: new Date(),
      canRetry: error instanceof RotationError ? error.canRetry : true,
      metadata: { rotationId },
    };
    if (newKey?.keyId !== undefined) {
      failedEvent.keyId = newKey.keyId;
    }
    await this.emit(failedEvent);
  }

  private async reactivatePreviousKey(secretName: string, keyId: string): Promise<void> {
    const key = await this.keyStore.get(secretName, keyId);
    if (!key) return;

    if (key.status === 'revoked' || key.status === 'failed') return;

    const { validUntil: _vu, ...rest } = key;
    const activeKey: SecretKey = {
      ...rest,
      status: 'active',
      rotatedAt: new Date(),
    };
    await this.keyStore.update(activeKey);
    this.log('info', 'Reactivated previous key during rollback', {
      secretName,
      keyId,
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private generateRotationId(): string {
    return `rot-${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`;
  }

  private async emit(event: RotationEvent): Promise<void> {
    if (!this.eventEmitter) return;
    try {
      await this.eventEmitter.emit(event);
    } catch (error) {
      this.log('warn', 'Event emission failed', {
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    this.logger?.[level](message, meta);
  }
}
