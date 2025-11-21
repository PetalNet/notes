import devtoolsJson from "vite-plugin-devtools-json";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import { webSocketServer } from "./src/lib/server/webSocketPlugin";

import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    wasm(),
    topLevelAwait(),
    tailwindcss(),
    sveltekit(),
    devtoolsJson(),
    // webSocketServer // Temporarily disabled - conflicts with Vite's HMR WebSocket
  ],
  build: {
    rollupOptions: {
      external: ["ws"],
    },
  },
});
