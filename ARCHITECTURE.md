# Secret Rotation Kit - Architecture Specification

## System Overview

The Secret Rotation Kit is designed as a modular, extensible system that orchestrates zero-downtime secret rotation across multiple providers. The architecture follows clean code principles with clear separation of concerns, provider abstraction, and event-driven design.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Application Layer                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  RotationManager│  │  ConsumerRegistry│ │  SidecarServer  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Core Services Layer                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ KeyRotator      │  │PropagationVerifier││KeyWindowManager │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │RotationScheduler│  │RollbackManager  │  │EventEmitter     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Provider Layer                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ AWSProvider     │  │ GCPProvider     │  │ VaultProvider   │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                    ┌─────────────────┐                         │
│                    │ ProviderFactory │                         │
│                    └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Infrastructure Layer                        │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  LoggerService  │  │  MetricsService │  │  ConfigService  │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Type System

#### Secret Key
```typescript
export interface SecretKey {
  // Unique identifier for this key version
  keyId: string;
  
  // Secret identifier (e.g., "database-password")
  secretName: string;
  
  // Encrypted key material
  encryptedMaterial: string;
  
  // Key format (e.g., "base64", "hex", "pem")
  format: KeyFormat;
  
  // Validity window
  validFrom: Date;
  validUntil?: Date;
  
  // Key status
  status: KeyStatus;
  
  // Metadata
  createdAt: Date;
  rotatedAt?: Date;
  revokedAt?: Date;
  metadata?: Record<string, unknown>;
}

export type KeyStatus = 
  | 'pending'      // Being propagated
  | 'active'       // Currently in use
  | 'expired'      // Past validUntil, in grace period
  | 'revoked'      // No longer valid
  | 'failed';      // Propagation failed

export type KeyFormat = 'base64' | 'hex' | 'pem' | 'raw';
```

#### Rotation State
```typescript
export interface RotationState {
  // Secret identifier
  secretName: string;
  
  // Current active key
  activeKey: SecretKey | null;
  
  // Keys being propagated
  pendingKeys: SecretKey[];
  
  // Expired keys in grace period
  expiredKeys: SecretKey[];
  
  // Revoked keys (for audit)
  revokedKeys: SecretKey[];
  
  // Rotation metadata
  lastRotationAt?: Date;
  nextRotationAt?: Date;
  rotationCount: number;
  
  // Provider state
  providerState?: ProviderState;
}

export interface ProviderState {
  // Provider-specific version identifier
  versionId?: string;
  versionStages?: string[];
  
  // Provider-specific metadata
  metadata?: Record<string, unknown>;
}
```

#### Rotation Events
```typescript
export type RotationEvent = 
  | KeyGeneratedEvent
  | KeyPropagatedEvent
  | KeyVerifiedEvent
  | KeyActivatedEvent
  | KeyRevokedEvent
  | RotationFailedEvent;

export interface KeyGeneratedEvent {
  type: 'key_generated';
  secretName: string;
  keyId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface KeyPropagatedEvent {
  type: 'key_propagated';
  secretName: string;
  keyId: string;
  provider: string;
  timestamp: Date;
  propagationTime: number;
}

export interface KeyVerifiedEvent {
  type: 'key_verified';
  secretName: string;
  keyId: string;
  consumerCount: number;
  verificationTime: number;
  timestamp: Date;
}

export interface KeyActivatedEvent {
  type: 'key_activated';
  secretName: string;
  keyId: string;
  previousKeyId?: string;
  timestamp: Date;
}

export interface KeyRevokedEvent {
  type: 'key_revoked';
  secretName: string;
  keyId: string;
  reason: string;
  timestamp: Date;
}

export interface RotationFailedEvent {
  type: 'rotation_failed';
  secretName: string;
  keyId?: string;
  error: string;
  stage: RotationStage;
  timestamp: Date;
  canRetry: boolean;
}

export type RotationStage = 
  | 'generation'
  | 'propagation'
  | 'verification'
  | 'activation'
  | 'revocation';
```

#### Supporting Types

