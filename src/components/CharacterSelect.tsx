"use client";

import { memo, useSyncExternalStore, useEffect, useState, useCallback } from "react";
import { hudState } from "@/game/HUDState";
import { CHARACTERS } from "@/game/data/characters";
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

const STROKE: React.CSSProperties = {
  fontFamily: BODY,
  color: "#ffffff",
  WebkitTextStroke: "1.5px rgba(180, 20, 20, 0.85)",
  paintOrder: "stroke fill",
  textShadow: "0 1px 4px rgba(0,0,0,0.9)",
};

function playMenuSound(src: string, volume = 0.3) {
  try { const a = new Audio(src); a.volume = volume; a.play(); } catch {}
}
const menuClick = () => playMenuSound("/assets/audio/ui/ui-click.wav", 0.2);
const menuConfirm = () => playMenuSound("/assets/audio/ui/confirmation_002.ogg", 0.35);

export const CharacterSelect = memo(function CharacterSelect({ canvasRect }: Props) {
  const menuVisible = useSyncExternalStore(hudState.subscribe, () => hudState.getField("menuVisible"));
  const charIndex = useSyncExternalStore(hudState.subscribe, () => hudState.getField("menuCharIndex"));
  const [transitioning, setTransitioning] = useState(false);

  const handlePrev = useCallback(() => {
    if (transitioning) return;
    setTransitioning(true);
    menuClick();
    hudState.dispatchMenuAction("prev");
    setTimeout(() => setTransitioning(false), 200);
  }, [transitioning]);

  const handleNext = useCallback(() => {
    if (transitioning) return;
    setTransitioning(true);
    menuClick();
    hudState.dispatchMenuAction("next");
    setTimeout(() => setTransitioning(false), 200);
  }, [transitioning]);

  const handleStart = useCallback(() => { menuClick(); hudState.dispatchMenuAction("start"); }, []);
  const handleBack = useCallback(() => { menuClick(); hudState.dispatchMenuAction("back"); }, []);

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
      {/* Full-bleed concept art — the star of the screen */}
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
          opacity: 0.75,
          transition: "opacity 300ms ease",
        }}
        draggable={false}
      />

      {/* Bottom gradient — dark zone for info */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "45%",
        background: "linear-gradient(to top, rgba(0, 0, 0, 0.97) 0%, rgba(0, 0, 0, 0.7) 55%, transparent 100%)",
      }} />

      {/* Top gradient */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: "10%",
        background: "linear-gradient(rgba(0, 0, 0, 0.6), transparent)",
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
          padding: "16px 28px 0",
          flexShrink: 0,
        }}>
          <span style={{
            ...STROKE,
            fontSize: 12,
            WebkitTextStroke: "1px rgba(180, 20, 20, 0.6)",
            letterSpacing: "0.25em",
            opacity: 0.6,
          }}>
            SELECT CHARACTER
          </span>
          <button
            onClick={handleBack}
            style={{
              ...STROKE,
              fontSize: 12,
              WebkitTextStroke: "1px rgba(180, 20, 20, 0.6)",
              background: "none", border: "none", cursor: "pointer",
              letterSpacing: "0.1em",
              opacity: 0.4,
            }}
          >
            ESC — BACK
          </button>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Bottom info panel */}
        <div style={{
          padding: "0 clamp(24px, 5%, 60px) clamp(20px, 3%, 36px)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}>
          {/* Name + ability row */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            gap: 32,
            flexWrap: "wrap",
          }}>
            {/* Left: Character name */}
            <div>
              <div style={{
                fontFamily: DISPLAY,
                fontSize: "clamp(48px, 8vw, 90px)",
                color: "#ff2244",
                letterSpacing: "0.04em",
                textShadow: "0 0 30px rgba(255, 34, 68, 0.5), 0 4px 12px rgba(0, 0, 0, 0.9)",
                lineHeight: 1,
              }}>
                {char.name.toUpperCase()}
              </div>
            </div>

            {/* Right: Ability card */}
            <div style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 4,
              maxWidth: 340,
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}>
                <span style={{
                  ...STROKE,
                  fontSize: 11,
                  WebkitTextStroke: "1px rgba(180, 20, 20, 0.5)",
                  letterSpacing: "0.2em",
                  opacity: 0.45,
                }}>
                  ABILITY · Q
                </span>
                <div style={{
                  width: 40,
                  height: 1,
                  background: "linear-gradient(90deg, rgba(200, 20, 20, 0.4), transparent)",
                }} />
              </div>
              <span style={{
                ...STROKE,
                fontSize: 20,
                WebkitTextStroke: "1.5px rgba(180, 20, 20, 0.85)",
                letterSpacing: "0.05em",
              }}>
                {char.ability.name}
              </span>
              <span style={{
                fontFamily: BODY,
                fontSize: 13,
                color: "rgba(255, 255, 255, 0.45)",
                textAlign: "right",
                lineHeight: 1.5,
                textShadow: "0 1px 3px rgba(0,0,0,0.9)",
              }}>
                {char.ability.desc} · {char.ability.cooldown}s cooldown
              </span>
            </div>
          </div>

          {/* Nav dots + play button */}
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            {/* Dots */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {CHARACTERS.map((c, i) => {
                const active = i === charIndex;
                return (
                  <div
                    key={c.id}
                    style={{
                      width: active ? 10 : 6,
                      height: active ? 10 : 6,
                      borderRadius: "50%",
                      background: active ? "#ff2244" : "rgba(255, 255, 255, 0.15)",
                      boxShadow: active ? "0 0 10px rgba(255, 34, 68, 0.5)" : "none",
                      transition: "all 200ms ease",
                    }}
                  />
                );
              })}
            </div>

            {/* Play */}
            <button
              onClick={handleStart}
              style={{
                ...STROKE,
                fontSize: 16,
                WebkitTextStroke: "1.5px rgba(180, 20, 20, 0.85)",
                background: "none",
                border: "1px solid rgba(200, 20, 20, 0.3)",
                borderRadius: 3,
                padding: "8px 36px",
                cursor: "pointer",
                letterSpacing: "0.18em",
                transition: "all 150ms ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(255, 34, 68, 0.6)";
                e.currentTarget.style.boxShadow = "0 0 16px rgba(255, 34, 68, 0.2)";
                e.currentTarget.style.textShadow = "0 0 12px rgba(255, 34, 68, 0.6), 0 1px 4px rgba(0,0,0,0.9)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(200, 20, 20, 0.3)";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.textShadow = "0 1px 4px rgba(0,0,0,0.9)";
              }}
            >
              PLAY
            </button>
          </div>
        </div>

        {/* Nav arrows — screen edges */}
        <button
          onClick={handlePrev}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff4466"; e.currentTarget.style.transform = "translateY(-50%) scale(1.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.2)"; e.currentTarget.style.transform = "translateY(-50%)"; }}
          style={{
            position: "absolute", left: 16, top: "45%",
            transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            fontSize: 24, color: "rgba(255, 255, 255, 0.2)",
            padding: "24px 12px", fontFamily: BODY,
            transition: "color 150ms ease, transform 150ms ease",
            zIndex: 2,
          }}
        >
          {"\u25C0"}
        </button>
        <button
          onClick={handleNext}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#ff4466"; e.currentTarget.style.transform = "translateY(-50%) scale(1.2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255, 255, 255, 0.2)"; e.currentTarget.style.transform = "translateY(-50%)"; }}
          style={{
            position: "absolute", right: 16, top: "45%",
            transform: "translateY(-50%)",
            background: "none", border: "none", cursor: "pointer",
            fontSize: 24, color: "rgba(255, 255, 255, 0.2)",
            padding: "24px 12px", fontFamily: BODY,
            transition: "color 150ms ease, transform 150ms ease",
            zIndex: 2,
          }}
        >
          {"\u25B6"}
        </button>
      </div>
    </div>
  );
});
