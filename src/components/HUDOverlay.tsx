"use client";

import { useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";
import { HealthBar } from "./hud/HealthBar";
import { Hotbar } from "./hud/Hotbar";
import { AbilityIndicator } from "./hud/AbilityIndicator";
import { WaveInfo } from "./hud/WaveInfo";
import { TopStats } from "./hud/TopStats";

interface Props {
  canvasRect: CanvasRect;
}

export function HUDOverlay({ canvasRect }: Props) {
  const hudVisible = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("hudVisible")
  );
  const gameOver = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("gameOver")
  );
  const shopOpen = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("shopOpen")
  );

  if (!hudVisible || gameOver) return null;

  const pad = Math.round(canvasRect.width * 0.018);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        left: canvasRect.left,
        top: canvasRect.top,
        width: canvasRect.width,
        height: canvasRect.height,
        zIndex: 10,
        fontFamily: "var(--font-rajdhani), Rajdhani, sans-serif",
        opacity: shopOpen ? 0 : 1,
        transition: "opacity 150ms ease-out",
      }}
    >
      {/* TOP-LEFT: Health + Stamina */}
      <div
        className="absolute flex flex-col"
        style={{
          top: pad,
          left: pad,
          width: Math.round(canvasRect.width * 0.32),
          gap: 8,
        }}
      >
        <HealthBar type="health" />
        <HealthBar type="stamina" />
      </div>

      {/* TOP-CENTER: Wave info */}
      <div
        className="absolute"
        style={{
          top: pad,
          left: "50%",
          transform: "translateX(-50%)",
        }}
      >
        <WaveInfo />
      </div>

      {/* TOP-RIGHT: Kills, Currency, Level */}
      <div
        className="absolute"
        style={{
          top: pad + 2,
          right: pad,
        }}
      >
        <TopStats />
      </div>

      {/* BOTTOM-LEFT: Ability + Hotbar */}
      <div
        className="absolute flex flex-col"
        style={{
          bottom: pad,
          left: pad,
          gap: 6,
        }}
      >
        <AbilityIndicator />
        <Hotbar />
      </div>
    </div>
  );
}
