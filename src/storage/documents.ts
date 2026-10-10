import { Readability } from "@mozilla/readability";
import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { platformFetch } from "./platform";

// Источники текста для читалки, которым нужен браузер: PDF и веб-страницы.

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Текст из PDF. Работает с «текстовыми» PDF; сканы нужно распознавать через фото. */
export async function pdfParagraphs(bytes: Uint8Array): Promise<{ title?: string; paragraphs: string[] }> {
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const meta = await doc.getMetadata().catch(() => null);
  const title = (meta?.info as { Title?: string } | undefined)?.Title || undefined;
  const paragraphs: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = "";
    let lastY: number | null = null;
    let para = "";
    const flushPara = () => {
      if (para.trim()) paragraphs.push(para.replace(/\s+/g, " ").replace(/-\s+(\p{Ll})/gu, "$1").trim());
      para = "";
    };
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      // Большой вертикальный зазор — новый абзац, обычный — новая строка того же абзаца.
      if (lastY !== null && Math.abs(lastY - y) > (item.height || 10) * 1.8) {
        para += ` ${line}`;
        line = "";
        flushPara();
      } else if (lastY !== null && Math.abs(lastY - y) > 1) {
        para += ` ${line}`;
        line = "";
      }
      line += item.str;
      if (item.hasEOL) line += " ";
      lastY = y;
    }
    para += ` ${line}`;
    flushPara();
  }
  return { title, paragraphs };
}

/** Веб-страница → чистый текст, как «режим чтения» в браузере. */
export async function webArticle(url: string): Promise<{ title: string; paragraphs: string[] }> {
  const res = await platformFetch(url, { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = doc.createElement("base");
  base.href = url;
  doc.head.prepend(base);
  const article = new Readability(doc).parse();
  if (!article?.content) throw new Error("No readable text on this page");
  const body = new DOMParser().parseFromString(article.content, "text/html");
  const paragraphs = [...body.querySelectorAll("h1,h2,h3,h4,p,li,blockquote")]
    .map((el) => el.textContent?.replace(/\s+/g, " ").trim() ?? "")
    .filter((t) => t.length > 1);
  return { title: article.title || new URL(url).hostname, paragraphs };
}
