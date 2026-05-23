# Examples

Runnable examples for [Secret Rotation Kit](../README.md). They consume the
workspace packages directly, so build once from the repo root first:

```bash
pnpm install
pnpm build
```

Then run any example with pnpm's filter:

| Example | Command | Needs |
|---------|---------|-------|
| [`in-memory-provider-rotation.mjs`](./in-memory-provider-rotation.mjs) | `pnpm --filter @reaatech/secret-rotation-examples start:in-memory` | nothing — fully offline |
| [`sidecar-server.mjs`](./sidecar-server.mjs) | `pnpm --filter @reaatech/secret-rotation-examples start:sidecar` | nothing — serves on `:8080` |
| [`aws-rotation.mjs`](./aws-rotation.mjs) | `pnpm --filter @reaatech/secret-rotation-examples start:aws` | AWS credentials + `@aws-sdk/client-secrets-manager` |

Start with `in-memory-provider-rotation.mjs` — it implements the
`SecretProvider` interface from scratch and rotates a secret end to end, which
is the clearest way to see how the pieces fit together.