```typescript
export interface RotationRequest {
  secretName: string;
  keyFormat?: KeyFormat;
  force?: boolean;
  verificationTimeout?: number;
  minConsumerCoverage?: number;
  metadata?: Record<string, unknown>;
}

export interface RotationResult {
  success: boolean;
  rotationId: string;
  newKeyId: string;
  duration: number;
  timestamp: Date;
}

export interface RotationSession {
  sessionId: string;
  secretName: string;
  provider: string;
  state: ProviderState;
  startedAt: Date;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface Consumer {
  id: string;
  endpoint: string;
  interestedSecrets: string[];
  groups?: string[];
  capabilities: ConsumerCapabilities;
  auth?: ConsumerAuthConfig;
}

export interface ConsumerCapabilities {
  supportsVersionCheck: boolean;
  supportsHealthCheck: boolean;
  supportsCallback: boolean;
}

export interface ConsumerAuthConfig {
  type: 'bearer' | 'mtls' | 'api-key';
  credentials: Record<string, string>;
}

export interface VerificationResult {
  success: boolean;
  consumerCount: number;
  verifiedCount: number;
  coverage: number;
  duration: number;
  failures: ConsumerVerificationFailure[];
  canRetry: boolean;
  metadata?: Record<string, unknown>;
}

export interface ConsumerVerificationResult {
  consumerId: string;
  success: boolean;
  currentVersion?: string;
  verifiedAt?: Date;
  error?: string;
  canRetry: boolean;
}

export interface ConsumerVerificationFailure {
  consumerId: string;
  reason: string;
  canRetry: boolean;
}

export interface VerificationOptions {
  timeout?: number;
  perConsumerTimeout?: number;
  minConsumerCoverage?: number;
  minNewKeyUsage?: number;
  errorThreshold?: number;
  retryPolicy?: RetryPolicy;
  metadata?: Record<string, unknown>;
}

export interface VerificationStatus {
  state: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  checkedConsumers: string[];
  failedConsumers: string[];
  startedAt: Date;
  estimatedCompletionAt?: Date;
}

export interface DeleteOptions {
  force?: boolean;
  permanent?: boolean;
}

export interface SecretVersion {
  versionId: string;
  createdAt: Date;
  stages?: string[];
  metadata?: Record<string, unknown>;
}

export interface ProviderHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency: number;
  lastChecked: Date;
  message?: string;
}

export interface ProviderCapabilities {
  supportsRotation: boolean;
  supportsVersioning: boolean;
  supportsLabels: boolean;
  maxVersions?: number;
}
```

### 2. Application Layer

#### Rotation Manager

The `RotationManager` is the primary entry point for consumers of the library. It coordinates the entire rotation lifecycle by delegating to core services while maintaining a simple, ergonomic API.

```typescript
export class RotationManager {
  constructor(
    private config: RotationConfig,
    private provider: SecretProvider,
    private keyStore: KeyStore,
    private verifier: PropagationVerifier,
    private scheduler?: RotationScheduler,
    private eventEmitter?: EventEmitter,
    private logger?: Logger
  ) {}

  async rotate(secretName: string, options?: RotationRequest): Promise<RotationResult> {
    const workflow = new RotationWorkflow(
      this.provider,
      this.keyStore,
      this.verifier,
      this.eventEmitter,
      this.logger
    );
    return workflow.executeRotation({ secretName, ...options });
  }

  async start(): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler not configured');
    }
    this.scheduler.on('trigger', (secretName) => this.rotate(secretName));
    await this.scheduler.start();
  }

  async stop(): Promise<void> {
    await this.scheduler?.stop();
  }

  async getState(secretName: string): Promise<RotationState> {
    return {
      secretName,
      activeKey: await this.keyStore.getActive(secretName),
      pendingKeys: (await this.keyStore.list(secretName)).filter(k => k.status === 'pending'),
      expiredKeys: (await this.keyStore.list(secretName)).filter(k => k.status === 'expired'),
      revokedKeys: (await this.keyStore.list(secretName)).filter(k => k.status === 'revoked'),
      rotationCount: 0 // Tracked via metadata
    };
  }
}
```

### 3. Key Management

#### Key Generator
```typescript
export interface KeyGenerator {
  generate(options?: KeyGenerationOptions): Promise<SecretKey>;
  validate(key: SecretKey): boolean;
  encrypt(key: SecretKey, encryptionKey: string): Promise<SecretKey>;
  decrypt(key: SecretKey, encryptionKey: string): Promise<SecretKey>;
}

export class CryptographicKeyGenerator implements KeyGenerator {
  private readonly algorithm: string;
  private readonly keyLength: number;
  
  async generate(options?: KeyGenerationOptions): Promise<SecretKey> {
    // Generate cryptographically secure random bytes
    const keyMaterial = crypto.randomBytes(this.keyLength / 8);
    
    // Format according to specification
    const formattedMaterial = this.formatKey(keyMaterial, options?.format || 'base64');
    
    // Create key with metadata
    return {
      keyId: this.generateKeyId(),
      secretName: options.secretName,
      encryptedMaterial: formattedMaterial,
      format: options?.format || 'base64',
      validFrom: new Date(),
      status: 'pending',
      createdAt: new Date(),
      metadata: options?.metadata
    };
  }
  
  private formatKey(keyMaterial: Buffer, format: KeyFormat): string {
    switch (format) {
      case 'base64':
        return keyMaterial.toString('base64');
      case 'hex':
        return keyMaterial.toString('hex');
      case 'pem':
        return this.toPEM(keyMaterial);
      case 'raw':
        return keyMaterial.toString('latin1');
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
}
```

