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
    // Archived worktrees and scaffold temp files — not part of the app
    "_archive/**",
    ".scaffold-tmp/**",
    // Generated workbox runtime files — not hand-authored
    "public/workbox-*.js",
  ]),
  // Test files: display-name is not meaningful for wrapper components in tests
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "react/display-name": "off",
    },
  },
]);

export default eslintConfig;
