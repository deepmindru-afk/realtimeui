import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    // The unit under test is React-free, so a stubbed `navigator` is the only
    // browser surface needed and node is enough.
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Globals are deliberately off: tests import `describe`/`it`/`expect` from
    // "vitest", which also keeps `tsc --noEmit` honest without a types entry.
    globals: false,
  },
  resolve: {
    alias: {
      // Mirrors `@/*` -> `src/*` in tsconfig.json. A second aliasing mechanism
      // would let an import resolve under vitest and still fail the build.
      "@/": fileURLToPath(new URL("./src/", import.meta.url)),
    },
  },
})
