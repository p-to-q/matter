import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    "**/.next/**",
    "**/.next-e2e/**",
    "**/.vercel/**",
    "coverage/**",
    "next-env.d.ts",
    "omi/**",
    "tmp/**",
    // Local agent worktrees are separate checkouts, not this tree's source.
    ".claude/**",
  ]),
]);
