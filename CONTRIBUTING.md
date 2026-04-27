# Contributing to Secret Rotation Kit

Thank you for your interest in contributing to Secret Rotation Kit! We welcome contributions from the community and are excited to work with you.

## Getting Started

### Prerequisites

- Node.js 20+ 
- pnpm (latest version)
- Git

### Setting Up Your Development Environment

1. **Fork the repository** on GitHub (org: `reaatech`)

2. **Clone your fork locally:**
   ```bash
   git clone https://github.com/reaatech/secret-rotation-kit.git
   cd secret-rotation-kit
   ```

3. **Install dependencies:**
   ```bash
   pnpm install
   ```

4. **Set up git hooks:**
   ```bash
   pnpm prepare
   ```

5. **Verify everything works:**
   ```bash
   pnpm test
   pnpm build
   pnpm lint
   ```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check existing issues as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

* **Use a clear and descriptive title**
* **Describe the exact steps to reproduce the problem**
* **Provide specific examples to demonstrate the steps**
* **Describe the behavior you observed and what behavior you expected**
* **Include any relevant error messages or logs**

### Suggesting Features

Feature suggestions are always welcome! Please create an issue with:

* **Use a clear and descriptive title**
* **Provide a detailed description of the suggested feature**
* **Explain why this feature would be useful**
* **List some examples of how this feature would be used**

### Pull Requests

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/amazing-feature
   ```

2. **Make your changes** following our coding standards (see below)

3. **Commit your changes** using conventional commits:
   ```bash
   git commit -m "feat: add amazing feature"
   ```

4. **Push to your fork**:
   ```bash
   git push origin feature/amazing-feature
   ```

5. **Open a Pull Request** on GitHub

### Development Workflow

1. **Before starting work**, check existing issues and discussions to avoid duplicate work

2. **Create a feature branch** for each new feature or fix

3. **Write tests** for new functionality (we require >95% coverage)

4. **Ensure all tests pass** before submitting:
   ```bash
   pnpm test
   ```

5. **Run the linter** to ensure code quality:
   ```bash
   pnpm lint
   ```

6. **Build the project** to ensure no compilation errors:
   ```bash
   pnpm build
   ```

## Coding Standards

### TypeScript

* **Strict mode** is enabled - no `any` types in public APIs
* **Type safety** is paramount - use proper types for all functions and variables
* **Interfaces** over type aliases for object shapes
* **Export types** explicitly - don't rely on implicit exports

### Code Style

* **Biome** handles both formatting and linting:
  * `pnpm format` — apply formatting
  * `pnpm lint` — check formatting and lint rules
  * `pnpm lint:fix` — auto-fix what Biome can
* **Meaningful variable names** - avoid single-letter names except for loops
* **Functions** should do one thing and do it well
* **Keep functions small** - if a function is getting long, consider breaking it up

### Testing

* **Unit tests** for all public functions
* **Integration tests** for complex workflows
* **Test edge cases** - don't just test the happy path
* **Mock external dependencies** appropriately
* **Maintain >95% code coverage**

### Documentation

* **Document all public APIs** with JSDoc comments
* **Include examples** in documentation when helpful
* **Update README.md** if you change functionality
* **Add inline comments** for complex logic

## Commit Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

* `feat:` - New features
* `fix:` - Bug fixes
* `docs:` - Documentation changes
* `style:` - Code style changes (formatting, etc.)
* `refactor:` - Code refactoring
* `perf:` - Performance improvements
* `test:` - Test additions or modifications
* `chore:` - Maintenance tasks

Examples:
```bash
git commit -m "feat: add Vault provider adapter"
git commit -m "fix: handle edge case in propagation verification"
git commit -m "docs: update API documentation"
```

## Pull Request Process

1. **Ensure your branch is up to date** with main:
   ```bash
   git fetch origin
   git rebase origin/main
   ```

2. **Squash commits** if you have multiple small commits that should be one

3. **Update documentation** if you've changed functionality

4. **Add or update tests** as needed

5. **Request review** from maintainers

6. **Address review feedback** promptly

7. **Once approved**, a maintainer will merge your PR

## Code Review Guidelines

### For Reviewers

* **Be constructive** - provide helpful feedback
* **Explain your reasoning** - don't just say "change this"
* **Suggest alternatives** when possible
* **Acknowledge good work** - positive reinforcement matters

### For Contributors

* **Be open to feedback** - code review is about improving the code
* **Ask questions** if you don't understand feedback
* **Don't take criticism personally** - it's about the code, not you
* **Respond to all comments** - even if just to acknowledge

## Areas We Need Help

We're particularly interested in contributions in these areas:

* **Provider adapters** - Additional secret management providers
* **Propagation verification** - New verification strategies
* **Testing** - Unit, integration, and chaos tests
* **Documentation** - API docs, examples, and guides
* **Security** - Security reviews and improvements
* **Performance** - Optimization and benchmarking
* **Sidecar** - Deployment and operational improvements

## Testing with Providers

The default `pnpm test` suite runs against mocked clients and does not require any
external services. Integration tests against real provider environments are not yet
wired into a script — if you add one, please also add the corresponding `test:*` entry
to `package.json` and update this section.

### AWS Secrets Manager (LocalStack)
```bash
docker run -d -p 4566:4566 localstack/localstack
# Then point AWSProvider at http://localhost:4566 via the `endpoint` config option.
```

### GCP Secret Manager
The GCP Secret Manager emulator is limited; we recommend testing against a dedicated
GCP project with low-privilege credentials.

### HashiCorp Vault (dev server)
```bash
vault server -dev -dev-root-token-id="root"
export VAULT_TOKEN=root
# Then point VaultProvider at http://127.0.0.1:8200.
```

## Community

* **GitHub Discussions** - For questions and general discussion
* **GitHub Issues** - For bug reports and feature requests
* **Code of Conduct** - Please be respectful and inclusive

## License

By contributing to this project, you agree that your contributions will be licensed under the [MIT License](LICENSE).

## Questions?

If you have any questions about contributing, please:

1. Check existing documentation
2. Search existing issues and discussions
3. Ask in GitHub Discussions
4. Reach out to maintainers

We're here to help and appreciate your interest in making Secret Rotation Kit better!

---

Thank you for contributing to Secret Rotation Kit! 🎉
