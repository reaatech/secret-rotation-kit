import { describe, expect, it } from 'vitest';
import {
  CryptographicKeyGenerator,
  generateEncryptionKey,
  isValidEncryptionKey,
} from './crypto-key-generator.js';

describe('CryptographicKeyGenerator', () => {
  describe('generate', () => {
    it('generates a key with default format (base64)', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });

      expect(key.keyId).toBeDefined();
      expect(key.secretName).toBe('test-secret');
      expect(key.format).toBe('base64');
      expect(key.status).toBe('pending');
      expect(key.encryptedMaterial).toBeTruthy();
      expect(key.createdAt).toBeInstanceOf(Date);
      expect(key.validFrom).toBeInstanceOf(Date);
    });

    it('generates keys in different formats', async () => {
      const generator = new CryptographicKeyGenerator();
      const formats = ['base64', 'hex', 'raw'] as const;

      for (const format of formats) {
        const key = await generator.generate({
          secretName: 'test-secret',
          format,
        });
        expect(key.format).toBe(format);
        expect(key.encryptedMaterial.length).toBeGreaterThan(0);
      }
    });

    it('generates PEM formatted key', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({
        secretName: 'test-secret',
        format: 'pem',
      });

      expect(key.format).toBe('pem');
      expect(key.encryptedMaterial).toContain('BEGIN SECRET KEY');
      expect(key.encryptedMaterial).toContain('END SECRET KEY');
    });

    it('attaches metadata', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({
        secretName: 'test-secret',
        metadata: { source: 'unit-test' },
      });

      expect(key.metadata).toEqual({ source: 'unit-test' });
    });

    it('generates unique key IDs', async () => {
      const generator = new CryptographicKeyGenerator();
      const key1 = await generator.generate({ secretName: 'test-secret' });
      const key2 = await generator.generate({ secretName: 'test-secret' });

      expect(key1.keyId).not.toBe(key2.keyId);
    });
  });

  describe('validate', () => {
    it('returns true for a valid key', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      expect(generator.validate(key)).toBe(true);
    });

    it('returns false for missing keyId', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      expect(generator.validate({ ...key, keyId: '' })).toBe(false);
    });

    it('returns false for invalid format', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      expect(generator.validate({ ...key, format: 'invalid' as 'base64' })).toBe(false);
    });

    it('returns false for expired validUntil', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      expect(
        generator.validate({
          ...key,
          validUntil: new Date(Date.now() - 1000),
        }),
      ).toBe(false);
    });

    it('returns false for missing secretName', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      expect(generator.validate({ ...key, secretName: '' })).toBe(false);
    });

    it('returns false for missing encryptedMaterial', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      expect(generator.validate({ ...key, encryptedMaterial: '' })).toBe(false);
    });

    it('returns false for invalid createdAt', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      expect(generator.validate({ ...key, createdAt: 'not-a-date' as unknown as Date })).toBe(
        false,
      );
    });
  });

  describe('generate with invalid format', () => {
    it('throws on unsupported format', async () => {
      const generator = new CryptographicKeyGenerator();
      await expect(
        generator.generate({
          secretName: 'test-secret',
          format: 'invalid' as 'base64',
        }),
      ).rejects.toThrow('Unsupported key format');
    });

    it('throws on unsupported format', async () => {
      const generator = new CryptographicKeyGenerator();
      await expect(
        generator.generate({
          secretName: 'test-secret',
          format: 'invalid' as 'base64',
        }),
      ).rejects.toThrow('Unsupported key format');
    });
  });

  describe('encrypt / decrypt round-trip', () => {
    it('successfully encrypts and decrypts a key', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      const encryptionKey = generateEncryptionKey();

      const encrypted = await generator.encrypt(key, encryptionKey);
      expect(encrypted.encryptedMaterial).not.toBe(key.encryptedMaterial);
      expect(encrypted.encryptedMaterial).toContain(':');

      const decrypted = await generator.decrypt(encrypted, encryptionKey);
      expect(decrypted.encryptedMaterial).toBe(key.encryptedMaterial);
    });

    it('throws on wrong encryption key', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      const encryptionKey = generateEncryptionKey();
      const wrongKey = generateEncryptionKey();

      const encrypted = await generator.encrypt(key, encryptionKey);
      await expect(generator.decrypt(encrypted, wrongKey)).rejects.toThrow();
    });

    it('throws on tampered ciphertext', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      const encryptionKey = generateEncryptionKey();

      const encrypted = await generator.encrypt(key, encryptionKey);
      const parts = encrypted.encryptedMaterial.split(':');
      // Tamper with the ciphertext
      parts[1] = 'tampered';
      const tampered = { ...encrypted, encryptedMaterial: parts.join(':') };

      await expect(generator.decrypt(tampered, encryptionKey)).rejects.toThrow();
    });

    it('throws on invalid auth tag length', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      const encryptionKey = generateEncryptionKey();

      const encrypted = await generator.encrypt(key, encryptionKey);
      const parts = encrypted.encryptedMaterial.split(':');
      // Replace auth tag with a short one
      parts[2] = 'abcd';
      const tampered = { ...encrypted, encryptedMaterial: parts.join(':') };

      await expect(generator.decrypt(tampered, encryptionKey)).rejects.toThrow('auth tag length');
    });

    it('throws on invalid IV length', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      const encryptionKey = generateEncryptionKey();

      const encrypted = await generator.encrypt(key, encryptionKey);
      const parts = encrypted.encryptedMaterial.split(':');
      // Replace IV with a short one
      parts[0] = 'abcd';
      const tampered = { ...encrypted, encryptedMaterial: parts.join(':') };

      await expect(generator.decrypt(tampered, encryptionKey)).rejects.toThrow('IV length');
    });

    it('throws on invalid encrypted material format', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      const encryptionKey = generateEncryptionKey();

      const tampered = { ...key, encryptedMaterial: 'only-two:parts' };
      await expect(generator.decrypt(tampered, encryptionKey)).rejects.toThrow('expected 3 parts');
    });

    it('throws on invalid encryption key length during encrypt', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });

      await expect(generator.encrypt(key, 'short')).rejects.toThrow('32 bytes');
    });

    it('throws on invalid encryption key length during decrypt', async () => {
      const generator = new CryptographicKeyGenerator();
      const key = await generator.generate({ secretName: 'test-secret' });
      const encryptionKey = generateEncryptionKey();

      const encrypted = await generator.encrypt(key, encryptionKey);
      await expect(generator.decrypt(encrypted, 'short')).rejects.toThrow('32 bytes');
    });
  });
});

describe('generateEncryptionKey', () => {
  it('produces a valid base64-encoded 32-byte key', () => {
    const key = generateEncryptionKey();
    expect(isValidEncryptionKey(key)).toBe(true);
  });

  it('generates unique keys', () => {
    const key1 = generateEncryptionKey();
    const key2 = generateEncryptionKey();
    expect(key1).not.toBe(key2);
  });
});

describe('isValidEncryptionKey', () => {
  it('returns false for invalid keys', () => {
    expect(isValidEncryptionKey('not-base64!!!')).toBe(false);
    expect(isValidEncryptionKey('')).toBe(false);
    expect(isValidEncryptionKey('short')).toBe(false);
  });
});
