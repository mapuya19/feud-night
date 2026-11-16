import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
      "@": path.resolve(__dirname, "src"),
      "cloudflare:workers": path.resolve(__dirname, "tests/helpers/cloudflare.ts"),
    },
  },
});
