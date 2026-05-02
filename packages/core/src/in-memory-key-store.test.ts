import type { SecretKey } from '@reaatech/secret-rotation-types';
import { describe, expect, it } from 'vitest';
import { InMemoryKeyStore } from './in-memory-key-store.js';

function createKey(secretName: string, keyId: string, status: SecretKey['status']): SecretKey {
  return {
    keyId,
    secretName,
    encryptedMaterial: 'test-material',
    format: 'base64',
    validFrom: new Date('2024-01-01'),
    status,
    createdAt: new Date('2024-01-01'),
  };
}

describe('InMemoryKeyStore', () => {
  describe('save / get', () => {
    it('saves and retrieves a key', async () => {
      const store = new InMemoryKeyStore();
      const key = createKey('secret-1', 'key-1', 'pending');

      await store.save(key);
      const retrieved = await store.get('secret-1', 'key-1');

      expect(retrieved).toEqual(key);
    });

    it('returns null for missing key', async () => {
      const store = new InMemoryKeyStore();
      const retrieved = await store.get('secret-1', 'key-1');
      expect(retrieved).toBeNull();
    });

    it('returns empty array for getValid on empty store', async () => {
      const store = new InMemoryKeyStore();
      const valid = await store.getValid('secret-1');
      expect(valid).toEqual([]);
    });

    it('returns empty array for list on empty store', async () => {
      const store = new InMemoryKeyStore();
      const keys = await store.list('secret-1');
      expect(keys).toEqual([]);
    });
  });

  describe('getActive', () => {
    it('returns the newest active key', async () => {
      const store = new InMemoryKeyStore();
      const key1 = createKey('secret-1', 'key-1', 'active');
      const key2 = {
        ...createKey('secret-1', 'key-2', 'active'),
        createdAt: new Date('2024-02-01'),
      };

      await store.save(key1);
      await store.save(key2);

      const active = await store.getActive('secret-1');
      expect(active?.keyId).toBe('key-2');
    });

    it('returns null when no active key exists', async () => {
      const store = new InMemoryKeyStore();
      const retrieved = await store.getActive('secret-1');
      expect(retrieved).toBeNull();
    });
  });

  describe('getValid', () => {
    it('returns only valid keys', async () => {
      const store = new InMemoryKeyStore();
      await store.save(createKey('secret-1', 'key-1', 'active'));
      await store.save(createKey('secret-1', 'key-2', 'pending'));
      await store.save(createKey('secret-1', 'key-3', 'revoked'));
      await store.save(createKey('secret-1', 'key-4', 'failed'));

      const valid = await store.getValid('secret-1');
      expect(valid.map((k) => k.keyId)).toEqual(['key-1', 'key-2']);
    });

    it('excludes expired keys', async () => {
      const store = new InMemoryKeyStore();
      const key = {
        ...createKey('secret-1', 'key-1', 'active'),
        validUntil: new Date('2024-01-01'),
      };
      await store.save(key);

      const valid = await store.getValid('secret-1', new Date('2024-06-01'));
      expect(valid).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('updates an existing key', async () => {
      const store = new InMemoryKeyStore();
      const key = createKey('secret-1', 'key-1', 'pending');
      await store.save(key);

      const updated = { ...key, status: 'active' as const };
      await store.update(updated);

      const retrieved = await store.get('secret-1', 'key-1');
      expect(retrieved?.status).toBe('active');
    });

    it('throws when updating a non-existent key', async () => {
      const store = new InMemoryKeyStore();
      const key = createKey('secret-1', 'key-1', 'pending');

      await expect(store.update(key)).rejects.toThrow('Key not found');
    });
  });

  describe('delete', () => {
    it('deletes a key', async () => {
      const store = new InMemoryKeyStore();
      await store.save(createKey('secret-1', 'key-1', 'pending'));
      await store.delete('secret-1', 'key-1');

      const retrieved = await store.get('secret-1', 'key-1');
      expect(retrieved).toBeNull();
    });
  });

  describe('list', () => {
    it('lists keys for a specific secret', async () => {
      const store = new InMemoryKeyStore();
      await store.save(createKey('secret-1', 'key-1', 'pending'));
      await store.save(createKey('secret-1', 'key-2', 'active'));
      await store.save(createKey('secret-2', 'key-3', 'pending'));

      const keys = await store.list('secret-1');
      expect(keys).toHaveLength(2);
    });

    it('lists all keys when no secret is specified', async () => {
      const store = new InMemoryKeyStore();
      await store.save(createKey('secret-1', 'key-1', 'pending'));
      await store.save(createKey('secret-2', 'key-2', 'active'));

      const keys = await store.list();
      expect(keys).toHaveLength(2);
    });
  });

  describe('concurrency', () => {
    it('handles concurrent saves without data loss', async () => {
      const store = new InMemoryKeyStore();
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 100; i++) {
        promises.push(store.save(createKey('secret-1', `key-${i}`, 'pending')));
      }

      await Promise.all(promises);
      const keys = await store.list('secret-1');
      expect(keys).toHaveLength(100);
    });

    it('handles concurrent reads and writes', async () => {
      const store = new InMemoryKeyStore();
      await store.save(createKey('secret-1', 'key-active', 'active'));

      const promises: Promise<unknown>[] = [];
      for (let i = 0; i < 50; i++) {
        promises.push(store.save(createKey('secret-1', `key-${i}`, 'pending')));
        promises.push(store.getActive('secret-1'));
        promises.push(store.getValid('secret-1'));
      }

      await Promise.all(promises);
      const keys = await store.list('secret-1');
      expect(keys).toHaveLength(51);
    });
  });

  describe('snapshot', () => {
    it('returns a copy of the entire store', async () => {
      const store = new InMemoryKeyStore();
      await store.save(createKey('secret-1', 'key-1', 'pending'));
      await store.save(createKey('secret-2', 'key-2', 'active'));

      const snapshot = store.snapshot();
      expect(Object.keys(snapshot)).toHaveLength(2);
      expect(snapshot['secret-1']).toHaveLength(1);
      expect(snapshot['secret-2']).toHaveLength(1);
    });
  });

  describe('clear', () => {
    it('removes all keys', async () => {
      const store = new InMemoryKeyStore();
      await store.save(createKey('secret-1', 'key-1', 'pending'));
      await store.save(createKey('secret-2', 'key-2', 'pending'));

      await store.clear();
      expect(await store.list()).toHaveLength(0);
    });
  });
});
