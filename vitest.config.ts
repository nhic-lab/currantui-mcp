import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // Only this repo's tests — CI checks out the design system into
    // ./currantui-src, whose own *.test.ts files must not be discovered
    include: ["tests/**/*.test.ts"],
  },
})
