import { describe, expect, it } from 'vitest';
import {
  PropagationError,
  ProviderError,
  RotationError,
  TimeoutError,
  VerificationError,
} from './errors.js';

describe('RotationError hierarchy', () => {
  describe('RotationError', () => {
    it('sets message and properties', () => {
      const err = new RotationError('something failed', 'verification', true);
      expect(err.message).toBe('something failed');
      expect(err.stage).toBe('verification');
      expect(err.canRetry).toBe(true);
      expect(err.name).toBe('RotationError');
    });

    it('defaults canRetry to false', () => {
      const err = new RotationError('fail');
      expect(err.canRetry).toBe(false);
      expect(err.stage).toBeUndefined();
    });
  });

  describe('ProviderError', () => {
    it('includes provider name', () => {
      const err = new ProviderError('aws down', 'aws-secrets-manager', 'propagation', true);
      expect(err.providerName).toBe('aws-secrets-manager');
      expect(err.name).toBe('ProviderError');
    });
  });

  describe('PropagationError', () => {
    it('defaults canRetry to true', () => {
      const err = new PropagationError('not propagated');
      expect(err.canRetry).toBe(true);
      expect(err.name).toBe('PropagationError');
    });
  });

  describe('VerificationError', () => {
    it('defaults canRetry to true', () => {
      const err = new VerificationError('verification failed');
      expect(err.canRetry).toBe(true);
      expect(err.name).toBe('VerificationError');
    });
  });

  describe('TimeoutError', () => {
    it('defaults canRetry to true', () => {
      const err = new TimeoutError('timed out');
      expect(err.canRetry).toBe(true);
      expect(err.name).toBe('TimeoutError');
    });
  });
});
