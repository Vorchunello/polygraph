import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// base "./" — один и тот же билд открывается из file:// в Electron и из WebView в Capacitor.
export default defineConfig({
  base: "./",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: { host: "127.0.0.1", port: 5173 },
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
});
