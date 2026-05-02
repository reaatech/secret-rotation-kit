/**
 * Input validation utilities for rotation operations.
 *
 * All public-facing API inputs should be validated through these functions
 * to prevent injection, overflow, or unexpected behavior.
 */

const SECRET_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const MAX_METADATA_KEYS = 50;
const MAX_METADATA_DEPTH = 5;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a secret name against the allowed pattern.
 *
 * Rules:
 * - 1-128 characters
 * - Starts with alphanumeric
 * - Contains only alphanumeric, dots, underscores, hyphens
 */
export function validateSecretName(name: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof name !== 'string') {
    errors.push(`Secret name must be a string, got ${typeof name}`);
    return { valid: false, errors };
  }

  if (name.length === 0) {
    errors.push('Secret name must not be empty');
    return { valid: false, errors };
  }

  if (name.length > 128) {
    errors.push(`Secret name must be at most 128 characters, got ${name.length}`);
  }

  if (!SECRET_NAME_PATTERN.test(name)) {
    errors.push(
      'Secret name must start with alphanumeric and contain only alphanumeric, dots, underscores, or hyphens',
    );
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate metadata object size and depth to prevent abuse.
 */
export function validateMetadata(metadata: unknown): ValidationResult {
  const errors: string[] = [];

  if (metadata === undefined || metadata === null) {
    return { valid: true, errors: [] };
  }

  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    errors.push('Metadata must be a plain object');
    return { valid: false, errors };
  }

  try {
    checkObjectDepth(metadata as Record<string, unknown>, MAX_METADATA_DEPTH, errors);
  } catch {
    errors.push('Invalid metadata structure');
  }

  const keyCount = Object.keys(metadata as Record<string, unknown>).length;
  if (keyCount > MAX_METADATA_KEYS) {
    errors.push(`Metadata must have at most ${MAX_METADATA_KEYS} keys, got ${keyCount}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a rotation interval (must be positive integer).
 */
export function validateInterval(intervalMs: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof intervalMs !== 'number' || !Number.isFinite(intervalMs)) {
    errors.push(`Interval must be a finite number, got ${typeof intervalMs}`);
    return { valid: false, errors };
  }

  if (intervalMs <= 0) {
    errors.push(`Interval must be positive, got ${intervalMs}`);
  }

  if (intervalMs < 1000) {
    errors.push(`Interval must be at least 1000ms (1 second), got ${intervalMs}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a coverage ratio (0–1).
 */
export function validateCoverage(coverage: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof coverage !== 'number' || !Number.isFinite(coverage)) {
    errors.push(`Coverage must be a finite number, got ${typeof coverage}`);
    return { valid: false, errors };
  }

  if (coverage < 0 || coverage > 1) {
    errors.push(`Coverage must be between 0 and 1, got ${coverage}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Assert validation passes; throws on failure.
 */
export function assertValid(result: ValidationResult, context?: string): void {
  if (!result.valid) {
    const prefix = context ? `${context}: ` : '';
    throw new ValidationError(`${prefix}${result.errors.join('; ')}`);
  }
}

function checkObjectDepth(
  obj: Record<string, unknown>,
  maxDepth: number,
  errors: string[],
  depth = 0,
  visited: WeakSet<object> = new WeakSet(),
): void {
  if (depth > maxDepth) {
    errors.push(`Metadata exceeds maximum depth of ${maxDepth}`);
    return;
  }
  if (visited.has(obj)) {
    return;
  }
  visited.add(obj);
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      checkObjectDepth(value as Record<string, unknown>, maxDepth, errors, depth + 1, visited);
    }
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