#### Key Store
```typescript
export interface KeyStore {
  save(key: SecretKey): Promise<void>;
  get(secretName: string, keyId: string): Promise<SecretKey | null>;
  getActive(secretName: string): Promise<SecretKey | null>;
  getValid(secretName: string, at?: Date): Promise<SecretKey[]>;
  update(key: SecretKey): Promise<void>;
  delete(secretName: string, keyId: string): Promise<void>;
  list(secretName?: string): Promise<SecretKey[]>;
}

export class InMemoryKeyStore implements KeyStore {
  private store: Map<string, Map<string, SecretKey>> = new Map();
  private locks: Map<string, Promise<void>> = new Map();
  private lockQueues: Map<string, (() => void)[]> = new Map();

  private async acquireLock(name: string): Promise<void> {
    while (this.locks.has(name)) {
      await this.locks.get(name);
    }
    let resolve: () => void;
    const promise = new Promise<void>((r) => { resolve = r; });
    this.locks.set(name, promise);
    if (!this.lockQueues.has(name)) {
      this.lockQueues.set(name, []);
    }
    this.lockQueues.get(name)!.push(() => resolve!());
  }

  private releaseLock(name: string): void {
    const queue = this.lockQueues.get(name);
    const next = queue?.shift();
    this.locks.delete(name);
    next?.();
  }
  
  async save(key: SecretKey): Promise<void> {
    await this.acquireLock(key.secretName);
    try {
      if (!this.store.has(key.secretName)) {
        this.store.set(key.secretName, new Map());
      }
      this.store.get(key.secretName)!.set(key.keyId, key);
    } finally {
      this.releaseLock(key.secretName);
    }
  }
  
  async getActive(secretName: string): Promise<SecretKey | null> {
    const keys = await this.getValid(secretName);
    if (keys.length === 0) return null;
    
    // Return newest active key
    return keys
      .filter(k => k.status === 'active')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] || null;
  }
}
```

### 3. Provider Adapters

#### Provider Interface

Providers operate in one of two modes:

1. **Library-managed secrets**: The library generates the secret value and pushes it to the provider via `storeSecretValue()`.
2. **Provider-managed secrets**: The provider generates the secret internally (e.g., AWS Lambda rotation). The library only orchestrates version stages via `beginRotation()` / `completeRotation()`.

```typescript
export interface SecretProvider {
  name: string;
  priority: number;
  
  // Secret value operations (used in library-managed mode)
  createSecret(name: string, value: string): Promise<void>;
  getSecret(name: string, version?: string): Promise<SecretValue>;
  storeSecretValue(name: string, value: string, version?: string): Promise<SecretValue>;
  deleteSecret(name: string, options?: DeleteOptions): Promise<void>;
  
  // Version management
  listVersions(name: string): Promise<SecretVersion[]>;
  getVersion(name: string, versionId: string): Promise<SecretValue>;
  deleteVersion(name: string, versionId: string): Promise<void>;
  
  // Rotation support
  supportsRotation(): boolean;
  beginRotation(name: string): Promise<RotationSession>;
  completeRotation(session: RotationSession): Promise<void>;
  cancelRotation(session: RotationSession): Promise<void>;
  
  // Health and capabilities
  health(): Promise<ProviderHealth>;
  capabilities(): ProviderCapabilities;
}

export interface SecretValue {
  value: string;
  versionId: string;
  versionStages?: string[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}
```

