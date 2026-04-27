# Security Skills

This skill set focuses on security-focused development for the Secret Rotation Kit project.

## Capabilities

### 1. Secure Coding Practices
- Implement input validation and sanitization
- Use parameterized queries to prevent injection attacks
- Implement proper error handling without information leakage
- Follow principle of least privilege

### 2. Cryptography
- Use industry-standard encryption algorithms (AES-256-GCM)
- Implement proper key derivation functions (PBKDF2, Argon2)
- Use secure random number generation
- Implement proper key storage and handling

### 3. Access Control
- Implement RBAC (Role-Based Access Control)
- Use API keys and tokens securely
- Implement proper authentication mechanisms
- Enforce authorization checks at all layers

### 4. Audit and Logging
- Log all security-relevant events
- Implement tamper-evident audit trails
- Use structured logging with correlation IDs
- Ensure logs don't contain sensitive information

### 5. Secret Management
- Never hardcode secrets in source code
- Use environment variables or secret management services
- Implement secret masking in logs and error messages
- Rotate encryption keys regularly

## Security Checklist

### Code Review Security Checklist
- [ ] All inputs are validated and sanitized
- [ ] No sensitive data in logs or error messages
- [ ] Proper error handling without information leakage
- [ ] Authentication and authorization checks in place
- [ ] Encryption used for sensitive data at rest and in transit
- [ ] No hardcoded credentials or API keys
- [ ] Dependencies are up-to-date and vulnerability-free
- [ ] Rate limiting implemented for external APIs

### Deployment Security Checklist
- [ ] TLS/SSL configured for all endpoints
- [ ] Firewall rules properly configured
- [ ] Secrets stored in secure vault
- [ ] Monitoring and alerting configured
- [ ] Backup and recovery procedures tested
- [ ] Incident response plan documented

## Threat Modeling

### Assets to Protect
1. **Secret Keys**: The actual secret values being rotated
2. **Encryption Keys**: Keys used to encrypt secrets at rest
3. **Configuration**: Provider credentials and settings
4. **Audit Logs**: Records of all rotation activities
5. **Consumer Data**: Information about consuming services

### Potential Threats
1. **Unauthorized Access**: Attackers gaining access to secrets
2. **Man-in-the-Middle**: Interception of secrets in transit
3. **Insider Threats**: Malicious actors with legitimate access
4. **Supply Chain**: Compromised dependencies or build process
5. **Denial of Service**: Attacks preventing rotation operations

### Mitigation Strategies
- **Defense in Depth**: Multiple layers of security controls
- **Zero Trust**: Never trust, always verify
- **Least Privilege**: Minimal permissions for all operations
- **Segmentation**: Isolate components and limit blast radius
- **Monitoring**: Continuous monitoring and alerting

## Security Testing

### Static Analysis
- Use ESLint with security plugins
- Run Snyk or similar for dependency scanning
- Use CodeQL for automated security analysis
- Perform regular code reviews with security focus

### Dynamic Testing
- Penetration testing of APIs and endpoints
- Fuzz testing for input validation
- Load testing to identify DoS vulnerabilities
- Runtime application self-protection (RASP)

### Compliance
- Follow OWASP Top 10 guidelines
- Comply with SOC 2 requirements
- Follow NIST cybersecurity framework
- Implement GDPR data protection principles

## Example Security Patterns

```typescript
// Secure secret handling
class SecureSecretManager {
  private readonly encryptionKey: Buffer;
  
  constructor(encryptionKey: string) {
    // Copy key into a mutable Buffer, then clear the source string
    // Note: In production, accept a Buffer directly to avoid string interning
    this.encryptionKey = Buffer.from(encryptionKey, 'base64');
    // Overwrite the string's underlying memory reference where possible.
    // (Best practice: pass keys as Buffers and zero them immediately after copying.)
    encryptionKey = '';
  }
  
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    
    const authTag = cipher.getAuthTag();
    
    // Return IV + ciphertext + auth tag
    return `${iv.toString('base64')}:${ciphertext}:${authTag.toString('base64')}`;
  }
  
  dispose(): void {
    // Zero out the key material when this instance is no longer needed
    this.encryptionKey.fill(0);
  }
}

// Input validation
function validateSecretId(secretId: string): void {
  const pattern = /^[a-zA-Z0-9-_]{1,256}$/;
  if (!pattern.test(secretId)) {
    throw new ValidationError('Invalid secret ID format');
  }
}
```

## Incident Response

### Security Incident Categories
1. **Data Breach**: Unauthorized access to secrets
2. **Service Compromise**: Compromised rotation service
3. **Credential Leak**: Exposed provider credentials
4. **Denial of Service**: Rotation service unavailable

### Response Procedures
- **Containment**: Isolate affected systems
- **Investigation**: Determine scope and impact
- **Remediation**: Fix vulnerabilities and restore service
- **Communication**: Notify stakeholders and customers
- **Post-Mortem**: Document lessons learned

---

**Related Skills**: [Code Generation](../code-generation/SKILL.md), [DevOps](../devops/SKILL.md), [Testing](../testing/SKILL.md)
