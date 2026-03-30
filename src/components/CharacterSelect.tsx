"use client";

import { memo, useSyncExternalStore, useEffect, useState, useCallback } from "react";
import { hudState } from "@/game/HUDState";
import { CHARACTERS } from "@/game/data/characters";
import { CHARACTER_ANIMATIONS } from "@/game/data/animations";
import type { CanvasRect } from "./Game";

interface Props {
  canvasRect: CanvasRect;
}

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

function AnimatedSprite({ charId, size }: { charId: string; size: number }) {
  const [frameIdx, setFrameIdx] = useState(0);
  const animData = CHARACTER_ANIMATIONS[charId]?.find((a) => a.type === "breathing-idle");
  const frameCount = animData?.frames ?? 1;
  const frameRate = 8;

  useEffect(() => {
    setFrameIdx(0);
    if (frameCount <= 1) return;
    const interval = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % frameCount);
    }, 1000 / frameRate);
    return () => clearInterval(interval);
  }, [charId, frameCount]);

  const framePath = frameCount > 1
    ? `/assets/sprites/${charId}/breathing-idle/south/frame_${String(frameIdx).padStart(3, "0")}.png`
    : `/assets/sprites/${charId}/rotations/south.png`;

  return (
    <img
      src={framePath}
      alt=""
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        userSelect: "none",
        pointerEvents: "none",
      }}
      draggable={false}
    />
  );
}

export const CharacterSelect = memo(function CharacterSelect({ canvasRect }: Props) {
  const menuVisible = useSyncExternalStore(hudState.subscribe, () => hudState.getField("menuVisible"));
  const charIndex = useSyncExternalStore(hudState.subscribe, () => hudState.getField("menuCharIndex"));

  const handlePrev = useCallback(() => hudState.dispatchMenuAction("prev"), []);
  const handleNext = useCallback(() => hudState.dispatchMenuAction("next"), []);
  const handleStart = useCallback(() => hudState.dispatchMenuAction("start"), []);

  useEffect(() => {
    if (!menuVisible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") hudState.dispatchMenuAction("prev");
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") hudState.dispatchMenuAction("next");
      else if (e.key === "Enter") hudState.dispatchMenuAction("start");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [menuVisible]);

  if (!menuVisible) return null;

  const char = CHARACTERS[charIndex] || CHARACTERS[0];

  // Scale everything relative to container height
  const h = canvasRect.height;
  const s = h / 900; // design height baseline

  return (
    <div
      className="absolute"
      style={{
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
        zIndex: 30,
        background: "#080810",
        fontFamily: BODY,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 0,
      }}
    >
      {/* Title */}
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: Math.round(90 * s),
          color: "#ff2244",
          letterSpacing: "0.08em",
          textShadow: "0 0 30px rgba(255, 34, 68, 0.5), 0 0 60px rgba(255, 34, 68, 0.2)",
          marginBottom: Math.round(12 * s),
          lineHeight: 1.2,
        }}
      >
        RICKARENA
      </span>

      {/* Main content — sprite panel + arrows */}
      <div
        className="flex items-center justify-center"
        style={{ gap: Math.round(30 * s), marginBottom: Math.round(12 * s) }}
      >
        {/* Left arrow */}
        <button
          onClick={handlePrev}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: Math.round(44 * s),
            color: "#ff4466",
            padding: "0 8px",
            fontFamily: BODY,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ff6688")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#ff4466")}
        >
          &#9664;
        </button>

        {/* Sprite panel */}
        <div
          style={{
            width: Math.round(260 * s),
            height: Math.round(280 * s),
            backgroundImage: "url(/assets/sprites/ui/horror/panel-frame.png)",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <AnimatedSprite charId={char.id} size={Math.round(180 * s)} />
        </div>

        {/* Right arrow */}
        <button
          onClick={handleNext}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: Math.round(44 * s),
            color: "#ff4466",
            padding: "0 8px",
            fontFamily: BODY,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#ff6688")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#ff4466")}
        >
          &#9654;
        </button>
      </div>

      {/* Character name */}
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: Math.round(56 * s),
          color: "#ffffff",
          letterSpacing: "0.06em",
          textShadow: "0 0 16px rgba(255, 255, 255, 0.2)",
          lineHeight: 1,
          marginBottom: Math.round(4 * s),
        }}
      >
        {char.name.toUpperCase()}
      </span>

      {/* Full name */}
      <span
        style={{
          fontFamily: BODY,
          fontSize: Math.round(16 * s),
          color: "#555566",
          letterSpacing: "0.15em",
          marginBottom: Math.round(10 * s),
        }}
      >
        {char.fullName}
      </span>

      {/* Dot indicators */}
      <div className="flex items-center" style={{ gap: Math.round(12 * s), marginBottom: Math.round(14 * s) }}>
        {CHARACTERS.map((c, i) => {
          const dotSize = i === charIndex ? Math.round(14 * s) : Math.round(9 * s);
          return (
            <div
              key={c.id}
              style={{
                width: dotSize,
                height: dotSize,
                borderRadius: "50%",
                background: i === charIndex ? "#ff2244" : "#333344",
                transition: "all 150ms ease",
              }}
            />
          );
        })}
      </div>

      {/* Ability card */}
      <div
        style={{
          backgroundImage: "url(/assets/sprites/ui/horror/btn-a-normal.png)",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
          padding: `${Math.round(10 * s)}px ${Math.round(32 * s)}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: Math.round(3 * s),
          marginBottom: Math.round(16 * s),
        }}
      >
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: Math.round(12 * s),
              color: "#ff4466",
              border: "1px solid #ff4466",
              padding: `${Math.round(2 * s)}px ${Math.round(6 * s)}px`,
              letterSpacing: "0.05em",
            }}
          >
            R
          </span>
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: Math.round(22 * s),
              color: "#ffffff",
              textShadow: "0 0 8px rgba(255, 255, 255, 0.15)",
            }}
          >
            {char.ability.name}
          </span>
        </div>
        <span
          style={{
            fontFamily: BODY,
            fontSize: Math.round(14 * s),
            color: "#999999",
            textAlign: "center",
            maxWidth: Math.round(400 * s),
          }}
        >
          {char.ability.desc}
        </span>
      </div>

      {/* Enter prompt */}
      <button
        onClick={handleStart}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          fontFamily: DISPLAY,
          fontSize: Math.round(40 * s),
          color: "#ff2244",
          textShadow: "0 0 16px rgba(255, 34, 68, 0.5)",
          animation: "pulse-glow 2.4s ease-in-out infinite",
          padding: 0,
        }}
      >
        ENTER TO PLAY
      </button>
    </div>
  );
});
