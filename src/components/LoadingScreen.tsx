"use client";

import { memo, useSyncExternalStore, useState, useEffect } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";

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
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (!visible) { setFadeOut(false); return; }
    // Show character art for 1s, then fade out over 1s
    const t = setTimeout(() => setFadeOut(true), 1000);
    return () => clearTimeout(t);
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
        opacity: fadeOut ? 0 : 1,
        transition: fadeOut ? "opacity 1000ms ease-in" : "none",
      }}
    >
      <img
        src={artSrc}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          objectPosition: "center",
          opacity: 0.6,
        }}
        draggable={false}
      />
    </div>
  );
});
