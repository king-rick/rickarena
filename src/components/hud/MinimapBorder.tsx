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

  // Ring overlaps slightly beyond the minimap area
  const ringPad = Math.round(8 * scaleX);

  return (
    <>
      {/* Circular clip mask over the Phaser minimap camera */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: cssX,
          top: cssY,
          width: cssW,
          height: cssH,
          borderRadius: "50%",
          overflow: "hidden",
          zIndex: 14,
          boxShadow: "inset 0 0 10px rgba(0, 0, 0, 0.8)",
        }}
      />
      {/* Brown ring border on top */}
      <img
        src="/assets/sprites/ui/minimap-ring.png"
        alt=""
        className="absolute pointer-events-none"
        style={{
          left: cssX - ringPad,
          top: cssY - ringPad,
          width: cssW + ringPad * 2,
          height: cssH + ringPad * 2,
          imageRendering: "pixelated",
          zIndex: 16,
        }}
        draggable={false}
      />
    </>
  );
});
