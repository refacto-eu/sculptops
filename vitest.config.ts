import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/db/**", "src/lib/auth.ts", "src/lib/scheduler.ts"],
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
