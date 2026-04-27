import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		coverage: {
			provider: "v8",
			reporter: ["text", "json", "html"],
			thresholds: {
				lines: 93,
				functions: 93,
				branches: 82,
				statements: 93,
				"src/sidecar/**": {
					lines: 80,
					functions: 85,
					branches: 75,
					statements: 80,
				},
			},
			exclude: [
				"node_modules/",
				"dist/",
				"**/*.d.ts",
				"**/*.config.*",
				"**/index.ts",
				"src/types/**",
				"src/core/nodeVersion.ts",
			],
		},
	},
});
