"use client";

import { useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";
import { HealthBar } from "./hud/HealthBar";
import { TopStats } from "./hud/TopStats";
import { Hotbar } from "./hud/Hotbar";
import { AbilityIndicator } from "./hud/AbilityIndicator";
import { WaveInfo } from "./hud/WaveInfo";
import { ShopOverlay } from "./hud/ShopOverlay";
import { ControlsHint } from "./hud/ControlsHint";
import { MinimapBorder } from "./hud/MinimapBorder";
import { ZoomIndicator } from "./hud/ZoomIndicator";
import { WaveAnnouncement } from "./hud/WaveAnnouncement";
import { Countdown } from "./hud/Countdown";
import { PauseMenu } from "./hud/PauseMenu";
import { LevelUpOverlay } from "./hud/LevelUpOverlay";
import { GameOverOverlay } from "./hud/GameOverOverlay";

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
  const paused = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("paused")
  );

  if (!hudVisible && !gameOver) return null;

  const pad = Math.round(canvasRect.width * 0.018);

  const baseStyle = {
    left: canvasRect.left,
    top: canvasRect.top,
    width: canvasRect.width,
    height: canvasRect.height,
  };

  return (
    <>
      {/* Game-over overlay — renders above everything */}
      {gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 50 }}>
          <GameOverOverlay />
        </div>
      )}

      {/* HUD elements — fade when shop is open, hidden on game over */}
      {!gameOver && (
        <div
          className="absolute pointer-events-none"
          style={{
            ...baseStyle,
            zIndex: 10,
            fontFamily: "var(--font-special-elite), 'Special Elite', serif",
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
              width: Math.round(canvasRect.width * 0.24),
              gap: 3,
            }}
          >
            <HealthBar type="health" />
            <HealthBar type="stamina" />
          </div>

          {/* TOP-RIGHT: Stats + Wave */}
          <div
            className="absolute flex flex-col items-end"
            style={{
              top: pad + 2,
              right: pad,
              gap: 2,
            }}
          >
            <TopStats />
            <WaveInfo />
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

          {/* Controls hint */}
          <ControlsHint />

          {/* Minimap border */}
          <MinimapBorder canvasRect={canvasRect} />

          {/* Zoom indicator */}
          <ZoomIndicator />
        </div>
      )}

      {/* Wave announcement + countdown — always visible unless game over */}
      {!gameOver && (
        <div
          className="absolute pointer-events-none"
          style={{ ...baseStyle, zIndex: 18 }}
        >
          <WaveAnnouncement />
          <Countdown />
        </div>
      )}

      {/* Shop overlay */}
      {shopOpen && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 20 }}>
          <ShopOverlay />
        </div>
      )}

      {/* Level-up overlay */}
      {!gameOver && (
        <div className="absolute pointer-events-none" style={{ ...baseStyle, zIndex: 25 }}>
          <LevelUpOverlay />
        </div>
      )}

      {/* Pause menu */}
      {paused && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 30 }}>
          <PauseMenu />
        </div>
      )}
    </>
  );
}
