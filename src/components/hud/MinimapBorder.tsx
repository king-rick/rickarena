"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "../Game";

// Phaser internal resolution (must match config.ts)
const PHASER_W = 1920;
const PHASER_H = 1080;

interface Props {
  canvasRect: CanvasRect;
}

export const MinimapBorder = memo(function MinimapBorder({ canvasRect }: Props) {
  const mmX = useSyncExternalStore(hudState.subscribe, () => hudState.getField("minimapX"));
  const mmY = useSyncExternalStore(hudState.subscribe, () => hudState.getField("minimapY"));
  const mmSize = useSyncExternalStore(hudState.subscribe, () => hudState.getField("minimapSize"));

  if (mmSize === 0) return null;

  const scaleX = canvasRect.width / PHASER_W;
  const scaleY = canvasRect.height / PHASER_H;

  const cssX = mmX * scaleX;
  const cssY = mmY * scaleY;
  const cssW = mmSize * scaleX;
  const cssH = mmSize * scaleY;

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: cssX - 1,
        top: cssY - 1,
        width: cssW + 2,
        height: cssH + 2,
        border: "1px solid rgba(255, 34, 68, 0.25)",
        borderRadius: 3,
        boxShadow: "0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.1), inset 0 0 6px rgba(0, 0, 0, 0.5)",
        zIndex: 16,
      }}
    />
  );
});
