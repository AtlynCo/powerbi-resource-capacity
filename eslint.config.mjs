import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/**", ".tmp/**", "node_modules/**", "test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.mjs", "**/*.ts"],
    languageOptions: { globals: { console: "readonly", process: "readonly", Buffer: "readonly" } },
    rules: { "@typescript-eslint/no-explicit-any": "error" }
  }
);
