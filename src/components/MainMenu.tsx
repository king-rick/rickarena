"use client";

import { memo, useSyncExternalStore, useState, useEffect, useCallback } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";
const VERSION = "v0.9.0";

const STROKE_TEXT: React.CSSProperties = {
  fontFamily: BODY,
  color: "#ffffff",
  WebkitTextStroke: "1.5px rgba(180, 20, 20, 0.85)",
  paintOrder: "stroke fill",
  textShadow: "0 1px 4px rgba(0,0,0,0.9)",
};

const TAGLINE =
  "Rick and friends return to their hometown to confront their old nemesis Mason, an aspiring DJ turned undead monstrosity, and crash his sinister zombie rave at the Endicott Estate before it's too late";

let introPlayed = false;

interface Props {
  canvasRect: CanvasRect;
}

export const MainMenu = memo(function MainMenu({ canvasRect }: Props) {
  const visible = useSyncExternalStore(hudState.subscribe, () => hudState.getField("mainMenuVisible"));
  const [phase, setPhase] = useState<"intro" | "menu">(introPlayed ? "menu" : "intro");
  const [controlsOpen, setControlsOpen] = useState(false);
  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  const handlePlay = useCallback(() => hudState.dispatchMainMenuAction("play"), []);

  useEffect(() => {
    if (!visible) { setControlsOpen(false); return; }
    if (phase !== "menu") return;
    const handler = (e: KeyboardEvent) => {
      if (controlsOpen) {
        if (e.key === "Escape") setControlsOpen(false);
        return;
      }
      if (e.key === "Enter" || e.key === " ") handlePlay();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, controlsOpen, handlePlay, phase]);

  const handleIntroComplete = useCallback(() => {
    introPlayed = true;
    setPhase("menu");
  }, []);

  if (!visible) return null;

  if (phase === "intro") {
    return <IntroScreen canvasRect={canvasRect} onComplete={handleIntroComplete} />;
  }

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
          opacity: 0.65,
        }}
        draggable={false}
      />

      {/* Top gradient */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: "30%",
        background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.9) 0%, transparent 100%)",
      }} />

      {/* Bottom gradient */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: "50%",
        background: "linear-gradient(to top, rgba(0, 0, 0, 0.97) 0%, rgba(0, 0, 0, 0.7) 50%, transparent 100%)",
      }} />

      {/* Red atmospheric glow */}
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
        padding: "clamp(24px, 5%, 56px) 0 clamp(20px, 3%, 36px)",
      }}>
        {controlsOpen ? (
          <ControlsView onBack={() => setControlsOpen(false)} />
        ) : (
          <>
            {/* Title */}
            <div style={{
              fontFamily: DISPLAY,
              fontSize: Math.min(canvasRect.width / 8, 110),
              color: "#ff2244",
              letterSpacing: "0.06em",
              textShadow: "0 0 40px rgba(255, 34, 68, 0.6), 0 0 80px rgba(255, 34, 68, 0.25), 0 4px 12px rgba(0, 0, 0, 0.9)",
              lineHeight: 1,
            }}>
              RICKARENA
            </div>

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Menu buttons */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              marginBottom: 16,
            }}>
              <MenuButton label="PLAY" hovered={hoveredBtn === "play"} onHover={() => setHoveredBtn("play")} onLeave={() => setHoveredBtn(null)} onClick={handlePlay} primary />
              <MenuButton label="CONTROLS" hovered={hoveredBtn === "controls"} onHover={() => setHoveredBtn("controls")} onLeave={() => setHoveredBtn(null)} onClick={() => setControlsOpen(true)} />
              <MenuButton label="LEADERBOARD" hovered={hoveredBtn === "leaderboard"} onHover={() => setHoveredBtn("leaderboard")} onLeave={() => setHoveredBtn(null)} onClick={() => {}} />
            </div>

            {/* Version */}
            <span style={{
              fontFamily: BODY,
              fontSize: 10,
              color: "rgba(255, 255, 255, 0.12)",
              position: "absolute",
              bottom: 8,
              right: 12,
            }}>
              {VERSION}
            </span>
          </>
        )}
      </div>
    </div>
  );
});

/* ─── Intro Screen ─── */

