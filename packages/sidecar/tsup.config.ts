import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/bin.ts'],
  format: ['cjs', 'esm'],
  dts: {
    resolve: true,
    // The CLI is an executable entry point, not part of the public type surface.
    entry: 'src/index.ts',
  },
  clean: true,
  shims: true,
  tsconfig: './tsconfig.json',
});