#### AWS Secrets Manager Provider
```typescript
export class AWSSecretsProvider implements SecretProvider {
  name = 'aws-secrets-manager';
  priority = 1;
  
  private client: SecretsManagerClient;
  private region: string;
  
  async createSecret(name: string, value: string): Promise<void> {
    const command = new CreateSecretCommand({
      Name: name,
      SecretString: value,
      Description: `Managed by secret-rotation-kit`
    });
    
    await this.client.send(command);
  }
  
  async storeSecretValue(name: string, value: string): Promise<SecretValue> {
    const command = new UpdateSecretCommand({
      SecretId: name,
      SecretString: value
    });
    
    const response = await this.client.send(command);
    
    // AWS automatically creates a new version
    return {
      value: response.SecretString || '',
      versionId: response.VersionId || '',
      createdAt: new Date()
    };
  }
  
  async beginRotation(name: string): Promise<RotationSession> {
    // AWS Secrets Manager has built-in rotation with Lambda
    // We create a new version with a pending stage
    const command = new UpdateSecretCommand({
      SecretId: name,
      SecretString: this.generateTempValue() // Temporary value
    });
    
    const response = await this.client.send(command);
    
    return {
      sessionId: response.VersionId || '',
      secretName: name,
      provider: this.name,
      state: {
        versionId: response.VersionId,
        versionStages: ['AWSPENDING']
      },
      startedAt: new Date()
    };
  }
  
  async completeRotation(session: RotationSession): Promise<void> {
    // Move version from AWSPENDING to AWSCURRENT
    const command = new UpdateSecretVersionStageCommand({
      SecretId: session.secretName,
      VersionStage: 'AWSCURRENT',
      MoveToVersionId: session.state.versionId,
      RemoveFromVersionId: session.state.previousVersionId
    });
    
    await this.client.send(command);
  }
}
```

#### GCP Secret Manager Provider
```typescript
export class GCPSecretProvider implements SecretProvider {
  name = 'gcp-secret-manager';
  priority = 2;
  
  private client: SecretManagerServiceClient;
  private projectId: string;
  
  async createSecret(name: string, value: string): Promise<void> {
    const [secret] = await this.client.createSecret({
      parent: `projects/${this.projectId}`,
      secretId: name,
      secret: {
        replication: {
          automatic: {}
        }
      }
    });
    
    await this.addSecretVersion(name, value);
  }
  
  async storeSecretValue(name: string, value: string): Promise<SecretValue> {
    return await this.addSecretVersion(name, value);
  }
  
  private async addSecretVersion(name: string, value: string): Promise<SecretValue> {
    const [version] = await this.client.addSecretVersion({
      parent: `projects/${this.projectId}/secrets/${name}`,
      payload: {
        data: Buffer.from(value, 'utf-8')
      }
    });
    
    return {
      value: value,
      versionId: version.name || '',
      createdAt: new Date(version.createTime?.toMillis() || Date.now())
    };
  }
  
  async beginRotation(name: string): Promise<RotationSession> {
    // GCP doesn't have built-in rotation stages
    // We use labels to track rotation state
    const tempValue = this.generateTempValue();
    const version = await this.addSecretVersion(name, tempValue);
    
    // Add label to mark as pending
    await this.client.updateSecret({
      secret: {
        name: `projects/${this.projectId}/secrets/${name}`,
        labels: {
          'rotation-status': 'pending',
          'pending-version': version.versionId
        }
      },
      updateMask: { paths: ['labels'] }
    });
    
    return {
      sessionId: version.versionId,
      secretName: name,
      provider: this.name,
      state: {
        versionId: version.versionId,
        metadata: { status: 'pending' }
      },
      startedAt: new Date()
    };
  }
}
```

#### HashiCorp Vault Provider
```typescript
export class VaultProvider implements SecretProvider {
  name = 'vault';
  priority = 3;
  
  private client: VaultClient;
  private mountPath: string;
  
  async createSecret(name: string, value: string): Promise<void> {
    await this.client.write(`${this.mountPath}/data/${name}`, {
      data: { value }
    });
  }
  
  async storeSecretValue(name: string, value: string): Promise<SecretValue> {
    const response = await this.client.write(`${this.mountPath}/data/${name}`, {
      data: { value }
    });
    
    return {
      value: value,
      versionId: response.data.metadata.version.toString(),
      createdAt: new Date(response.data.metadata.created_time),
      metadata: {
        version: response.data.metadata.version,
        deleted: response.data.metadata.deprecated
      }
    };
  }
  
  async beginRotation(name: string): Promise<RotationSession> {
    // Vault KV v2 supports versioning natively
    const tempValue = this.generateTempValue();
    const version = await this.storeSecretValue(name, tempValue);
    
    return {
      sessionId: version.versionId,
      secretName: name,
      provider: this.name,
      state: {
        versionId: version.versionId,
        metadata: { status: 'pending' }
      },
      startedAt: new Date()
    };
  }
  
  async completeRotation(session: RotationSession): Promise<void> {
    // In Vault, the new version is already active
    // We just need to mark it as verified
    await this.client.write(`${this.mountPath}/metadata/${session.secretName}`, {
      cas: 0,
      options: {
        [session.state.versionId]: { metadata: { status: 'verified' } }
      }
    });
  }
}
```

