import type { Logger } from '@reaatech/secret-rotation-types';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryKeyStore } from './in-memory-key-store.js';
import { KeyLifecycleManager } from './key-lifecycle-manager.js';

describe('KeyLifecycleManager', () => {
  describe('create', () => {
    it('creates a key in pending state', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });

      expect(key.status).toBe('pending');
      expect(key.secretName).toBe('test-secret');
      expect(key.encryptedMaterial).toBe('material');
    });

    it('creates a key with validUntil and metadata', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);
      const validUntil = new Date('2025-01-01');

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
        validUntil,
        metadata: { source: 'test' },
      });

      expect(key.validUntil).toEqual(validUntil);
      expect(key.metadata).toEqual({ source: 'test' });
    });

    it('logs creation when logger is provided', async () => {
      const logger: Logger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, logger);

      await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });

      expect(logger.info).toHaveBeenCalledWith('Key created', expect.any(Object));
    });
  });

  describe('activate', () => {
    it('activates a pending key', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });

      const activated = await manager.activate('test-secret', key.keyId);
      expect(activated.status).toBe('active');
      expect(activated.rotatedAt).toBeInstanceOf(Date);
    });

    it('expires the previous active key', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key1 = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material-1',
        format: 'base64',
      });
      await manager.activate('test-secret', key1.keyId);

      const key2 = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material-2',
        format: 'base64',
      });
      await manager.activate('test-secret', key2.keyId);

      const oldKey = await store.get('test-secret', key1.keyId);
      expect(oldKey?.status).toBe('expired');
    });

    it('throws when key not found', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      await expect(manager.activate('test-secret', 'missing')).rejects.toThrow('Key not found');
    });

    it('throws when key is not pending', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });
      await manager.activate('test-secret', key.keyId);

      await expect(manager.activate('test-secret', key.keyId)).rejects.toThrow(
        "Cannot activate key in 'active' state",
      );
    });
  });

  describe('expire', () => {
    it('expires an active key', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });
      await manager.activate('test-secret', key.keyId);

      const expired = await manager.expire('test-secret', key.keyId);
      expect(expired.status).toBe('expired');
      expect(expired.validUntil).toBeInstanceOf(Date);
    });

    it('throws when key not found', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      await expect(manager.expire('test-secret', 'missing')).rejects.toThrow('Key not found');
    });

    it('throws when key is revoked', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });
      await manager.revoke('test-secret', key.keyId);

      await expect(manager.expire('test-secret', key.keyId)).rejects.toThrow(
        "Cannot expire key in 'revoked' state",
      );
    });
  });

  describe('revoke', () => {
    it('revokes an active key', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });
      await manager.activate('test-secret', key.keyId);

      const revoked = await manager.revoke('test-secret', key.keyId, 'rotation_complete');
      expect(revoked.status).toBe('revoked');
      expect(revoked.revokedAt).toBeInstanceOf(Date);
      expect(revoked.metadata?.revokeReason).toBe('rotation_complete');
    });

    it('is idempotent', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });
      await manager.revoke('test-secret', key.keyId);

      const revokedAgain = await manager.revoke('test-secret', key.keyId);
      expect(revokedAgain.status).toBe('revoked');
    });

    it('throws when key not found', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      await expect(manager.revoke('test-secret', 'missing')).rejects.toThrow('Key not found');
    });
  });

  describe('markFailed', () => {
    it('marks a pending key as failed', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });

      const failed = await manager.markFailed('test-secret', key.keyId, 'Provider timeout');
      expect(failed.status).toBe('failed');
      expect(failed.metadata?.failureReason).toBe('Provider timeout');
    });

    it('can mark an active key as failed (e.g., after activate succeeded but completion failed)', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });
      await manager.activate('test-secret', key.keyId);

      const failed = await manager.markFailed('test-secret', key.keyId, 'complete-failed');
      expect(failed.status).toBe('failed');
      expect(failed.metadata?.previousStatus).toBe('active');
      expect(failed.metadata?.failureReason).toBe('complete-failed');
    });

    it('is a no-op for already-terminal keys', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });
      await manager.markFailed('test-secret', key.keyId, 'first');
      const second = await manager.markFailed('test-secret', key.keyId, 'second');
      expect(second.status).toBe('failed');
      expect(second.metadata?.failureReason).toBe('first');
    });

    it('throws when key not found', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      await expect(manager.markFailed('test-secret', 'missing', 'error')).rejects.toThrow(
        'Key not found',
      );
    });
  });

  describe('getState', () => {
    it('returns the full rotation state', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      const key1 = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material-1',
        format: 'base64',
      });
      await manager.activate('test-secret', key1.keyId);

      const key2 = await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material-2',
        format: 'base64',
      });

      const state = await manager.getState('test-secret');
      expect(state.activeKey?.keyId).toBe(key1.keyId);
      expect(state.pendingKeys).toHaveLength(1);
      expect(state.pendingKeys[0]?.keyId).toBe(key2.keyId);
      expect(state.rotationCount).toBe(1);
    });

    it('returns null activeKey when no active key exists', async () => {
      const store = new InMemoryKeyStore();
      const manager = new KeyLifecycleManager(store, undefined);

      await manager.create({
        secretName: 'test-secret',
        encryptedMaterial: 'material',
        format: 'base64',
      });

      const state = await manager.getState('test-secret');
      expect(state.activeKey).toBeNull();
      expect(state.pendingKeys).toHaveLength(1);
    });
  });
});
