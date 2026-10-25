import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: {
    target: "safari13",
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      input: {
        viewer: "index.html",
        ball: "ball.html",
        upload: "upload.html",
      },
    },
  },
});
