"use client";

/**
 * HUDOverlay — React layer that renders on top of the Phaser canvas.
 *
 * SCAFFOLDING ONLY. Not rendered anywhere yet.
 *
 * To activate:
 *   1. In Game.tsx: render <HUDOverlay /> alongside the game-container div
 *   2. In GameScene.ts: import hudState, call hudState.update({...}) in updateHUD()
 *   3. Hide the Phaser-based HUD (hudContainer.setVisible(false))
 *
 * The overlay uses position:absolute to sit directly on top of the canvas.
 * pointer-events:none lets clicks pass through to the game.
 * Individual interactive elements (shop, menus) set pointer-events:auto.
 */

import { useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";
import { HealthBar } from "./hud/HealthBar";
import { Hotbar } from "./hud/Hotbar";
import { AbilityIndicator } from "./hud/AbilityIndicator";
import { WaveInfo } from "./hud/WaveInfo";
import { TopStats } from "./hud/TopStats";

export function HUDOverlay() {
  const data = useSyncExternalStore(hudState.subscribe, hudState.getSnapshot);

  // Don't render HUD during game over (Phaser handles that screen)
  if (data.gameOver) return null;

  return (
    <div
      className="absolute inset-0 z-10 pointer-events-none"
      style={{ fontFamily: "'Rajdhani', sans-serif" }}
    >
      {/* TOP-LEFT: Health + Stamina */}
      <div className="absolute top-3 left-3 w-56 flex flex-col gap-1.5">
        <HealthBar
          current={data.health}
          max={data.maxHealth}
          color="#2a8a2a"
          glowColor="#55dd55"
        />
        <HealthBar
          current={data.stamina}
          max={data.maxStamina}
          color="#2d9e2d"
          glowColor="#55dd55"
          burnedOut={data.burnedOut}
        />
        {data.burnedOut && (
          <span className="text-xs font-bold text-red-500 tracking-wider">BURNED OUT</span>
        )}
      </div>

      {/* TOP-CENTER: Wave info */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2">
        <WaveInfo
          wave={data.wave}
          state={data.waveState}
          enemiesLeft={data.waveEnemiesLeft}
          countdown={data.waveCountdown}
        />
      </div>

      {/* TOP-RIGHT: Kills, Currency, Level */}
      <div className="absolute top-3 right-3">
        <TopStats kills={data.kills} currency={data.currency} level={data.level} />
      </div>

      {/* BOTTOM-LEFT: Hotbar + Ability */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-2">
        <AbilityIndicator
          name={data.abilityName}
          cooldown={data.abilityCooldown}
          keyBind={data.abilityKey}
        />
        <Hotbar data={data} />
      </div>
    </div>
  );
}
