# Agent Guidelines for Secret Rotation Kit

This document provides guidelines and skills for AI agents working on the Secret Rotation Kit project.

## Project Overview

**Secret Rotation Kit** is a zero-downtime multi-key rotation library for production services. The project solves the critical problem of safely rotating secrets without service interruption, with a focus on the propagation verification step.

**GitHub**: [reaatech/secret-rotation-kit](https://github.com/reaatech/secret-rotation-kit)

## Core Principles

1. **Zero-Downtime First**: All changes must maintain continuous service availability
2. **Security by Design**: Encryption, access control, and audit trails are non-negotiable
3. **Battle-Tested Reliability**: Enterprise-grade error handling, retries, and observability
4. **Multi-Provider Flexibility**: Support AWS, GCP, and HashiCorp Vault seamlessly
5. **Developer Experience**: Clear APIs, comprehensive documentation, and intuitive configuration

## Agent Skills Directory

The `skills/` directory contains specialized skill sets for different aspects of project development:

- **`skills/code-generation/`** - Skills for generating production-ready code
- **`skills/testing/`** - Skills for comprehensive testing strategies
- **`skills/documentation/`** - Skills for technical writing and documentation
- **`skills/security/`** - Skills for security-focused development
- **`skills/devops/`** - Skills for deployment and operations
- **`skills/architecture/`** - Skills for system design and architecture decisions

## Working with This Project

### Technology Stack

- **Language**: TypeScript 5.x (strict mode)
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm
- **Testing**: Vitest
- **Build**: tsup
- **Module System**: ESM with CommonJS fallback

### Key Architecture Components

```
Application Layer: RotationManager | ConsumerRegistry | SidecarServer
Core Services: KeyRotator | PropagationVerifier | KeyWindowManager
Provider Layer: AWSProvider | GCPProvider | VaultProvider
Infrastructure: LoggerService | MetricsService | ConfigService
```

### Development Workflow

1. **Understand the Context**: Review relevant documentation (README.md, ARCHITECTURE.md, DEV_PLAN.md)
2. **Check Existing Code**: Examine current implementation patterns and conventions
3. **Follow TypeScript Best Practices**: Strict mode, proper typing, error handling
4. **Write Tests**: Ensure comprehensive test coverage for all changes
5. **Update Documentation**: Keep docs in sync with code changes
6. **Security Review**: Validate security implications of all changes

### Code Quality Standards

- **Type Safety**: Full TypeScript strict mode compliance
- **Error Handling**: Comprehensive error boundaries and recovery strategies
- **Observability**: Structured logging, metrics, and tracing
- **Performance**: Efficient algorithms and resource management
- **Maintainability**: Clean code, clear naming, proper abstraction

## Communication Guidelines

When working on this project:

1. **Be Specific**: Reference exact files, functions, and line numbers
2. **Provide Context**: Explain why changes are needed, not just what to change
3. **Consider Impact**: Analyze how changes affect the entire system
4. **Test Thoroughly**: Include test cases for all scenarios
5. **Document Decisions**: Explain architectural choices and trade-offs

## Security Considerations

All agents must prioritize security:

- **Never Hardcode Secrets**: Use environment variables or secret management
- **Validate All Inputs**: Sanitize and validate external data
- **Principle of Least Privilege**: Minimal permissions for all operations
- **Audit Logging**: Track all security-relevant actions
- **Encryption**: Encrypt sensitive data at rest and in transit

## How to Use These Skills

When working on a task, identify which skill directories are relevant and read their `SKILL.md` files first. Each skill contains domain-specific guidance, patterns, and guardrails:

- **Starting a new component?** Read `skills/architecture/SKILL.md` and `skills/code-generation/SKILL.md`.
- **Writing tests?** Read `skills/testing/SKILL.md` before opening a test file.
- **Deploying or building CI?** Read `skills/devops/SKILL.md`.
- **Documenting?** Read `skills/documentation/SKILL.md`.
- **Security-sensitive changes?** Read `skills/security/SKILL.md` and treat it as a required checklist.

### Delegation Guidance

- **Use subagents for exploration** when you need to understand a module or find code across >3 files. The `explore` subagent type is read-only and fast.
- **Use subagents for coding** when a task is self-contained (e.g., "implement the Vault provider adapter"). Pass full context because subagents do not share your session history.
- **Work directly** for single-file changes, typo fixes, or when you already have full context.

### Before You Start Checklist

Every agent session should begin with:

1. [ ] Read `AGENTS.md` (this file) and any `AGENTS.md` in the subdirectory you are modifying.
2. [ ] Read the relevant `SKILL.md` files from `skills/`.
3. [ ] Review `ARCHITECTURE.md` to understand how your change fits into the system.
4. [ ] Check `DEV_PLAN.md` to confirm the current phase and priorities.
5. [ ] Confirm you are in the correct mode (plan mode vs. execution mode) before making edits.

## Contributing

Before making changes:

1. Review the [Contributing Guide](CONTRIBUTING.md)
2. Check the [Development Plan](DEV_PLAN.md) for current priorities
3. Understand the [Architecture](ARCHITECTURE.md) implications
4. Ensure all tests pass
5. Update relevant documentation

## Resources

- **Main Documentation**: [README.md](README.md)
- **Architecture Details**: [ARCHITECTURE.md](ARCHITECTURE.md)
- **Development Roadmap**: [DEV_PLAN.md](DEV_PLAN.md)
- **Contributing Guidelines**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **License**: [LICENSE](LICENSE)

## Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/reaatech/secret-rotation-kit/issues)
- **Discussions**: [Ask questions and share ideas](https://github.com/reaatech/secret-rotation-kit/discussions)

---

**Maintained by**: [ReaaTech](https://github.com/reaatech)