### 4. Rotation Orchestration

#### Rotation Workflow
```typescript
export class RotationWorkflow {
  constructor(
    private keyGenerator: KeyGenerator,
    private provider: SecretProvider,
    private verifier: PropagationVerifier,
    private keyStore: KeyStore,
    private eventEmitter: EventEmitter,
    private logger: Logger
  ) {}
  
  async executeRotation(request: RotationRequest): Promise<RotationResult> {
    const rotationId = this.generateRotationId();
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting rotation', { rotationId, secretName: request.secretName });
      
      // Step 1: Generate new key
      this.logger.debug('Generating new key', { rotationId });
      const newKey = await this.generateNewKey(request, rotationId);
      
      // Step 2: Propagate to provider
      this.logger.debug('Propagating to provider', { rotationId });
      const session = await this.propagateToProvider(request.secretName, newKey, rotationId);
      
      // Step 3: Verify propagation
      this.logger.debug('Verifying propagation', { rotationId });
      const verification = await this.verifyPropagation(session, request, rotationId);
      
      if (!verification.success) {
        throw new VerificationError('Propagation verification failed', verification);
      }
      
      // Step 4: Activate new key
      this.logger.debug('Activating new key', { rotationId });
      await this.activateNewKey(session, rotationId);
      
      // Step 5: Revoke old key (after grace period)
      this.logger.debug('Scheduling old key revocation', { rotationId });
      await this.scheduleOldKeyRevocation(request.secretName, session, rotationId);
      
      const duration = Date.now() - startTime;
      this.logger.info('Rotation completed', { rotationId, duration });
      
      return {
        success: true,
        rotationId,
        newKeyId: newKey.keyId,
        duration,
        timestamp: new Date()
      };
      
    } catch (error) {
      this.logger.error('Rotation failed', { rotationId, error });
      await this.handleRotationFailure(error, rotationId);
      throw error;
    }
  }
  
  private async generateNewKey(request: RotationRequest, rotationId: string): Promise<SecretKey> {
    const key = await this.keyGenerator.generate({
      secretName: request.secretName,
      format: request.keyFormat,
      metadata: { rotationId }
    });
    
    await this.eventEmitter.emit({
      type: 'key_generated',
      secretName: request.secretName,
      keyId: key.keyId,
      timestamp: new Date(),
      metadata: { rotationId }
    });
    
    return key;
  }
  
  private async propagateToProvider(secretName: string, key: SecretKey, rotationId: string): Promise<RotationSession> {
    const session = await this.provider.beginRotation(secretName);
    
    // Store the new key value in the provider
    await this.provider.storeSecretValue(secretName, key.encryptedMaterial, session.state.versionId);
    
    await this.eventEmitter.emit({
      type: 'key_propagated',
      secretName,
      keyId: key.keyId,
      provider: this.provider.name,
      timestamp: new Date(),
      propagationTime: Date.now() - key.createdAt.getTime(),
      metadata: { rotationId }
    });
    
    return session;
  }
  
  private async verifyPropagation(session: RotationSession, request: RotationRequest, rotationId: string): Promise<VerificationResult> {
    const verification = await this.verifier.verify(session, {
      timeout: request.verificationTimeout,
      minConsumerCoverage: request.minConsumerCoverage,
      metadata: { rotationId }
    });
    
    if (verification.success) {
      await this.eventEmitter.emit({
        type: 'key_verified',
        secretName: session.secretName,
        keyId: session.state.versionId,
        consumerCount: verification.consumerCount,
        verificationTime: verification.duration,
        timestamp: new Date(),
        metadata: { rotationId }
      });
    }
    
    return verification;
  }
}
```

### 5. Propagation Verification — The Hard Part

