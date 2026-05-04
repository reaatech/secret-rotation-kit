import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SecretKey } from '@reaatech/secret-rotation-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateEncryptionKey } from './crypto-key-generator.js';
import { FileSystemKeyStore } from './filesystem-key-store.js';

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

describe('FileSystemKeyStore', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'srk-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('unencrypted', () => {
    it('saves and retrieves a key', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      const key = createKey('secret-1', 'key-1', 'pending');

      await store.save(key);
      const retrieved = await store.get('secret-1', 'key-1');

      expect(retrieved?.keyId).toBe('key-1');
      expect(retrieved?.secretName).toBe('secret-1');
    });

    it('returns null for missing key', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      const retrieved = await store.get('secret-1', 'key-1');
      expect(retrieved).toBeNull();
    });

    it('returns empty array when listing non-existent directory', async () => {
      const store = new FileSystemKeyStore({ baseDir: `${tempDir}/does-not-exist` });
      const keys = await store.list();
      expect(keys).toEqual([]);
    });

    it('updates an existing key', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      const key = createKey('secret-1', 'key-1', 'pending');
      await store.save(key);

      const updated = { ...key, status: 'active' as const };
      await store.update(updated);

      const retrieved = await store.get('secret-1', 'key-1');
      expect(retrieved?.status).toBe('active');
    });

    it('deletes a key', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      await store.save(createKey('secret-1', 'key-1', 'pending'));
      await store.delete('secret-1', 'key-1');

      expect(await store.get('secret-1', 'key-1')).toBeNull();
    });

    it('lists keys for a secret', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      await store.save(createKey('secret-1', 'key-1', 'pending'));
      await store.save(createKey('secret-1', 'key-2', 'active'));

      const keys = await store.list('secret-1');
      expect(keys).toHaveLength(2);
    });

    it('lists all keys across secrets', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      await store.save(createKey('secret-1', 'key-1', 'pending'));
      await store.save(createKey('secret-2', 'key-2', 'active'));

      const keys = await store.list();
      expect(keys).toHaveLength(2);
    });

    it('handles concurrent saves', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      const promises: Promise<void>[] = [];

      for (let i = 0; i < 20; i++) {
        promises.push(store.save(createKey('secret-1', `key-${i}`, 'pending')));
      }

      await Promise.all(promises);
      const keys = await store.list('secret-1');
      expect(keys).toHaveLength(20);
    });
  });

  describe('encrypted', () => {
    it('saves and retrieves encrypted keys', async () => {
      const encryptionKey = generateEncryptionKey();
      const store = new FileSystemKeyStore({ baseDir: tempDir, encryptionKey });
      const key = createKey('secret-1', 'key-1', 'pending');

      await store.save(key);
      const retrieved = await store.get('secret-1', 'key-1');

      expect(retrieved?.keyId).toBe('key-1');
    });

    it('file contents are encrypted on disk', async () => {
      const encryptionKey = generateEncryptionKey();
      const store = new FileSystemKeyStore({ baseDir: tempDir, encryptionKey });
      const key = createKey('secret-1', 'key-1', 'pending');

      await store.save(key);

      // Read raw file contents (filename includes a hash suffix)
      const { readFile, readdir } = await import('node:fs/promises');
      const entries = await readdir(tempDir);
      const fileName = entries.find((e) => e.startsWith('secret-1.') && e.endsWith('.json'));
      expect(fileName).toBeDefined();
      const raw = await readFile(join(tempDir, fileName as string));

      // Should not contain plaintext
      expect(raw.toString('utf-8')).not.toContain('test-material');
    });

    it('throws on wrong encryption key', async () => {
      const encryptionKey = generateEncryptionKey();
      const store = new FileSystemKeyStore({ baseDir: tempDir, encryptionKey });
      const key = createKey('secret-1', 'key-1', 'pending');

      await store.save(key);

      const wrongStore = new FileSystemKeyStore({
        baseDir: tempDir,
        encryptionKey: generateEncryptionKey(),
      });

      await expect(wrongStore.get('secret-1', 'key-1')).rejects.toThrow();
    });

    it('throws on corrupted encrypted file', async () => {
      const encryptionKey = generateEncryptionKey();
      const store = new FileSystemKeyStore({ baseDir: tempDir, encryptionKey });
      const key = createKey('secret-1', 'key-1', 'pending');

      await store.save(key);

      // Corrupt the file by truncating it. Filenames now include a hash suffix, so
      // look up the actual filename by listing the directory.
      const { writeFile, readdir } = await import('node:fs/promises');
      const entries = await readdir(tempDir);
      const fileName = entries.find((e) => e.startsWith('secret-1.') && e.endsWith('.json'));
      expect(fileName).toBeDefined();
      await writeFile(`${tempDir}/${fileName}`, Buffer.from('short'));

      await expect(store.get('secret-1', 'key-1')).rejects.toThrow();
    });

    it('throws on invalid encryption key length during save', async () => {
      const store = new FileSystemKeyStore({
        baseDir: tempDir,
        encryptionKey: 'd29uZw==', // 4 bytes, not 32
      });
      const key = createKey('secret-1', 'key-1', 'pending');

      await expect(store.save(key)).rejects.toThrow('32 bytes');
    });

    it('throws on invalid encryption key length during read', async () => {
      const encryptionKey = generateEncryptionKey();
      const store = new FileSystemKeyStore({ baseDir: tempDir, encryptionKey });
      const key = createKey('secret-1', 'key-1', 'pending');

      await store.save(key);

      const badStore = new FileSystemKeyStore({
        baseDir: tempDir,
        encryptionKey: 'd29uZw==',
      });

      await expect(badStore.get('secret-1', 'key-1')).rejects.toThrow('32 bytes');
    });
  });

  describe('sanitization', () => {
    it('sanitizes secret names with special characters', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      const key = createKey('secret/with\\chars', 'key-1', 'pending');

      await store.save(key);
      const retrieved = await store.get('secret/with\\chars', 'key-1');
      expect(retrieved?.keyId).toBe('key-1');
    });

    it('does not collide between names that sanitize to the same string', async () => {
      const store = new FileSystemKeyStore({ baseDir: tempDir });
      const a = createKey('foo/bar', 'key-a', 'active');
      const b = createKey('foo_bar', 'key-b', 'active');

      await store.save(a);
      await store.save(b);

      expect((await store.get('foo/bar', 'key-a'))?.keyId).toBe('key-a');
      expect((await store.get('foo_bar', 'key-b'))?.keyId).toBe('key-b');
      expect(await store.get('foo/bar', 'key-b')).toBeNull();
      expect(await store.get('foo_bar', 'key-a')).toBeNull();
    });
  });
});
