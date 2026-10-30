import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./src/tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    fileParallelism: false, // shared test DB — run test files serially
    include: ["src/tests/**/*.test.ts"],
  },
});
