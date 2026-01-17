import { fileURLToPath } from "node:url";
import { includeIgnoreFile } from "@eslint/compat";
import js from "@eslint/js";
import svelte from "eslint-plugin-svelte";
import { defineConfig } from "eslint/config";
import globals from "globals";
import ts from "typescript-eslint";
import svelteConfig from "./svelte.config.js";

const gitignorePath = fileURLToPath(new URL("./.gitignore", import.meta.url));

export default defineConfig(
  includeIgnoreFile(gitignorePath),
  js.configs.recommended,
  ...ts.configs.strictTypeChecked,
  ...ts.configs.stylisticTypeChecked,
  ...svelte.configs.recommended,
  {
    linterOptions: {
      reportUnusedInlineConfigs: "warn",
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        extraFileExtensions: [".svelte"],
        parser: ts.parser,
        svelteConfig,
      },
    },
    rules: {
      // typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
      // see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "all",
          argsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowHigherOrderFunctions: false,
          allowedNames: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"],
        },
      ],
      "@typescript-eslint/parameter-properties": "warn",
      "no-restricted-syntax": [
        "warn",
        {
          selector:
            ':matches(PropertyDefinition, MethodDefinition)[accessibility="private"]:not([kind="constructor"])',
          message: "Use #private instead",
        },
      ],
      "no-void": "error", // Use `unawaited((async () => {})())` instead.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", name: "goto", package: "@sveltejs/kit" },
          ],
        },
      ],
      // Too many false positives, due for a rework. See: typescript-eslint/typescript-eslint#8113.
      "@typescript-eslint/no-invalid-void-type": "off",
      // Breaks $env imports
      "@typescript-eslint/dot-notation": "off",
      "@typescript-eslint/no-import-type-side-effects": "warn",
    },
  },
  {
    files: [
      "**/*.svelte",
      "**/+{layout,page}.{svelte,server.ts}",
      "**/+server.ts",
      "**/*.js",
    ],
    rules: {
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
  {
    files: ["**/+{layout,page}.server.ts", "**/+server.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    files: ["**/*.svelte"],
    rules: {
      "svelte/block-lang": ["error", { script: ["ts"] }],
    },
  },
);
