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
      else if (e.key === "Enter" || e.key === " ") hudState.dispatchMenuAction("start");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [menuVisible]);

  if (!menuVisible) return null;

  const char = CHARACTERS[charIndex] || CHARACTERS[0];
  const h = canvasRect.height;
  const w = canvasRect.width;
  const s = Math.min(h / 700, w / 1000); // scale to fill more of the screen

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
      }}
    >
      {/* Backdrop tileset image — dark, tiled, atmospheric */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "url(/assets/sprites/ui/tiles/splash-graveyard.png)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          imageRendering: "pixelated",
          opacity: 0.12,
          filter: "brightness(0.5) saturate(0.3)",
        }}
      />
      {/* Dark vignette overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, transparent 20%, rgba(8, 4, 16, 0.85) 70%, rgba(8, 4, 16, 1) 100%)",
        }}
      />

      {/* Content layer */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Title */}
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: Math.round(100 * s),
            color: "#ff2244",
            letterSpacing: "0.08em",
            textShadow: "0 0 30px rgba(255, 34, 68, 0.5), 0 0 60px rgba(255, 34, 68, 0.2)",
            marginBottom: Math.round(40 * s),
            lineHeight: 1.2,
          }}
        >
          RICKARENA
        </span>

        {/* Two-column layout: character left, info right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: Math.round(64 * s),
            marginBottom: Math.round(32 * s),
            width: "100%",
            maxWidth: Math.round(800 * s),
          }}
        >
          {/* Left column — character sprite + arrows + name + dots */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            {/* Arrows + sprite */}
            <div style={{ display: "flex", alignItems: "center", gap: Math.round(20 * s) }}>
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
                  transition: "color 150ms ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ff6688")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#ff4466")}
              >
                &#9664;
              </button>

              <div
                style={{
                  width: Math.round(300 * s),
                  height: Math.round(340 * s),
                  background: "radial-gradient(ellipse at center, rgba(30, 16, 32, 0.6) 0%, transparent 70%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <AnimatedSprite charId={char.id} size={Math.round(300 * s)} />
              </div>

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
                  transition: "color 150ms ease",
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
                marginTop: Math.round(16 * s),
              }}
            >
              {char.name.toUpperCase()}
            </span>

            {/* Dot indicators */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: Math.round(12 * s),
                marginTop: Math.round(12 * s),
              }}
            >
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
                      boxShadow: i === charIndex ? "0 0 8px rgba(255, 34, 68, 0.5)" : "none",
                      transition: "all 150ms ease",
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* Right column — ability info */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: Math.round(14 * s),
              minWidth: Math.round(240 * s),
            }}
          >
            {/* Ability label */}
            <span
              style={{
                fontFamily: BODY,
                fontSize: Math.round(14 * s),
                color: "#555566",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              Ability
            </span>

            {/* Ability name + key */}
            <div style={{ display: "flex", alignItems: "center", gap: Math.round(12 * s) }}>
              <span
                style={{
                  fontFamily: DISPLAY,
                  fontSize: Math.round(14 * s),
                  color: "#ff4466",
                  border: "1px solid rgba(255, 68, 102, 0.5)",
                  padding: `${Math.round(4 * s)}px ${Math.round(10 * s)}px`,
                  letterSpacing: "0.05em",
                  lineHeight: 1,
                }}
              >
                R
              </span>
              <span
                style={{
                  fontFamily: DISPLAY,
                  fontSize: Math.round(32 * s),
                  color: "#ffffff",
                  textShadow: "0 0 8px rgba(255, 255, 255, 0.15)",
                  lineHeight: 1,
                }}
              >
                {char.ability.name}
              </span>
            </div>

            {/* Divider */}
            <div
              style={{
                width: "100%",
                height: 1,
                background: "linear-gradient(90deg, rgba(255, 34, 68, 0.4), transparent)",
              }}
            />

            {/* Ability description */}
            <span
              style={{
                fontFamily: BODY,
                fontSize: Math.round(16 * s),
                color: "#888899",
                lineHeight: 1.6,
                maxWidth: Math.round(280 * s),
              }}
            >
              {char.ability.desc}
            </span>
          </div>
        </div>

        {/* Enter prompt */}
        <button
          onClick={handleStart}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: DISPLAY,
            fontSize: Math.round(48 * s),
            color: "#ff2244",
            textShadow: "0 0 16px rgba(255, 34, 68, 0.5)",
            animation: "pulse-glow 2.4s ease-in-out infinite",
            padding: 0,
          }}
        >
          ENTER TO PLAY
        </button>
      </div>
    </div>
  );
});
