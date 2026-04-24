/**
 * electron-vite config — one config file for all three build targets.
 *
 *   main     = Node-side Electron main process (app lifecycle, BrowserWindow)
 *   preload  = tiny bridge file that runs before the renderer loads
 *   renderer = React app (browser-side, sandboxed)
 */
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/main/index.ts") },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, "src/preload/index.ts") },
        // Electron's preload loader is CommonJS-only. Our package.json has
        // "type": "module" which would otherwise make electron-vite emit
        // `.mjs` here. Force `.cjs` + cjs format so Electron can require() it.
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
