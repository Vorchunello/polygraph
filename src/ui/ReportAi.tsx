import { useState } from "react";
import { presetById } from "../ai/config";
import { useT } from "../i18n";
import { issueUrl, reportConfigured, sendReport, type AiReport } from "../storage/report";
import { platform } from "../storage/platform";
import { Modal, useAsync } from "./common";
import { useApp } from "./state";

declare const __APP_VERSION__: string;

/**
 * «⚑» у ответа ИИ: пожаловаться на оскорбительный, вредный или неверный ответ.
 * onReported — например, спрятать ответ после жалобы.
 */
export function ReportAi({ kind, content, onReported }: { kind: string; content: string; onReported?(): void }) {
  const { t } = useT();
  const app = useApp();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AiReport["reason"]>("offensive");
  const [comment, setComment] = useState("");
  const [attach, setAttach] = useState(true);
  const job = useAsync();

  const report = (): AiReport => ({
    kind,
    reason,
    comment: comment.trim(),
    content: attach ? content : "",
    model: `${presetById(app.ai.preset).label} · ${app.ai.model || "?"}`,
    app: `${__APP_VERSION__} · ${platform()}`,
  });

  const submit = () =>
    job.run(async () => {
      if (reportConfigured()) await sendReport(report());
      else window.open(issueUrl(report()), "_blank", "noreferrer");
      setOpen(false);
      setComment("");
      app.toast(t("report.sent"));
      onReported?.();
    });

  return (
    <>
      <button type="button" className="icon-btn report-btn" onClick={() => setOpen(true)} title={t("report.title")} aria-label={t("report.title")}>
        ⚑
      </button>
      {open && (
        <Modal title={t("report.title")} onClose={() => setOpen(false)}>
          <div className="stack">
            <div className="field">
              <span>{t("report.reason")}</span>
              {(["offensive", "wrong", "other"] as const).map((r) => (
                <label key={r} className="row gap">
                  <input type="radio" name="report-reason" checked={reason === r} onChange={() => setReason(r)} /> {t(`report.r.${r}`)}
                </label>
              ))}
            </div>
            <label className="field">
              <span>{t("report.comment")}</span>
              <textarea className="input" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <label className="row gap small">
              <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} /> {t("report.attach")}
            </label>
            <p className="muted small">{reportConfigured() ? t("report.privacy") : t("report.viaGithub")}</p>
            {job.error && <p className="error">{job.error}</p>}
            <div className="row gap end">
              <button className="btn" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn primary" disabled={job.busy} onClick={submit}>
                {job.busy ? t("common.loading") : t("report.send")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
