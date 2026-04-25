"use client";

import { memo, useSyncExternalStore, useState, useEffect } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";

const BODY = "var(--font-special-elite), 'Special Elite', serif";

const CHAR_ART: Record<string, string> = {
  rick: "/concept-art/rick-shooting-zombie.png",
  dan: "/concept-art/dan-shooting-zombie.png",
  pj: "/concept-art/pj-slashing-zombie.png",
  jason: "/concept-art/jason-surprised-zombies.png",
};

interface Props {
  canvasRect: CanvasRect;
}

export const LoadingScreen = memo(function LoadingScreen({ canvasRect }: Props) {
  const visible = useSyncExternalStore(hudState.subscribe, () => hudState.getField("loadingScreenVisible"));
  const charId = useSyncExternalStore(hudState.subscribe, () => hudState.getField("loadingScreenCharId"));
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!visible) { setProgress(0); return; }
    const start = Date.now();
    const duration = 2000;
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(1, elapsed / duration));
      if (elapsed >= duration) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  const artSrc = CHAR_ART[charId] || CHAR_ART.rick;

  return (
    <div
      className="absolute"
      style={{
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
        zIndex: 40,
        background: "#000000",
        overflow: "hidden",
      }}
    >
      {/* Character concept art — full bleed */}
      <img
        src={artSrc}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.8,
        }}
      />

      {/* Dark gradient overlay at bottom for loading bar readability */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "30%",
        background: "linear-gradient(transparent, rgba(0, 0, 0, 0.85))",
      }} />

      {/* Loading bar */}
      <div style={{
        position: "absolute",
        bottom: 40,
        left: "15%",
        right: "15%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
      }}>
        <span style={{
          fontFamily: BODY,
          fontSize: 16,
          color: "#cccccc",
          letterSpacing: "0.15em",
        }}>
          LOADING
        </span>
        <div style={{
          width: "100%",
          height: 4,
          background: "rgba(255, 255, 255, 0.1)",
          borderRadius: 2,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${progress * 100}%`,
            height: "100%",
            background: "linear-gradient(90deg, #ff2244, #ff6644)",
            borderRadius: 2,
            transition: "width 50ms linear",
          }} />
        </div>
      </div>
    </div>
  );
});
