/**
 * Structured error hierarchy for rotation operations.
 */

/** Base error for all rotation-related failures. */
export class RotationError extends Error {
  constructor(
    message: string,
    public readonly stage?: string,
    public readonly canRetry = false,
  ) {
    super(message);
    this.name = 'RotationError';
  }
}

/** Provider-level failure (AWS, GCP, Vault API error). */
export class ProviderError extends RotationError {
  constructor(
    message: string,
    public readonly providerName: string,
    stage?: string,
    canRetry = false,
  ) {
    super(message, stage, canRetry);
    this.name = 'ProviderError';
  }
}

/** Propagation failure (secret not reaching consumers). */
export class PropagationError extends RotationError {
  constructor(message: string, stage?: string, canRetry = true) {
    super(message, stage, canRetry);
    this.name = 'PropagationError';
  }
}

/** Verification failure (consumers not using new key). */
export class VerificationError extends RotationError {
  constructor(message: string, stage?: string, canRetry = true) {
    super(message, stage, canRetry);
    this.name = 'VerificationError';
  }
}

/** Timeout failure (operation exceeded deadline). */
export class TimeoutError extends RotationError {
  constructor(message: string, stage?: string, canRetry = true) {
    super(message, stage, canRetry);
    this.name = 'TimeoutError';
  }
}

/** Configuration validation failure. */
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}