#### Verification Strategies
```typescript
export interface PropagationVerifier {
  verify(session: RotationSession, options?: VerificationOptions): Promise<VerificationResult>;
  getVerificationStatus(session: RotationSession): Promise<VerificationStatus>;
  cancelVerification(session: RotationSession): Promise<void>;
}

export class ActivePropagationVerifier implements PropagationVerifier {
  private consumerRegistry: ConsumerRegistry;
  private healthChecker: HealthChecker;
  private logger: Logger;
  
  async verify(session: RotationSession, options?: VerificationOptions): Promise<VerificationResult> {
    const startTime = Date.now();
    const consumers = await this.consumerRegistry.getConsumers(session.secretName);
    
    this.logger.info('Starting active verification', {
      secretName: session.secretName,
      consumerCount: consumers.length,
      timeout: options?.timeout
    });
    
    const verificationTasks = consumers.map(consumer =>
      this.verifyConsumer(consumer, session, options)
    );
    
    const results = await Promise.allSettled(verificationTasks);
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const total = results.length;
    const coverage = total > 0 ? successful / total : 0;
    
    const duration = Date.now() - startTime;
    
    if (coverage < (options?.minConsumerCoverage || 0.95)) {
      return {
        success: false,
        consumerCount: total,
        verifiedCount: successful,
        coverage,
        duration,
        failures: this.extractFailures(results),
        canRetry: true
      };
    }
    
    return {
      success: true,
      consumerCount: total,
      verifiedCount: successful,
      coverage,
      duration,
      failures: this.extractFailures(results),
      canRetry: false
    };
  }
  
  private async verifyConsumer(
    consumer: Consumer,
    session: RotationSession,
    options?: VerificationOptions
  ): Promise<ConsumerVerificationResult> {
    try {
      // Method 1: Direct API call to check key version
      if (consumer.capabilities.supportsVersionCheck) {
        return await this.verifyViaAPI(consumer, session, options);
      }
      
      // Method 2: Health check with version header
      if (consumer.capabilities.supportsHealthCheck) {
        return await this.verifyViaHealthCheck(consumer, session, options);
      }
      
      // Method 3: Passive monitoring (wait for key usage)
      return await this.verifyViaPassiveMonitoring(consumer, session, options);
      
    } catch (error) {
      this.logger.warn('Consumer verification failed', {
        consumerId: consumer.id,
        error: error.message
      });
      
      return {
        consumerId: consumer.id,
        success: false,
        error: error.message,
        canRetry: true
      };
    }
  }
  
  private async verifyViaAPI(
    consumer: Consumer,
    session: RotationSession,
    options?: VerificationOptions
  ): Promise<ConsumerVerificationResult> {
    const response = await this.httpClient.post(`${consumer.endpoint}/verify-key`, {
      secretName: session.secretName,
      expectedVersion: session.state.versionId
    }, {
      timeout: options?.perConsumerTimeout || 5000,
      headers: this.getAuthHeaders(consumer)
    });
    
    return {
      consumerId: consumer.id,
      success: response.data.usingCorrectKey,
      currentVersion: response.data.currentVersion,
      verifiedAt: new Date(),
      canRetry: false
    };
  }
}

export class PassivePropagationVerifier implements PropagationVerifier {
  private keyUsageMonitor: KeyUsageMonitor;
  private errorMonitor: ErrorMonitor;
  private logger: Logger;
  
  async verify(session: RotationSession, options?: VerificationOptions): Promise<VerificationResult> {
    const startTime = Date.now();
    
    this.logger.info('Starting passive verification', {
      secretName: session.secretName,
      timeout: options?.timeout
    });
    
    // Monitor key usage patterns
    const usageMonitor = this.keyUsageMonitor.startMonitoring(session.secretName, {
      expectedVersion: session.state.versionId,
      timeout: options?.timeout
    });
    
    // Monitor error rates
    const errorMonitor = this.errorMonitor.startMonitoring(session.secretName, {
      timeout: options?.timeout,
      errorThreshold: options?.errorThreshold || 0.05
    });
    
    // Wait for verification period
    await this.waitForVerification(options?.timeout || 30000);
    
    const usageStats = await usageMonitor.getStats();
    const errorStats = await errorMonitor.getStats();
    
    const duration = Date.now() - startTime;
    
    // Determine if verification succeeded
    const usingNewKey = usageStats.newKeyUsagePercent > (options?.minNewKeyUsage || 80);
    const lowErrorRate = errorStats.errorRate < (options?.errorThreshold || 0.05);
    
    return {
      success: usingNewKey && lowErrorRate,
      consumerCount: usageStats.consumerCount,
      verifiedCount: usageStats.consumersUsingNewKey,
      coverage: usageStats.newKeyUsagePercent / 100,
      duration,
      metadata: {
        usageStats,
        errorStats
      },
      canRetry: !usingNewKey
    };
  }
}
```

