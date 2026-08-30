import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "dev-dist", "coverage", "node_modules", "supabase/**"],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // Unused code is a warning, not a build blocker. Leading `_` opts out,
      // which is the conventional escape hatch for intentionally-unused args.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],

      // This app consumes a lot of untyped external JSON: LLM completions,
      // Supabase dynamic rows, Web Speech API events and map SDK handles.
      // `any` at those boundaries is deliberate, so this stays a warning that
      // shows up in review rather than an error that blocks the build.
      // Internal code should still prefer `unknown` + narrowing.
      "@typescript-eslint/no-explicit-any": "warn",

      // Prefer the checked form so a stale suppression fails loudly.
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description", "ts-ignore": true },
      ],

      // Correctness rules worth enforcing hard.
      eqeqeq: ["error", "smart"],
      "no-implicit-coercion": ["error", { boolean: false }],
      "no-var": "error",
      "prefer-const": "error",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
  // Test files get looser rules.
  {
    files: ["**/*.{test,spec}.{ts,tsx}", "src/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
);
