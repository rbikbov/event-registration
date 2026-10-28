import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import boundaries from "eslint-plugin-boundaries";
import pluginVue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

// FSD layers from top to bottom; a layer imports only the layers below it.
const SLICED_LAYERS = ["pages", "widgets", "features", "entities"];
const layersBelow = {
  app: [...SLICED_LAYERS, "shared"],
  pages: ["widgets", "features", "entities", "shared"],
  widgets: ["features", "entities", "shared"],
  features: ["entities", "shared"],
  entities: ["shared"],
  shared: ["shared"],
};

export default tseslint.config(
  { ignores: ["dist/**", "coverage/**", "src/shared/api/schema.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...pluginVue.configs["flat/recommended"],
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        parser: tseslint.parser,
        extraFileExtensions: [".vue"],
      },
    },
    rules: {
      // Forgotten await, async in handlers, non-exhaustive switch
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Config files are outside the type-checked projects
    files: ["*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // FSD boundaries: imports only go down, into another slice only through its index.ts
    files: ["src/**/*.{ts,vue}"],
    plugins: { boundaries },
    settings: {
      "boundaries/legacy-templates": false,
      "import/resolver": { typescript: { alwaysTryTypes: true } },
      "boundaries/elements": [
        { type: "app", pattern: "src/app" },
        { type: "pages", pattern: "src/pages/*", capture: ["slice"] },
        { type: "widgets", pattern: "src/widgets/*", capture: ["slice"] },
        { type: "features", pattern: "src/features/*", capture: ["slice"] },
        { type: "entities", pattern: "src/entities/*", capture: ["slice"] },
        { type: "shared", pattern: "src/shared/*", capture: ["segment"] },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          message:
            "{{from.element.type}} cannot import {{to.element.type}}: only lower layers, into another slice only through index.ts",
          policies: [
            { allow: { to: { module: { origin: { anyOf: ["external", "core"] } } } } },
            { allow: { dependency: { relationship: { to: "internal" } } } },
            ...Object.entries(layersBelow).map(([from, to]) => ({
              from: { element: { type: from } },
              allow: {
                to: [
                  { element: { types: { anyOf: to.filter((t) => !SLICED_LAYERS.includes(t)) } } },
                  {
                    element: {
                      types: { anyOf: to.filter((t) => SLICED_LAYERS.includes(t)) },
                      fileInternalPath: "index.ts",
                    },
                  },
                ],
              },
            })),
          ],
        },
      ],
    },
  },
  prettier,
);
