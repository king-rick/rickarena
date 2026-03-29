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

  // Scale from Phaser internal coords to CSS pixels
  const scaleX = canvasRect.width / PHASER_W;
  const scaleY = canvasRect.height / PHASER_H;

  const cssX = mmX * scaleX;
  const cssY = mmY * scaleY;
  const cssW = mmSize * scaleX;
  const cssH = mmSize * scaleY;
  const border = Math.max(2, Math.round(3 * scaleX));

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: cssX - border,
        top: cssY - border,
        width: cssW + border * 2,
        height: cssH + border * 2,
        border: `${border}px solid #661122`,
        boxShadow:
          "0 0 8px rgba(255, 34, 68, 0.4), 0 0 16px rgba(255, 34, 68, 0.15), inset 0 0 6px rgba(255, 34, 68, 0.2)",
        zIndex: 15,
      }}
    />
  );
});
