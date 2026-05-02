# Security Skill

Guidance for security-focused development in secret-rotation-kit.

## Security Principles

1. **Never hardcode secrets** — Use environment variables, secret managers, or injected configuration.
2. **Validate all inputs** — Every public API in `core` validates inputs via `InputValidator`.
3. **Least privilege** — Provider SDKs should use IAM roles with minimal permissions.
4. **Audit logging** — Every rotation step is emitted as an event and persisted via `EventStore`.
5. **Encryption at rest** — `FileSystemKeyStore` encrypts key material with AES-256-GCM.

## Cryptographic Implementation

### Key Generation (`CryptographicKeyGenerator`)

- Uses `crypto.randomBytes` for key material.
- Supports `base64`, `hex`, `pem`, `raw` output formats.
- **Buffer zeroing:** Raw buffers are filled with `0` after formatting.
- AES-256-GCM encryption/decryption with 12-byte IVs per NIST SP 800-38D.

### Key Storage (`FileSystemKeyStore`)

- One JSON file per secret in the configured `baseDir`.
- Atomic writes: write to temp file → `fs.rename`.
- File permissions: `0o600` (owner read/write only).
- Optional AES-256-GCM encryption of file contents.

### Rate Limiting (`RateLimiter`)

- Per-secret token-bucket algorithm.
- Default: 5 requests per 60-second window.
- Stale buckets auto-cleaned after 10 minutes of inactivity.
- Cleanup timer is `unref()`'d — won't keep process alive.

## Input Validation (`InputValidator`)

- **Secret names:** Must match `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`. Rejects empty strings, leading hyphens, and names over 128 characters.
- **Metadata:** Max 50 keys, max depth 5. Rejects circular references.
- **Intervals:** Must be positive integers in valid ranges.
- **Coverage ratios:** Must be in range [0, 1].
- Returns `ValidationResult` with `valid: boolean` and `errors: string[]`.

## Configuration Safety (`ConfigService`)

- Deep-merges user config with comprehensive defaults.
- **Prototype pollution protection:** Rejects keys `__proto__`, `constructor`, `prototype` during merge.
- Returns fully resolved config with no undefined values for expected fields.

## Provider Security

### AWS
- Uses `@aws-sdk/client-secrets-manager`. Credentials via default AWS credential chain (env vars, IAM roles, etc.).
- Version stage management via `AWSCURRENT`/`AWSPENDING`/`AWSPREVIOUS`.

### GCP
- Uses `@google-cloud/secret-manager`. Credentials via Application Default Credentials.
- Rotation state tracked via secret labels.

### Vault
- Supports token and AppRole authentication.
- `node-vault` loaded via `createRequire(import.meta.url)` for ESM compatibility.
- Token should be scoped to the specific KV mount path.

## Code Review Checklist

Before merging security-sensitive changes:

- [ ] No secrets or credentials committed to the repository.
- [ ] All user-supplied input is validated through `InputValidator` or equivalent.
- [ ] Key material buffers are zeroed after use.
- [ ] File system operations use atomic writes with restricted permissions.
- [ ] Rate limiting is applied to all public rotation entry points.
- [ ] Error messages do not leak sensitive data (key material, internal paths, etc.).
- [ ] Prototype pollution protections are not bypassed.
- [ ] Provider authentication uses the principle of least privilege.

## Known Limitations

- **String immutability:** Formatted key material is held as JavaScript strings, which cannot be zeroed. Avoid holding references longer than necessary.
- **In-memory store:** `InMemoryKeyStore` is not encrypted — keys exist in plaintext in the process heap. Use `FileSystemKeyStore` with encryption for production.
- **SSE streaming:** The sidecar's `/events` endpoint sends rotation events without per-event authentication. Do not include sensitive data in event payloads.
