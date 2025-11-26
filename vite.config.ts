import devtoolsJson from "vite-plugin-devtools-json";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";

import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    wasm() as Plugin,
    topLevelAwait(),
    tailwindcss(),
    sveltekit(),
    devtoolsJson(),
  ],
});
