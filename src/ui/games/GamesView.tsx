import { useState } from "react";
import { useT } from "../../i18n";
import { DrillsGame } from "./DrillsGame";
import { SennaarGame } from "./SennaarGame";
import { TrapGame } from "./TrapGame";

type Game = "sennaar" | "traps" | "drills";

export function GamesView() {
  const { t } = useT();
  const [game, setGame] = useState<Game | null>(null);

  if (game === "sennaar") return <SennaarGame onClose={() => setGame(null)} />;
  if (game === "traps") return <TrapGame onClose={() => setGame(null)} />;
  if (game === "drills") return <DrillsGame onClose={() => setGame(null)} />;

  return (
    <section className="view narrow">
      <h1>{t("games.title")}</h1>
      <p className="muted">{t("games.hint")}</p>
      <div className="game-grid">
        <button className="game-card" onClick={() => setGame("sennaar")}>
          <span className="game-icon">𓂀</span>
          <strong>{t("games.sennaar")}</strong>
          <span className="muted small">{t("games.sennaarHint")}</span>
        </button>
        <button className="game-card" onClick={() => setGame("traps")}>
          <span className="game-icon">⚠</span>
          <strong>{t("games.traps")}</strong>
          <span className="muted small">{t("games.trapsHint")}</span>
        </button>
        <button className="game-card" onClick={() => setGame("drills")}>
          <span className="game-icon">⚙</span>
          <strong>{t("games.drills")}</strong>
          <span className="muted small">{t("games.drillsHint")}</span>
        </button>
      </div>
    </section>
  );
}
