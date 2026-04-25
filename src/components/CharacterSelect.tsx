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

const CHAR_ART: Record<string, string> = {
  rick: "/concept-art/rick-shooting-zombie.png",
  dan: "/concept-art/dan-shooting-zombie.png",
  pj: "/concept-art/pj-slashing-zombie.png",
  jason: "/concept-art/jason-surprised-zombies.png",
};

// Animation config per character: anim name, direction, ms per frame
const CHAR_ANIM: Record<string, { anim: string; dir: string; ms: number }> = {
  rick: { anim: "shooting-pistol", dir: "south-east", ms: 250 },
  dan: { anim: "electric-fist", dir: "south-east", ms: 220 },
  pj: { anim: "swinging-katana", dir: "south-east", ms: 400 },
  jason: { anim: "light-cigarette", dir: "south-east", ms: 350 },
};

function ActionSprite({ charId, size }: { charId: string; size: number }) {
  const [frameIdx, setFrameIdx] = useState(0);
  const cfg = CHAR_ANIM[charId] ?? { anim: "breathing-idle", dir: "south", ms: 150 };
  const frameCount = CHARACTER_ANIMATIONS[charId]?.find((a) => a.type === cfg.anim)?.frames ?? 1;

  useEffect(() => {
    setFrameIdx(0);
    if (frameCount <= 1) return;
    const interval = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % frameCount);
    }, cfg.ms);
    return () => clearInterval(interval);
  }, [charId, frameCount, cfg.ms]);

  const framePath = `/assets/sprites/${charId}/${cfg.anim}/${cfg.dir}/frame_${String(frameIdx).padStart(3, "0")}.png`;

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
        filter: "drop-shadow(0 0 20px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 6px rgba(255, 34, 68, 0.12))",
      }}
      draggable={false}
    />
  );
}