#### Consumer Registry
```typescript
export class ConsumerRegistry {
  private consumers: Map<string, Consumer> = new Map();
  private consumerGroups: Map<string, string[]> = new Map();
  private healthStatus: Map<string, ConsumerHealth> = new Map();
  
  async register(consumer: Consumer): Promise<void> {
    this.consumers.set(consumer.id, consumer);
    
    // Add to groups
    for (const group of consumer.groups || []) {
      if (!this.consumerGroups.has(group)) {
        this.consumerGroups.set(group, []);
      }
      this.consumerGroups.get(group)!.push(consumer.id);
    }
    
    // Start health monitoring
    this.startHealthMonitoring(consumer);
  }
  
  async getConsumers(secretName: string): Promise<Consumer[]> {
    // Find all consumers interested in this secret
    const interested = Array.from(this.consumers.values())
      .filter(c => c.interestedSecrets.includes(secretName));
    
    // Filter out unhealthy consumers (with grace period)
    const healthy = interested.filter(c => {
      const health = this.healthStatus.get(c.id);
      return !health || health.status === 'healthy' || 
             Date.now() - health.lastHealthy < 60000; // 1 minute grace
    });
    
    return healthy;
  }
  
  async getConsumerGroups(secretName: string): Promise<ConsumerGroup[]> {
    const consumers = await this.getConsumers(secretName);
    const groups = new Map<string, Consumer[]>();
    
    for (const consumer of consumers) {
      for (const group of consumer.groups || []) {
        if (!groups.has(group)) {
          groups.set(group, []);
        }
        groups.get(group)!.push(consumer);
      }
    }
    
    return Array.from(groups.entries()).map(([name, members]) => ({
      name,
      members,
      health: this.calculateGroupHealth(members)
    }));
  }
}
```

### 6. Event System

#### Event Emitter
```typescript
export interface EventEmitter {
  emit(event: RotationEvent): Promise<void>;
  on(eventType: string, handler: EventHandler): void;
  off(eventType: string, handler: EventHandler): void;
  replay(fromTime: Date, filters?: EventFilters): AsyncIterable<RotationEvent>;
}

export class RotationEventEmitter implements EventEmitter {
  private localBus: LocalEventBus;
  private remoteBus?: RemoteEventBus;
  private eventStore: EventStore;
  private logger: Logger;
  
  async emit(event: RotationEvent): Promise<void> {
    // Add metadata
    const enrichedEvent = {
      ...event,
      timestamp: event.timestamp || new Date(),
      eventId: this.generateEventId(),
      source: 'secret-rotation-kit'
    };
    
    try {
      // Store event
      await this.eventStore.save(enrichedEvent);
      
      // Emit to local bus
      await this.localBus.publish(enrichedEvent);
      
      // Emit to remote bus if configured
      if (this.remoteBus) {
        await this.remoteBus.publish(enrichedEvent);
      }
      
      this.logger.debug('Event emitted', {
        eventType: enrichedEvent.type,
        eventId: enrichedEvent.eventId
      });
      
    } catch (error) {
      this.logger.error('Failed to emit event', {
        eventType: enrichedEvent.type,
        error: error.message
      });
      throw error;
    }
  }
}
```

### 7. Sidecar Implementation

#### Sidecar Server
```typescript
export class SidecarServer {
  private httpServer: HTTPServer;
  private grpcServer?: GRPCServer;
  private rotationManager: RotationManager;
  private eventEmitter: EventEmitter;
  private metrics: MetricsCollector;
  
  async start(options?: SidecarOptions): Promise<void> {
    // Set up HTTP endpoints
    this.httpServer.post('/rotate', this.handleRotation.bind(this));
    this.httpServer.get('/secrets/:name', this.handleGetSecret.bind(this));
    this.httpServer.get('/health', this.handleHealth.bind(this));
    this.httpServer.get('/metrics', this.handleMetrics.bind(this));
    this.httpServer.get('/events', this.handleEventStream.bind(this));
    
    // Set up gRPC if enabled
    if (options?.enableGRPC) {
      this.grpcServer = this.createGRPCServer();
      await this.grpcServer.start();
    }
    
    // Start HTTP server
    await this.httpServer.listen(options?.port || 8080);
    
    this.logger.info('Sidecar server started', {
      port: options?.port || 8080,
      grpc: options?.enableGRPC || false
    });
  }
  
  private async handleRotation(req: Request, res: Response): Promise<void> {
    const { secretName, force = false } = req.body;
    
    try {
      const result = await this.rotationManager.rotate(secretName, { force });
      res.json({ success: true, result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
  
  private async handleEventStream(req: Request, res: Response): Promise<void> {
    // Server-Sent Events for real-time event streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const unsubscribe = this.eventEmitter.on('*', (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    
    req.on('close', () => {
      unsubscribe();
    });
  }
}
```