function IntroScreen({ canvasRect, onComplete }: { canvasRect: CanvasRect; onComplete: () => void }) {
  const [textVisible, setTextVisible] = useState(false);
  const [timerDone, setTimerDone] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  const assetsReady = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("assetsReady")
  );

  // Step 1: Fade text in after a brief pause in darkness
  useEffect(() => {
    const t = setTimeout(() => setTextVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  // Step 2: Mark timer done after display period
  useEffect(() => {
    if (!textVisible) return;
    // 2s fade-in + 7s hold
    const t = setTimeout(() => setTimerDone(true), 9000);
    return () => clearTimeout(t);
  }, [textVisible]);

  // Step 3: Fade out when BOTH timer is done AND assets are loaded
  useEffect(() => {
    if (timerDone && assetsReady && !fadeOut) {
      setFadeOut(true);
    }
  }, [timerDone, assetsReady, fadeOut]);

  // Step 4: Complete after fade out
  useEffect(() => {
    if (!fadeOut) return;
    const t = setTimeout(onComplete, 1000);
    return () => clearTimeout(t);
  }, [fadeOut, onComplete]);

  // Allow skipping with Space/Enter/Click
  const handleSkip = useCallback(() => {
    introPlayed = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSkip]);

  const barH = Math.round(canvasRect.height * 0.1);

  return (
    <div
      className="absolute"
      onClick={handleSkip}
      style={{
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
        zIndex: 30,
        background: "#000",
        overflow: "hidden",
        cursor: "pointer",
        opacity: fadeOut ? 0 : 1,
        transition: fadeOut ? "opacity 900ms ease-in" : "none",
      }}
    >
      {/* Letterbox bar — top */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0,
        height: barH,
        background: "#000",
        zIndex: 10,
        borderBottom: "1px solid rgba(180, 20, 20, 0.15)",
      }} />

      {/* Letterbox bar — bottom */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: barH,
        background: "#000",
        zIndex: 10,
        borderTop: "1px solid rgba(180, 20, 20, 0.15)",
      }} />

      {/* Centered text — fades in from black */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 12%",
        opacity: textVisible ? 1 : 0,
        transition: "opacity 2s ease-out",
      }}>
        <div style={{
          fontFamily: BODY,
          fontSize: "clamp(16px, 2.2vw, 26px)",
          color: "#ffffff",
          WebkitTextStroke: "2.5px rgba(200, 20, 20, 1)",
          paintOrder: "stroke fill",
          textShadow: "0 0 24px rgba(255, 30, 30, 0.5), 0 0 50px rgba(255, 30, 30, 0.2), 0 2px 8px rgba(0, 0, 0, 1)",
          textAlign: "center",
          lineHeight: 1.9,
          letterSpacing: "0.06em",
          maxWidth: 620,
        }}>
          {TAGLINE}
        </div>

        {/* Red accent line */}
        <div style={{
          width: textVisible ? 140 : 0,
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(200, 20, 20, 0.7), transparent)",
          marginTop: 24,
          transition: "width 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) 1s",
        }} />

        {/* Subtle loading indicator — only shows if timer done but still waiting on assets */}
        {timerDone && !assetsReady && (
          <div style={{
            ...STROKE_TEXT,
            fontSize: 12,
            WebkitTextStroke: "1px rgba(180, 20, 20, 0.6)",
            marginTop: 32,
            opacity: 0.5,
            letterSpacing: "0.2em",
            animation: "intro-pulse 1.5s ease-in-out infinite",
          }}>
            LOADING
          </div>
        )}
      </div>

      <style>{`@keyframes intro-pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.6; } }`}</style>
    </div>
  );
}

/* ─── Menu Components ─── */

function MenuButton({
  label, onClick, primary, hovered, onHover, onLeave,
}: {
  label: string; onClick: () => void; primary?: boolean;
  hovered: boolean; onHover: () => void; onLeave: () => void;
}) {
  const size = primary ? 26 : 18;
  const strokeWidth = primary ? "2px" : "1.5px";

  return (
    <button
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      style={{
        ...STROKE_TEXT,
        fontSize: size,
        WebkitTextStroke: hovered
          ? `${strokeWidth} rgba(220, 40, 40, 1)`
          : `${strokeWidth} rgba(180, 20, 20, 0.85)`,
        color: "#ffffff",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: primary ? "10px 48px" : "6px 40px",
        letterSpacing: "0.18em",
        transition: "transform 150ms ease, text-shadow 200ms ease, -webkit-text-stroke 150ms ease",
        textShadow: hovered
          ? "0 0 16px rgba(255, 34, 68, 0.7), 0 0 32px rgba(255, 34, 68, 0.3), 0 2px 6px rgba(0,0,0,0.9)"
          : "0 1px 4px rgba(0,0,0,0.9)",
        transform: hovered ? "scale(1.06)" : "scale(1)",
        opacity: primary ? 1 : hovered ? 1 : 0.75,
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
                ...STROKE_TEXT,
                fontSize: 16,
                WebkitTextStroke: "1.5px rgba(180, 20, 20, 0.85)",
                textAlign: "right",
              }}>
                {key}
              </span>
              <span style={{
                ...STROKE_TEXT,
                fontSize: 16,
                WebkitTextStroke: "1px rgba(180, 20, 20, 0.6)",
                opacity: 0.7,
              }}>
                {action}
              </span>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onBack}
        style={{
          ...STROKE_TEXT,
          fontSize: 14,
          WebkitTextStroke: "1px rgba(180, 20, 20, 0.6)",
          background: "none",
          border: "none",
          cursor: "pointer",
          opacity: 0.6,
          letterSpacing: "0.1em",
        }}
      >
        ESC — Back
      </button>
    </div>
  );
}
