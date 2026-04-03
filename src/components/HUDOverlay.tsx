"use client";

import { useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";
import { ShopOverlay } from "./hud/ShopOverlay";
import { MinimapBorder } from "./hud/MinimapBorder";
import { TopStats } from "./hud/TopStats";
import { WaveInfo } from "./hud/WaveInfo";
import { AbilityIndicator } from "./hud/AbilityIndicator";
import { WaveAnnouncement } from "./hud/WaveAnnouncement";
import { Countdown } from "./hud/Countdown";
import { IntermissionOverlay } from "./hud/IntermissionOverlay";
import { PauseMenu } from "./hud/PauseMenu";
import { LevelUpOverlay } from "./hud/LevelUpOverlay";
import { GameOverOverlay } from "./hud/GameOverOverlay";
import { Hotbar } from "./hud/Hotbar";
import { HealthBar } from "./hud/HealthBar";
import { StaminaBar } from "./hud/StaminaBar";
import { DevPanel } from "./hud/DevPanel";
import { StatsScreen } from "./hud/StatsScreen";

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

      {/* Health + Stamina bars — always visible (even in shop and game over) */}
      <div
        className="absolute pointer-events-none"
        style={{ ...baseStyle, zIndex: 21 }}
      >
        <div style={{
          position: "absolute", top: 12, left: 12,
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <HealthBar />
          {!gameOver && <StaminaBar />}
        </div>
      </div>

      {/* HUD elements — hidden on game over */}
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
          {/* Kill counter + stats — top right */}
          <div style={{
            position: "absolute", top: 8, right: 8,
            display: "flex", flexDirection: "column", alignItems: "center",
            padding: "16px 20px 12px",
            backgroundImage: "url(/assets/sprites/ui/horror/panel-frame.png)",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
            filter: "drop-shadow(0 0 8px rgba(255, 34, 68, 0.15))",
          }}>
            <div style={{
              position: "absolute", inset: 6,
              background: "linear-gradient(180deg, rgba(8, 4, 12, 0.92) 0%, rgba(16, 8, 16, 0.95) 100%)",
              borderRadius: 2,
            }} />
            <div style={{ position: "relative" }}><TopStats /></div>
            <div style={{
              position: "relative",
              width: "80%", height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255, 34, 68, 0.3), transparent)",
              margin: "6px 0 4px",
            }} />
            <div style={{ position: "relative" }}><WaveInfo /></div>
          </div>
          {/* Hotbar + Ability — bottom left */}
          <div style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
          }}>
            <Hotbar />
            <AbilityIndicator />
          </div>
          {/* Minimap border */}
          <MinimapBorder canvasRect={canvasRect} />
        </div>
      )}

      {/* Wave announcement + countdown + intermission — always visible unless game over */}
      {!gameOver && (
        <div
          className="absolute pointer-events-none"
          style={{ ...baseStyle, zIndex: 18 }}
        >
          <WaveAnnouncement />
          <Countdown />
          <IntermissionOverlay />
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

      {/* Stats screen */}
      {paused && !gameOver && (
        <div className="absolute pointer-events-none" style={{ ...baseStyle, zIndex: 31 }}>
          <StatsScreen />
        </div>
      )}

      {/* Dev panel — always available when dev mode is on */}
      {!gameOver && (
        <div className="absolute pointer-events-none" style={{ ...baseStyle, zIndex: 35 }}>
          <DevPanel />
        </div>
      )}
    </>
  );
}
