import type { KeyStore, Logger } from '@reaatech/secret-rotation-types';
import type { SecretKey } from '@reaatech/secret-rotation-types';

export interface KeyWindowConfig {
  /** How long new and old keys overlap (ms). */
  overlapPeriodMs: number;
  /** Grace period after key expiry before forced revocation (ms). */
  gracePeriodMs: number;
  /** Maximum number of concurrently valid keys per secret. */
  maxValidKeys?: number;
}

/**
 * Manages overlapping key validity windows for zero-downtime rotation.
 *
 * When a new key is activated, the previous active key is not immediately
 * revoked — it remains valid for the overlap period so consumers using the
 * old key can transition without errors.
 */
export class KeyWindowManager {
  private config: KeyWindowConfig;
  private logger: Logger | undefined;
  private store: KeyStore;

  constructor(store: KeyStore, config: Partial<KeyWindowConfig> = {}, logger?: Logger) {
    this.store = store;
    this.config = {
      overlapPeriodMs: config.overlapPeriodMs ?? 300_000, // 5 min
      gracePeriodMs: config.gracePeriodMs ?? 3_600_000, // 1 hour
      maxValidKeys: config.maxValidKeys ?? 3,
    };
    this.logger = logger;
  }

  /**
   * Activate a new key, handling window overlap with existing active keys.
   *
   * The previously active key is moved to expired rather than revoked, so
   * it remains usable during the overlap window. Keys already in the expired
   * state whose validity window has ended are revoked.
   */
  async activate(secretName: string, newKeyId: string): Promise<SecretKey> {
    const newKey = await this.store.get(secretName, newKeyId);
    if (!newKey) {
      throw new Error(`Key not found: ${secretName}/${newKeyId}`);
    }

    // Move previous active to expired
    const previousActive = await this.store.getActive(secretName);
    if (previousActive && previousActive.keyId !== newKeyId) {
      const expired: SecretKey = {
        ...previousActive,
        status: 'expired',
        validUntil: new Date(Date.now() + this.config.overlapPeriodMs),
      };
      await this.store.update(expired);
      this.logger?.info('Previous key expired with overlap', {
        secretName,
        previousKeyId: previousActive.keyId,
        overlapUntil: expired.validUntil?.toISOString(),
      });
    }

    // Activate new key
    const active: SecretKey = {
      ...newKey,
      status: 'active',
      rotatedAt: new Date(),
    };
    await this.store.update(active);

    // Enforce max valid keys — revoke oldest expired
    await this.enforceMaxValidKeys(secretName);

    this.logger?.info('Key activated', { secretName, keyId: active.keyId });
    return active;
  }

  /**
   * Revoke all keys past their grace period.
   */
  async cleanupExpired(secretName: string): Promise<string[]> {
    const now = new Date();
    const keys = await this.store.list(secretName);
    const revoked: string[] = [];

    for (const key of keys) {
      if (key.status !== 'expired') continue;
      if (!key.validUntil || key.validUntil.getTime() + this.config.gracePeriodMs < now.getTime()) {
        await this.store.update({
          ...key,
          status: 'revoked',
          revokedAt: new Date(),
        });
        revoked.push(key.keyId);
        this.logger?.info('Key revoked after grace period', {
          secretName,
          keyId: key.keyId,
        });
      }
    }

    return revoked;
  }

  /**
   * Select the best key for a given point in time.
   *
   * Prefers active > expired > pending. Within each group, prefers newest.
   */
  async selectKey(secretName: string, at = new Date()): Promise<SecretKey | null> {
    const validKeys = await this.store.getValid(secretName, at);
    if (validKeys.length === 0) return null;

    const active = validKeys.find((k) => k.status === 'active');
    if (active) return active;

    const expired = validKeys.find((k) => k.status === 'expired');
    if (expired) return expired;

    return validKeys[0] ?? null;
  }

  /**
   * Get the current validity window configuration.
   */
  getConfig(): Readonly<KeyWindowConfig> {
    return this.config;
  }

  private async enforceMaxValidKeys(secretName: string): Promise<void> {
    if (!this.config.maxValidKeys) return;
    const allKeys = await this.store.list(secretName);
    const nonRevoked = allKeys.filter(
      (k) => k.status === 'active' || k.status === 'pending' || k.status === 'expired',
    );
    if (nonRevoked.length <= this.config.maxValidKeys) return;

    const toExpire = nonRevoked
      .filter((k) => k.status === 'expired')
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const excess = toExpire.slice(0, nonRevoked.length - this.config.maxValidKeys);
    for (const key of excess) {
      await this.store.update({
        ...key,
        status: 'revoked',
        revokedAt: new Date(),
      });
    }
  }
}
