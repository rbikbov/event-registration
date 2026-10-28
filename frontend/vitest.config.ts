import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/shared/lib/test/setup.ts"],
      include: ["src/**/*.test.ts"],
      restoreMocks: true,
    },
  }),
);
