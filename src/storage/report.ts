import { CapacitorHttp } from "@capacitor/core";
import { platform, platformFetch } from "./platform";

// Жалобы на ответы ИИ. Google Play требует, чтобы в приложении с генеративным
// ИИ можно было пожаловаться на оскорбительный ответ, не выходя из приложения.
// Своего сервера у Polygraph нет, поэтому жалоба уходит в Google Форму
// разработчика (ответы складываются в таблицу). Настройка — docs/GOOGLE_PLAY.md.

/** Google Форма для жалоб: адрес formResponse и id полей (entry.XXXX) по порядку. */
export const REPORT_FORM = {
  url: "",
  fields: { kind: "", reason: "", comment: "", content: "", model: "", app: "" },
};

export const REPORT_ISSUES = "https://github.com/Vorchunello/polygraph/issues/new";

export interface AiReport {
  /** Где был ответ: ask, story, explain, notes, word… */
  kind: string;
  reason: "offensive" | "wrong" | "other";
  comment: string;
  /** Текст ответа ИИ — только если пользователь согласился его приложить. */
  content: string;
  /** Провайдер и модель — чтобы понять, чья это модель. */
  model: string;
  app: string;
}

export const reportConfigured = () => !!REPORT_FORM.url && Object.values(REPORT_FORM.fields).every(Boolean);

/** Отправить жалобу в форму. Бросает ошибку, если форма не настроена или недоступна. */
export async function sendReport(r: AiReport): Promise<void> {
  if (!reportConfigured()) throw new Error("Report form is not configured");
  const f = REPORT_FORM.fields;
  const body = new URLSearchParams({
    [f.kind]: r.kind,
    [f.reason]: r.reason,
    [f.comment]: r.comment.slice(0, 2000),
    [f.content]: r.content.slice(0, 8000),
    [f.model]: r.model,
    [f.app]: r.app,
  }).toString();
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  switch (platform()) {
    case "android": {
      const res = await CapacitorHttp.post({ url: REPORT_FORM.url, headers, data: body });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      return;
    }
    case "electron": {
      const res = await platformFetch(REPORT_FORM.url, { method: "POST", headers, body });
      if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
      return;
    }
    default:
      // Браузер: Google Формы не отдают CORS-заголовки — ответ не прочитать, но запрос дойдёт.
      await fetch(REPORT_FORM.url, { method: "POST", mode: "no-cors", headers, body });
  }
}

/** Запасной путь, если форма не настроена: черновик issue на GitHub. */
export function issueUrl(r: AiReport): string {
  const body = [`**Where:** ${r.kind}`, `**Reason:** ${r.reason}`, `**Model:** ${r.model}`, `**App:** ${r.app}`, "", r.comment, "", r.content ? `<details><summary>AI answer</summary>\n\n${r.content.slice(0, 3000)}\n\n</details>` : ""].join("\n");
  return `${REPORT_ISSUES}?${new URLSearchParams({ title: `AI report: ${r.reason}`, body, labels: "ai-report" })}`;
}
