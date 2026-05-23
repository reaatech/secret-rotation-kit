import { randomUUID } from 'node:crypto';

/**
 * Minimal in-memory implementation of the `SecretProvider` interface, suitable
 * for examples and local experimentation. It keeps an ordered list of versions
 * per secret and tracks which version is "current" versus "pending" — the two
 * stages the rotation workflow and polling verifier rely on.
 */
export class InMemoryProvider {
  name = 'in-memory';
  priority = 1;

  /** @type {Map<string, { versions: Map<string, { value: string; createdAt: Date; stage: string }>; current?: string; pending?: string }>} */
  #secrets = new Map();

  #ensure(name) {
    let secret = this.#secrets.get(name);
    if (!secret) {
      secret = { versions: new Map() };
      this.#secrets.set(name, secret);
    }
    return secret;
  }

  async createSecret(name, value) {
    const secret = this.#ensure(name);
    const versionId = randomUUID();
    secret.versions.set(versionId, { value, createdAt: new Date(), stage: 'current' });
    secret.current = versionId;
  }

  async getSecret(name, version) {
    const secret = this.#ensure(name);
    const versionId = version ?? secret.current;
    const v = versionId ? secret.versions.get(versionId) : undefined;
    if (!v || !versionId) throw new Error(`No value for ${name}`);
    return { value: v.value, versionId, createdAt: v.createdAt, versionStages: [v.stage] };
  }

  async storeSecretValue(name, value, options) {
    const secret = this.#ensure(name);
    const versionId = randomUUID();
    const stage = options?.stage === 'pending' ? 'pending' : 'current';
    secret.versions.set(versionId, { value, createdAt: new Date(), stage });
    if (stage === 'pending') secret.pending = versionId;
    else secret.current = versionId;
    return { value, versionId, createdAt: new Date(), versionStages: [stage] };
  }

  async deleteSecret(name) {
    this.#secrets.delete(name);
  }

  async listVersions(name) {
    const secret = this.#ensure(name);
    return [...secret.versions.entries()].map(([versionId, v]) => ({
      versionId,
      createdAt: v.createdAt,
      stages: [v.stage],
    }));
  }

  async getVersion(name, versionId) {
    return this.getSecret(name, versionId);
  }

  async deleteVersion(name, versionId) {
    this.#ensure(name).versions.delete(versionId);
  }

  supportsRotation() {
    return true;
  }

  async beginRotation(name) {
    return {
      sessionId: randomUUID(),
      secretName: name,
      provider: this.name,
      state: {},
      startedAt: new Date(),
    };
  }

  async completeRotation(session) {
    const secret = this.#ensure(session.secretName);
    if (secret.pending) {
      const v = secret.versions.get(secret.pending);
      if (v) v.stage = 'current';
      if (secret.current) {
        const old = secret.versions.get(secret.current);
        if (old) old.stage = 'previous';
      }
      secret.current = secret.pending;
      secret.pending = undefined;
    }
  }

  async cancelRotation(session) {
    const secret = this.#ensure(session.secretName);
    if (secret.pending) {
      secret.versions.delete(secret.pending);
      secret.pending = undefined;
    }
  }

  async health() {
    return { status: 'healthy', latency: 0, lastChecked: new Date() };
  }

  capabilities() {
    return { supportsRotation: true, supportsVersioning: true, supportsLabels: false };
  }
}
