import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/tests/**/*.test.ts", "services/tests/**/*.test.ts"],
    exclude: ["dist/**", "dist-services/**", "node_modules/**"]
  }
});
