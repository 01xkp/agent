import { resolve } from "node:path";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "electron-vite";

export default defineConfig({
  main: {
    build: {
      outDir: "dist-electron/main",
      rollupOptions: {
        input: resolve("electron/main/index.ts"),
      },
    },
  },
  preload: {
    build: {
      outDir: "dist-electron/preload",
      rollupOptions: {
        input: resolve("electron/preload/index.ts"),
      },
    },
  },
  renderer: {
    root: ".",
    publicDir: "public",
    plugins: [vue()],
    build: {
      cssMinify: "esbuild",
      minify: "esbuild",
      outDir: "dist-electron/renderer",
      rollupOptions: {
        input: resolve("index.html"),
      },
    },
  },
});
