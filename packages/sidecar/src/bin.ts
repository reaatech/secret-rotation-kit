#!/usr/bin/env node
import { main } from './cli.js';

// Executable entry point for the `secret-rotation-sidecar` binary. All logic
// lives in cli.ts (which is import-safe for testing); this file just runs it.
main().catch((error) => {
  // The logger may not be constructed yet, so fall back to stderr.
  process.stderr.write(
    `secret-rotation-sidecar failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
