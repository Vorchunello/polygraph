import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "io.github.vorchunello.polygraph",
  appName: "Polygraph",
  webDir: "dist",
  plugins: {
    // Нативный HTTP: запросы к ИИ-провайдерам идут мимо CORS WebView.
    CapacitorHttp: { enabled: true },
  },
};

export default config;
