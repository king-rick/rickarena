"use client";

import { memo, useSyncExternalStore, useEffect, useState, useCallback } from "react";
import { hudState } from "@/game/HUDState";
import type { LeaderboardEntry } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const GameOverOverlay = memo(function GameOverOverlay() {
  const gameOver = useSyncExternalStore(hudState.subscribe, () => hudState.getField("gameOver"));
  const phase = useSyncExternalStore(hudState.subscribe, () => hudState.getField("gameOverPhase"));
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("gameOverWave"));
  const kills = useSyncExternalStore(hudState.subscribe, () => hudState.getField("gameOverKills"));
  const charName = useSyncExternalStore(hudState.subscribe, () => hudState.getField("gameOverCharName"));
  const leaderboard = useSyncExternalStore(hudState.subscribe, () => hudState.getField("leaderboard"));
  const highlightId = useSyncExternalStore(hudState.subscribe, () => hudState.getField("leaderboardHighlightId"));

  if (!gameOver || !phase) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-auto"
      style={{ zIndex: 50 }}
    >
      {/* Background overlay + splash */}
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.75)" }} />
      <img
        src="/assets/sprites/ui/tiles/splash-graveyard.png"
        alt=""
        className="absolute inset-0"
        style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.25, filter: "saturate(0.5) hue-rotate(200deg)" }}
      />

      <div className="relative flex flex-col items-center justify-center" style={{ height: "100%" }}>
        {/* Death header — always visible */}
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 100,
            color: "#cc2233",
            textShadow: "0 0 30px rgba(204, 34, 51, 0.6), 0 4px 12px rgba(0, 0, 0, 0.8)",
            animation: "fade-in 0.8s ease-in",
          }}
        >
          YOU DIED
        </span>
        <span
          style={{
            fontFamily: BODY,
            fontSize: 36,
            color: "#cccccc",
            marginTop: 12,
            animation: "fade-in 0.8s ease-in",
          }}
        >
          Wave {wave} | {kills} kills
        </span>

        {/* Phase-specific content */}
        {phase === "entry" && <NameEntry />}
        {phase === "leaderboard" && (
          <LeaderboardDisplay leaderboard={leaderboard} highlightId={highlightId} />
        )}
      </div>
    </div>
  );
});

function NameEntry() {
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(true);
  const MAX_LEN = 8;

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 400);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (submitted) return;
      if (e.key === "Escape") {
        // Skip leaderboard entry
        hudState.dispatchGameOverAction("skipScore");
        return;
      } else if (e.key === "Enter") {
        if (name.length === 0) return;
        setSubmitted(true);
        hudState.dispatchGameOverAction("submitName", name);
      } else if (e.key === "Backspace") {
        setName((n) => n.slice(0, -1));
      } else if (/^[a-zA-Z0-9]$/.test(e.key) && name.length < MAX_LEN) {
        setName((n) => n + e.key.toUpperCase());
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [name, submitted]);

  return (
    <div
      className="flex flex-col items-center"
      style={{ marginTop: 40, animation: "fade-in 0.4s ease-in" }}
    >
      <span style={{ fontFamily: BODY, fontSize: 28, color: "#999999" }}>
        ENTER YOUR NAME
      </span>
      <span
        style={{
          fontFamily: BODY,
          fontSize: 52,
          color: "#ffffff",
          fontWeight: "bold",
          marginTop: 16,
          minHeight: 64,
          letterSpacing: "0.05em",
        }}
      >
        {submitted ? name : name + (cursorVisible ? "_" : "")}
      </span>
      <span style={{ fontFamily: BODY, fontSize: 18, color: submitted ? "#cc3333" : "#666666", marginTop: 16 }}>
        {submitted ? "SUBMITTING..." : "TYPE YOUR NAME    ENTER TO SUBMIT    ESC TO SKIP"}
      </span>
    </div>
  );
}

function LeaderboardDisplay({
  leaderboard,
  highlightId,
}: {
  leaderboard: LeaderboardEntry[];
  highlightId: number | null;
}) {
  const [canContinue, setCanContinue] = useState(false);
  const [blinkVisible, setBlinkVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setCanContinue(true), 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!canContinue) return;
    const interval = setInterval(() => setBlinkVisible((v) => !v), 600);
    return () => clearInterval(interval);
  }, [canContinue]);

  useEffect(() => {
    if (!canContinue) return;
    const handler = () => hudState.dispatchGameOverAction("returnToMenu");
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canContinue]);

  const maxRows = Math.min(leaderboard.length, 20);

  return (
    <div
      className="flex flex-col items-center"
      style={{ marginTop: 40, width: "100%", animation: "fade-in 0.5s ease-in" }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 64,
          color: "#cc2233",
          textShadow: "0 0 16px rgba(204, 34, 51, 0.4)",
          marginBottom: 16,
        }}
      >
        LEADERBOARD
      </span>

      {/* Header */}
      <div className="flex" style={{ width: 500, marginBottom: 8 }}>
        <span style={{ ...colStyle, width: 50, color: "#999999" }}>#</span>
        <span style={{ ...colStyle, flex: 1, color: "#999999" }}>NAME</span>
        <span style={{ ...colStyle, width: 80, textAlign: "right", color: "#999999" }}>KILLS</span>
        <span style={{ ...colStyle, width: 80, textAlign: "right", color: "#999999" }}>WAVE</span>
      </div>

      <div style={{ width: 500, height: 1, background: "rgba(102, 102, 102, 0.5)", marginBottom: 8 }} />

      {/* Rows */}
      {maxRows === 0 ? (
        <span style={{ fontFamily: BODY, fontSize: 24, color: "#666666", marginTop: 32 }}>
          No scores yet. You're the first!
        </span>
      ) : (
        leaderboard.slice(0, maxRows).map((entry, i) => {
          const isHl = entry.id === highlightId;
          return (
            <div
              key={entry.id}
              className="flex"
              style={{
                width: 500,
                padding: "4px 0",
                background: isHl ? "rgba(255, 204, 0, 0.1)" : "transparent",
              }}
            >
              <span style={{ ...colStyle, width: 50, color: isHl ? "#ffcc00" : "#cccccc", fontSize: isHl ? 22 : 20 }}>
                {i + 1}
              </span>
              <span style={{ ...colStyle, flex: 1, color: isHl ? "#ffcc00" : "#cccccc", fontSize: isHl ? 22 : 20 }}>
                {entry.name}
              </span>
              <span style={{ ...colStyle, width: 80, textAlign: "right", color: isHl ? "#ffcc00" : "#cccccc", fontSize: isHl ? 22 : 20 }}>
                {entry.kills}
              </span>
              <span style={{ ...colStyle, width: 80, textAlign: "right", color: isHl ? "#ffcc00" : "#cccccc", fontSize: isHl ? 22 : 20 }}>
                {entry.wave}
              </span>
            </div>
          );
        })
      )}

      {/* Continue prompt */}
      <span
        style={{
          fontFamily: BODY,
          fontSize: 22,
          color: "#666666",
          marginTop: 40,
          opacity: canContinue && blinkVisible ? 1 : 0.3,
          transition: "opacity 200ms ease",
        }}
      >
        PRESS ANY KEY TO CONTINUE
      </span>
    </div>
  );
}

const colStyle: React.CSSProperties = {
  fontFamily: "var(--font-special-elite), 'Special Elite', serif",
  fontSize: 20,
  fontWeight: "bold",
};