export const CharacterSelect = memo(function CharacterSelect({ canvasRect }: Props) {
  const menuVisible = useSyncExternalStore(hudState.subscribe, () => hudState.getField("menuVisible"));
  const charIndex = useSyncExternalStore(hudState.subscribe, () => hudState.getField("menuCharIndex"));
  const [transitioning, setTransitioning] = useState(false);

  const handlePrev = useCallback(() => {
    if (transitioning) return;
    setTransitioning(true);
    hudState.dispatchMenuAction("prev");
    setTimeout(() => setTransitioning(false), 200);
  }, [transitioning]);

  const handleNext = useCallback(() => {
    if (transitioning) return;
    setTransitioning(true);
    hudState.dispatchMenuAction("next");
    setTimeout(() => setTransitioning(false), 200);
  }, [transitioning]);

  const handleStart = useCallback(() => hudState.dispatchMenuAction("start"), []);
  const handleBack = useCallback(() => hudState.dispatchMenuAction("back"), []);

  useEffect(() => {
    if (!menuVisible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") handlePrev();
      else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") handleNext();
      else if (e.key === "Enter" || e.key === " ") handleStart();
      else if (e.key === "Escape") handleBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [menuVisible, handlePrev, handleNext, handleStart, handleBack]);

  if (!menuVisible) return null;

  const char = CHARACTERS[charIndex] || CHARACTERS[0];
  const artSrc = CHAR_ART[char.id] || CHAR_ART.rick;
  const h = canvasRect.height;
  const w = canvasRect.width;
  const spriteSize = Math.round(Math.min(h * 0.42, w * 0.28));

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
      {/* Full-bleed concept art */}
      <img
        key={char.id}
        src={artSrc}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          opacity: 0.5,
          transition: "opacity 300ms ease",
        }}
        draggable={false}
      />

      {/* Gradient overlays */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to right, rgba(0, 0, 0, 0.75) 0%, rgba(0, 0, 0, 0.3) 50%, rgba(0, 0, 0, 0.6) 100%)",
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "40%",
        background: "linear-gradient(transparent, rgba(0, 0, 0, 0.95))",
      }} />
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "12%",
        background: "linear-gradient(rgba(0, 0, 0, 0.7), transparent)",
      }} />

      {/* Content */}
      <div style={{
        position: "relative",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* Top bar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 28px 0",
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: BODY, fontSize: 13,
            color: "rgba(255, 255, 255, 0.25)", letterSpacing: "0.25em",
          }}>
            SELECT CHARACTER
          </span>
          <button
            onClick={handleBack}
            style={{
              fontFamily: BODY, fontSize: 13,
              color: "rgba(255, 255, 255, 0.25)",
              background: "none", border: "none", cursor: "pointer",
              letterSpacing: "0.1em",
            }}
          >
            ESC — BACK
          </button>
        </div>

        {/* Center area — character showcase */}
        <div style={{ flex: 1, position: "relative" }}>

          {/* Character column: name, sprite, ability — all stacked center */}
          <div style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 0,
            paddingBottom: 8,
          }}>
            {/* Name */}
            <div style={{
              fontFamily: DISPLAY,
              fontSize: Math.min(w / 10, 80),
              color: "#ff2244",
              letterSpacing: "0.04em",
              textShadow: "0 0 30px rgba(255, 34, 68, 0.5), 0 4px 12px rgba(0, 0, 0, 0.9)",
              lineHeight: 1,
              marginBottom: 8,
            }}>
              {char.name.toUpperCase()}
            </div>

            {/* Sprite */}
            <ActionSprite charId={char.id} size={spriteSize} />

            {/* Ability — clean text below sprite */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              marginTop: 8,
            }}>
              <span style={{
                fontFamily: BODY,
                fontSize: 18,
                color: "#ffffff",
                WebkitTextStroke: "0.5px rgba(180, 20, 20, 0.5)",
                paintOrder: "stroke fill" as const,
                letterSpacing: "0.05em",
              }}>
                {char.ability.name}
              </span>
              <span style={{
                fontFamily: BODY,
                fontSize: 13,
                color: "rgba(255, 255, 255, 0.35)",
                textAlign: "center",
                maxWidth: 280,
                lineHeight: 1.3,
              }}>
                {char.ability.desc}
              </span>
            </div>
          </div>

          {/* Nav arrows — flanking center */}
          <button
            onClick={handlePrev}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#ff4466"; e.currentTarget.style.transform = "translateY(-50%) translateX(-3px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.15)"; e.currentTarget.style.transform = "translateY(-50%)"; }}
            style={{
              position: "absolute", left: "25%", top: "45%",
              transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              fontSize: 28, color: "rgba(255, 255, 255, 0.15)",
              padding: "20px 16px", fontFamily: BODY,
              transition: "color 150ms ease, transform 150ms ease",
              zIndex: 2,
            }}
          >
            {"\u25C0"}
          </button>
          <button
            onClick={handleNext}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#ff4466"; e.currentTarget.style.transform = "translateY(-50%) translateX(3px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.15)"; e.currentTarget.style.transform = "translateY(-50%)"; }}
            style={{
              position: "absolute", right: "25%", top: "45%",
              transform: "translateY(-50%)",
              background: "none", border: "none", cursor: "pointer",
              fontSize: 28, color: "rgba(255, 255, 255, 0.15)",
              padding: "20px 16px", fontFamily: BODY,
              transition: "color 150ms ease, transform 150ms ease",
              zIndex: 2,
            }}
          >
            {"\u25B6"}
          </button>
        </div>

        {/* Bottom: dots + play */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 14,
          paddingBottom: 28,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {CHARACTERS.map((c, i) => {
              const active = i === charIndex;
              return (
                <div
                  key={c.id}
                  style={{
                    width: active ? 12 : 6,
                    height: active ? 12 : 6,
                    borderRadius: "50%",
                    background: active ? "#ff2244" : "rgba(255, 255, 255, 0.15)",
                    boxShadow: active ? "0 0 10px rgba(255, 34, 68, 0.5)" : "none",
                    transition: "all 200ms ease",
                  }}
                />
              );
            })}
          </div>

          <button
            onClick={handleStart}
            style={{
              fontFamily: BODY, fontSize: 20, color: "#ff4466",
              background: "none",
              border: "1px solid rgba(255, 34, 68, 0.3)",
              borderRadius: 4,
              padding: "10px 48px", cursor: "pointer",
              letterSpacing: "0.15em",
              transition: "all 150ms ease",
              WebkitTextStroke: "0.5px rgba(180, 20, 20, 0.5)",
              paintOrder: "stroke fill" as const,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#ffffff";
              e.currentTarget.style.borderColor = "rgba(255, 34, 68, 0.6)";
              e.currentTarget.style.boxShadow = "0 0 20px rgba(255, 34, 68, 0.2)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#ff4466";
              e.currentTarget.style.borderColor = "rgba(255, 34, 68, 0.3)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            ENTER TO PLAY
          </button>
        </div>
      </div>
    </div>
  );
});
