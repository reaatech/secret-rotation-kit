# Documentation Skill

Guidance for technical writing and documentation in secret-rotation-kit.

## Documentation Files

| File | Audience | Purpose |
|------|----------|---------|
| `README.md` | Users/contributors | Project overview, install, quick start, packages table |
| `packages/*/README.md` | Package consumers | Per-package API reference, install, usage, related packages |
| `ARCHITECTURE.md` | Contributors | System design, package relationships, data flows |
| `AGENTS.md` | AI agents | Coding conventions, tooling, package conventions |
| `CONTRIBUTING.md` | Contributors | Setup, conventions, PR process |
| `skills/*/SKILL.md` | AI agents | Domain-specific agent guidance |

## Package README Format

Every package README in `packages/*/README.md` follows this structure:

1. **Title** — `# @reaatech/secret-rotation-<name>`
2. **Badges** — npm version, license, CI status (matching format: `shields.io`)
3. **Status note** — `> **Status:** Pre-1.0 — APIs may change in minor versions.`
4. **Description** — One sentence with link to main repo
5. **Installation** — Both `npm install` and `pnpm add` commands
6. **Feature Overview** — Bullet list of capabilities
7. **Quick Start** — Runnable code example
8. **API Reference** — Tables with exports, methods, options
9. **Usage Patterns** — Additional examples with code blocks
10. **Related Packages** — Links to sibling npm packages
11. **License** — Badge-style MIT link

## Root README Format

The root `README.md` follows this structure:

1. **Title** — `# secret-rotation-kit`
2. **Badges** — CI, license, TypeScript
3. **Description** — Blockquote tagline + paragraph
4. **Features** — Grouped bullet list
5. **Installation** — Individual package installs + contributing setup
6. **Quick Start** — Runnable example using multiple packages
7. **Packages** — Table linking to each package directory
8. **Documentation** — Links to ARCHITECTURE.md, AGENTS.md, CONTRIBUTING.md
9. **License** — MIT link

## Writing Standards

- **Audience:** Assume the reader knows TypeScript/Node.js but is new to this library.
- **Be precise:** Reference exact exports, method signatures, and file paths.
- **Code examples:** Must be runnable. Include necessary imports. Use 2-space indentation.
- **Tables:** Use Markdown tables for API references and configuration options.
- **Spelling:** American English. No emojis in documentation.
- **Formatting:** Single backticks for code references, triple backticks with language for blocks.

## Types Package Documentation

The `packages/types/README.md` must be the most thorough — it documents every shared type, interface, and error class. Use tables organized by category (Core Types, Events, Verification, Config, Errors, Interfaces).

## What Not to Document

- Don't duplicate implementation details that live in source files.
- Don't document private methods or internal-only exports.
- Don't include TODOs or roadmap items in package READMEs — those belong in issues or DEV_PLAN.md.
- Don't link to DEV_PLAN.md from READMEs (it's for internal development tracking).