## Data Flow

### Complete Rotation Flow

```
1. Rotation Trigger
   └─> Scheduler or manual trigger initiates rotation
   
2. Key Generation
   └─> Generate cryptographically secure key
   └─> Store in local key store
   └─> Emit KeyGeneratedEvent
   
3. Provider Propagation
   └─> Call provider.beginRotation()
   └─> Update secret with new value
   └─> Emit KeyPropagatedEvent
   
4. Propagation Verification
   └─> Active: Poll consumers for key version
   └─> Passive: Monitor key usage patterns
   └─> Wait for consumer coverage threshold
   └─> Emit KeyVerifiedEvent
   
5. Key Activation
   └─> Mark new key as active
   └─> Update provider version stages
   └─> Emit KeyActivatedEvent
   
6. Old Key Revocation
   └─> Wait for grace period
   └─> Revoke old key in provider
   └─> Mark old key as revoked
   └─> Emit KeyRevokedEvent
```

### Verification Decision Tree

```
Start Verification
│
├─> Active Verification Available?
│   ├─> Yes: Direct consumer polling
│   │   ├─> All consumers verified? → Success
│   │   └─> Timeout reached? → Retry or Fallback
│   │
│   └─> No: Passive Verification
│       ├─> Monitor key usage
│       ├─> Monitor error rates
│       └─> Usage threshold met? → Success
│
└─> Verification Success?
    ├─> Yes: Proceed to activation
    └─> No: Retry or rollback
```

## Configuration

### Rotation Configuration Schema

```typescript
export interface RotationConfig {
  // Provider configuration
  provider: ProviderConfig;
  
  // Key generation settings
  keyGeneration: {
    algorithm: string;
    keyLength: number;
    format: KeyFormat;
  };
  
  // Rotation scheduling
  scheduling: {
    enabled: boolean;
    cron?: string;
    interval?: number;
    timezone?: string;
  };
  
  // Propagation verification
  verification: {
    strategy: 'active' | 'passive' | 'hybrid';
    timeout: number;
    minConsumerCoverage: number;
    perConsumerTimeout: number;
    retryPolicy: RetryPolicy;
  };
  
  // Key windows
  keyWindows: {
    overlapPeriod: number; // How long both keys are valid
    gracePeriod: number;   // How long to keep old key after revocation
  };
  
  // Event emission
  events: {
    enabled: boolean;
    transports: EventTransportConfig[];
    persistence: EventPersistenceConfig;
  };
  
  // Sidecar settings
  sidecar: {
    enabled: boolean;
    port: number;
    enableGRPC: boolean;
  };
  
  // Observability
  observability: {
    logging: LoggingConfig;
    metrics: MetricsConfig;
    tracing: TracingConfig;
  };
}
```

## Security Considerations

1. **Key Encryption**: All keys encrypted at rest
2. **Access Control**: RBAC for rotation operations
3. **Audit Logging**: Complete rotation audit trail
4. **Secure Communication**: TLS for all external communication
5. **Key Isolation**: Separate encryption keys per secret
6. **Rate Limiting**: Prevent rotation flooding
7. **Input Validation**: Sanitize all inputs
8. **Secret Scanning**: Prevent secret leakage in logs
9. **Secure Memory**: Key material in Buffers should be zeroed (`buf.fill(0)`) as soon as it is no longer needed. Avoid passing secrets as strings where possible, since strings are immutable and may be interned by the runtime.

## Performance Optimizations

1. **Connection Pooling**: Reuse provider connections
2. **Batch Operations**: Batch key operations when possible
3. **Caching**: Cache frequently accessed keys
4. **Async Processing**: Non-blocking I/O throughout
5. **Lazy Loading**: Load keys on demand
6. **Compression**: Compress large key materials
7. **Parallel Verification**: Verify consumers in parallel

## Testing Strategy

### Unit Tests
- Key generation and validation
- Provider adapter operations
- Rotation workflow logic
- Verification strategies
- Event emission

### Integration Tests
- End-to-end rotation with each provider
- Multi-provider scenarios
- Consumer verification flows
- Sidecar communication

### Chaos Testing
- Provider failures
- Network partitions
- Consumer unavailability
- Timeout scenarios
- Partial failures

This architecture provides a robust, scalable foundation for zero-downtime secret rotation that handles the complex propagation verification problem that most implementations get wrong.
