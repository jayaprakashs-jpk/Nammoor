import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Plain Node test scripts use CommonJS on purpose.
  { files: ["scripts/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Android project + copied web build
    "android/**",
    // Deno runtime (URL imports, Deno global). Its logic lives in supabase/functions/_shared and is tested.
    "supabase/functions/send-sms/**",
    "supabase/functions/restore-photo/**",
  ]),
]);

export default eslintConfig;
