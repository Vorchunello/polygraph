import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Дымовой тест Electron (electron/main.cjs, POLYGRAPH_SMOKE) проверяет, что
// фоновые потоки PDF и распознавания текста поднимаются из file://.
if (new URLSearchParams(location.search).has("smoke")) {
  Object.assign(window, {
    __smoke: {
      pdf: (bytes: Uint8Array) => import("./storage/documents").then((m) => m.pdfParagraphs(bytes)),
      ocr: (image: Blob) => import("./storage/ocr").then((m) => m.recognize(image, ["es"])),
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
