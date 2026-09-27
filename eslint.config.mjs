import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Cloudflare (OpenNext) build output/local state — large bundled/minified
    // JS that isn't source we wrote; linting it once ran ESLint out of memory.
    ".open-next/**",
    ".wrangler/**",
    "cloudflare-env.d.ts",
  ]),
]);

export default eslintConfig;
