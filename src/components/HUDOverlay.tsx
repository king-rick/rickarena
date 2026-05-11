"use client";

import { useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";
import { ShopOverlay } from "./hud/ShopOverlay";
import { MinimapBorder } from "./hud/MinimapBorder";
import { TopStats } from "./hud/TopStats";
import { WaveInfo } from "./hud/WaveInfo";
import { WaveAnnouncement } from "./hud/WaveAnnouncement";
import { Countdown } from "./hud/Countdown";
import { IntermissionOverlay } from "./hud/IntermissionOverlay";
import { PauseMenu } from "./hud/PauseMenu";
import { GameOverOverlay } from "./hud/GameOverOverlay";
import { Hotbar } from "./hud/Hotbar";
import { HealthBar } from "./hud/HealthBar";
import { StaminaBar } from "./hud/StaminaBar";
import { DevPanel } from "./hud/DevPanel";
import { InventoryScreen } from "./hud/InventoryScreen";
import { ScaryboiIntro } from "./hud/ScaryboiIntro";
import { MasonAnnouncement } from "./hud/MasonAnnouncement";
import { WaveStartCountdown } from "./hud/WaveStartCountdown";
import { ObjectiveTracker } from "./hud/ObjectiveTracker";
import { Letterbox } from "./hud/Letterbox";
import { GameMessage } from "./hud/GameMessage";
import { AxePickup } from "./hud/AxePickup";
import { InteractionPrompt } from "./hud/InteractionPrompt";
import { KyleDialogue } from "./hud/KyleDialogue";
import { IntermissionTimer } from "./hud/IntermissionTimer";
import { ConsumableHotbar } from "./hud/ConsumableHotbar";

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
  const scaryboiIntroActive = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("scaryboiIntroActive")
  );
  const masonDialogueActive = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("masonDialogueActive")
  );
  const kyleDialogueActive = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("kyleDialogueActive")
  );
  const cutsceneActive = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("cutsceneActive")
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

      {/* Axe pickup overlay */}
      {!gameOver && (
        <div className="absolute pointer-events-none" style={{ ...baseStyle, zIndex: 42 }}>
          <AxePickup />
        </div>
      )}

      {/* Letterbox cinematic bars */}
      {!gameOver && (
        <div className="absolute pointer-events-none" style={{ ...baseStyle, zIndex: 43 }}>
          <Letterbox />
        </div>
      )}

      {/* SCARYBOI intro cinematic — first appearance only */}
      {scaryboiIntroActive && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 45 }}>
          <ScaryboiIntro />
        </div>
      )}

      {/* MASON dialogue card — rave cutscene */}
      {masonDialogueActive && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 44 }}>
          <MasonAnnouncement />
        </div>
      )}

      {/* Kyle dialogue card — intro cutscene + shop NPC */}
      {kyleDialogueActive && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 44 }}>
          <KyleDialogue />
        </div>
      )}

      {/* Health + Stamina bars — hidden during cutscenes */}
      {!cutsceneActive && (
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
            {!gameOver && <ObjectiveTracker />}
            {!gameOver && !cutsceneActive && <IntermissionTimer />}
          </div>
        </div>
      )}

      {/* HUD elements — hidden on game over and cutscenes */}
      {!gameOver && !cutsceneActive && (
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
          {/* Hotbar + stats — bottom left */}
          <div style={{
            position: "absolute",
            bottom: 16,
            left: 16,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}>
            <ConsumableHotbar />
            <WaveInfo />
            <TopStats />
            <Hotbar />
          </div>
          {/* Minimap + stats — bottom right */}
          <MinimapBorder canvasRect={canvasRect} />
        </div>
      )}

      {/* Interaction prompt (world-positioned, React-rendered) */}
      {!gameOver && !shopOpen && !cutsceneActive && (
        <div
          className="absolute pointer-events-none"
          style={{ ...baseStyle, zIndex: 15 }}
        >
          <InteractionPrompt />
        </div>
      )}

      {/* Wave announcement + countdown + intermission + game messages */}
      {!gameOver && !cutsceneActive && (
        <div
          className="absolute pointer-events-none"
          style={{ ...baseStyle, zIndex: 18 }}
        >
          <WaveAnnouncement />
          <Countdown />
          <IntermissionOverlay />
          <GameMessage />
        </div>
      )}

      {/* Shop overlay */}
      {shopOpen && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 20 }}>
          <ShopOverlay />
        </div>
      )}

      {/* Wave start countdown (3-2-1 after shop close) */}
      {!gameOver && (
        <div className="absolute pointer-events-none" style={{ ...baseStyle, zIndex: 22 }}>
          <WaveStartCountdown />
        </div>
      )}

      {/* Inventory screen (I key + level-up + pause menu Inventory button) */}
      {!gameOver && <InventoryScreen />}

      {/* Pause menu */}
      {paused && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 30 }}>
          <PauseMenu />
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
