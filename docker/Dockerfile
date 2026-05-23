FROM node:22-alpine AS base
RUN npm install -g pnpm@10

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json biome.json ./
COPY packages/ ./packages/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app ./
RUN pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages ./packages
# Lean runtime image: a production install drops the build/dev toolchain
# (tsup, vitest, biome, typescript, turbo). The sidecar CLI loads a provider
# package and its cloud SDK at runtime — both are optional peers that `--prod`
# would skip — so promote them to real dependencies of the sidecar (image only)
# before installing. A hoisted node_modules lets each provider's `createRequire`
# resolve its SDK.
COPY docker/bundle-providers.mjs ./bundle-providers.mjs
RUN printf 'node-linker=hoisted\nstrict-peer-dependencies=false\n' > .npmrc \
 && node bundle-providers.mjs \
 && pnpm install --prod --no-frozen-lockfile --prefer-offline \
 && rm bundle-providers.mjs

EXPOSE 8080
CMD ["node", "packages/sidecar/dist/bin.js"]
