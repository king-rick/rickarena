"use client";

import { memo, useSyncExternalStore, useState, useEffect, useCallback } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";
const VERSION = "v0.9.0";

interface Props {
  canvasRect: CanvasRect;
}

export const MainMenu = memo(function MainMenu({ canvasRect }: Props) {
  const visible = useSyncExternalStore(hudState.subscribe, () => hudState.getField("mainMenuVisible"));
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const handlePlay = useCallback(() => hudState.dispatchMainMenuAction("play"), []);

  useEffect(() => {
    if (!visible) { setControlsOpen(false); return; }
    const handler = (e: KeyboardEvent) => {
      if (controlsOpen) {
        if (e.key === "Escape") setControlsOpen(false);
        return;
      }
      if (e.key === "Enter" || e.key === " ") handlePlay();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, controlsOpen, handlePlay]);

  if (!visible) return null;

  return (
    <div
      className="absolute"
      style={{
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
        zIndex: 30,
        background: "#000",
        overflow: "hidden",
      }}
    >
      {/* Full-bleed concept art background */}
      <img
        src="/concept-art/group-shot.png"
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center 30%",
          opacity: 0.7,
        }}
        draggable={false}
      />

      {/* Top gradient — fades art into dark for title */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "35%",
        background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.85) 0%, transparent 100%)",
      }} />

      {/* Bottom gradient — fades art into dark for buttons */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "45%",
        background: "linear-gradient(to top, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0.6) 50%, transparent 100%)",
      }} />

      {/* Subtle red atmospheric glow */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse at 50% 40%, rgba(180, 20, 20, 0.08) 0%, transparent 60%)",
      }} />

      {/* Content layer */}
      <div style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "48px 0 32px",
      }}>
        {controlsOpen ? (
          <ControlsView onBack={() => setControlsOpen(false)} />
        ) : (
          <>
            {/* Title area */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{
                fontFamily: DISPLAY,
                fontSize: Math.min(canvasRect.width / 7, 130),
                color: "#ff2244",
                letterSpacing: "0.06em",
                textShadow: "0 0 40px rgba(255, 34, 68, 0.6), 0 0 80px rgba(255, 34, 68, 0.25), 0 4px 12px rgba(0, 0, 0, 0.9)",
                lineHeight: 1,
              }}>
                RICKARENA
              </div>
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Menu buttons */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 6,
              marginBottom: 24,
            }}>
              <MenuButton
                label="PLAY"
                hovered={hoveredBtn === "play"}
                onHover={() => setHoveredBtn("play")}
                onLeave={() => setHoveredBtn(null)}
                onClick={handlePlay}
                primary
              />
              <MenuButton
                label="CONTROLS"
                hovered={hoveredBtn === "controls"}
                onHover={() => setHoveredBtn("controls")}
                onLeave={() => setHoveredBtn(null)}
                onClick={() => setControlsOpen(true)}
              />
              <MenuButton
                label="LEADERBOARD"
                hovered={hoveredBtn === "leaderboard"}
                onHover={() => setHoveredBtn("leaderboard")}
                onLeave={() => setHoveredBtn(null)}
                onClick={() => {}}
              />
            </div>

            {/* Version */}
            <span style={{
              fontFamily: BODY,
              fontSize: 11,
              color: "rgba(255, 255, 255, 0.15)",
              position: "absolute",
              bottom: 12,
              right: 16,
            }}>
              {VERSION}
            </span>
          </>
        )}
      </div>
    </div>
  );
});

function MenuButton({
  label, onClick, primary, hovered, onHover, onLeave,
}: {
  label: string; onClick: () => void; primary?: boolean;
  hovered: boolean; onHover: () => void; onLeave: () => void;
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        fontFamily: BODY,
        fontSize: primary ? 24 : 18,
        color: hovered ? "#ffffff" : primary ? "#ff4466" : "rgba(255, 255, 255, 0.4)",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: primary ? "12px 48px" : "8px 40px",
        letterSpacing: "0.15em",
        transition: "color 150ms ease, text-shadow 150ms ease, transform 150ms ease",
        textShadow: hovered
          ? "0 0 20px rgba(255, 34, 68, 0.6), 0 0 40px rgba(255, 34, 68, 0.2)"
          : "none",
        WebkitTextStroke: hovered ? "0.5px rgba(180, 20, 20, 0.7)" : "none",
        paintOrder: "stroke fill" as const,
        transform: hovered ? "scale(1.05)" : "scale(1)",
      }}
    >
      {label}
    </button>
  );
}

function ControlsView({ onBack }: { onBack: () => void }) {
  const controls = [
    ["WASD", "Move"],
    ["SHIFT", "Sprint"],
    ["CLICK / SPACE", "Punch"],
    ["RIGHT-CLICK / F", "Shoot/Use Item"],
    ["E", "Cycle Slots"],
    ["R", "Reload"],
    ["Q", "Ability"],
    ["G", "Grenade"],
    ["B", "Shop"],
    ["I", "Inventory"],
    ["ESC", "Pause"],
  ];

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      flex: 1,
      gap: 28,
    }}>
      <span style={{
        fontFamily: DISPLAY,
        fontSize: 48,
        color: "#ff2244",
        letterSpacing: "0.08em",
        textShadow: "0 0 20px rgba(255, 34, 68, 0.5), 0 4px 8px rgba(0, 0, 0, 0.8)",
      }}>
        CONTROLS
      </span>

      <div style={{
        background: "rgba(0, 0, 0, 0.6)",
        border: "1px solid rgba(255, 34, 68, 0.15)",
        borderRadius: 6,
        padding: "20px 32px",
      }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "auto auto",
          gap: "8px 32px",
        }}>
          {controls.map(([key, action]) => (
            <div key={key! + action!} style={{ display: "contents" }}>
              <span style={{
                fontFamily: BODY,
                fontSize: 16,
                color: "#ffffff",
                WebkitTextStroke: "0.5px rgba(180, 20, 20, 0.5)",
                paintOrder: "stroke fill" as const,
                textAlign: "right",
              }}>
                {key}
              </span>
              <span style={{ fontFamily: BODY, fontSize: 16, color: "rgba(255, 255, 255, 0.5)" }}>
                {action}
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onBack}
        style={{
          fontFamily: BODY,
          fontSize: 16,
          color: "rgba(255, 255, 255, 0.35)",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        ESC — Back
      </button>
    </div>
  );
}
