"use client";

import { useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";
import type { CanvasRect } from "./Game";
import { ShopOverlay } from "./hud/ShopOverlay";
import { MinimapBorder } from "./hud/MinimapBorder";
import { TopStats } from "./hud/TopStats";
import { WaveInfo } from "./hud/WaveInfo";
import { Countdown } from "./hud/Countdown";
import { PauseMenu } from "./hud/PauseMenu";
import { GameOverOverlay } from "./hud/GameOverOverlay";
import { Hotbar } from "./hud/Hotbar";
import { HealthBar } from "./hud/HealthBar";
import { StaminaBar } from "./hud/StaminaBar";
import { DevPanel } from "./hud/DevPanel";
import { InventoryScreen } from "./hud/InventoryScreen";
import { ScaryboiIntro } from "./hud/ScaryboiIntro";
import { MasonAnnouncement } from "./hud/MasonAnnouncement";
import { ObjectiveTracker } from "./hud/ObjectiveTracker";
import { Letterbox } from "./hud/Letterbox";
import { NotificationToast } from "./hud/NotificationToast";
import { AxePickup } from "./hud/AxePickup";
import { InteractionPrompt } from "./hud/InteractionPrompt";
import { KyleDialogue } from "./hud/KyleDialogue";
import { ConsumableHotbar } from "./hud/ConsumableHotbar";

/** Stealth barometer — horizontal segmented threat meter with pulsing red glow when exposed */
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

function StealthBarometer() {
  const stealth = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("stealthLevel")
  );
  const label = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("stealthLabel")
  );

  const segments = 6;
  const segW = 28;
  const segH = 8;
  const gap = 3;
  const exposed = stealth >= 0.7; // red zone — actively being chased
  const detected = stealth >= 0.35;

  // Label color
  const labelColor = exposed ? "#ee3344" : detected ? "#ddaa33" : "#55cc55";

  // How many segments are lit (continuous for smooth partial fills)
  const litCount = stealth * segments;

  return (
    <div style={{
      display: "flex", flexDirection: "row", alignItems: "center", gap: 6,
    }}>
      {/* Segments */}
      <div style={{
        display: "flex", flexDirection: "row", gap,
        width: "fit-content",
        padding: 3,
        borderRadius: 4,
        border: exposed ? "1px solid rgba(220, 40, 40, 0.6)" : "1px solid transparent",
        boxShadow: exposed
          ? "0 0 8px rgba(220, 40, 40, 0.4), 0 0 16px rgba(220, 40, 40, 0.2), inset 0 0 6px rgba(220, 40, 40, 0.15)"
          : "none",
        animation: exposed ? "stealthPulse 1.2s ease-in-out infinite" : "none",
        transition: "border 300ms, box-shadow 300ms",
      }}>
        {Array.from({ length: segments }, (_, i) => {
          const fill = Math.max(0, Math.min(1, litCount - i));

          // Color: green (safe) → amber (caution/noise) → red (chased)
          const t = i / (segments - 1);
          const r = Math.round(t < 0.4 ? 60 + t * 2.5 * 160 : 230);
          const g = Math.round(t < 0.4 ? 190 : 190 - (t - 0.4) * (1 / 0.6) * 170);
          const b = 35;
          const color = `rgb(${r},${g},${b})`;
          const dimColor = `rgba(${r},${g},${b},0.1)`;

          return (
            <div key={i} style={{
              width: segW, height: segH,
              background: dimColor,
              borderRadius: 2,
              overflow: "hidden",
              position: "relative",
            }}>
              <div style={{
                position: "absolute",
                bottom: 0, left: 0,
                height: "100%",
                width: `${fill * 100}%`,
                background: color,
                borderRadius: 2,
                transition: "width 200ms ease-out",
                boxShadow: fill > 0.5 ? `0 0 5px ${color}` : "none",
              }} />
            </div>
          );
        })}
      </div>
      {/* Status label */}
      <span style={{
        fontFamily: DISPLAY,
        fontSize: 12,
        color: labelColor,
        textShadow: `0 0 4px ${labelColor}66, 0 1px 2px rgba(0,0,0,0.9)`,
        letterSpacing: "0.1em",
        lineHeight: 1,
        transition: "color 300ms ease",
      }}>
        {label}
      </span>
      {/* Inject keyframe animation */}
      <style>{`
        @keyframes stealthPulse {
          0%, 100% { box-shadow: 0 0 8px rgba(220,40,40,0.4), 0 0 16px rgba(220,40,40,0.15); border-color: rgba(220,40,40,0.5); }
          50% { box-shadow: 0 0 14px rgba(220,40,40,0.7), 0 0 28px rgba(220,40,40,0.3); border-color: rgba(220,40,40,0.8); }
        }
      `}</style>
    </div>
  );
}

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
  const kyleCutsceneActive = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("kyleCutsceneActive")
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

      {/* Skip Cutscene button — top right, styled like objectives */}
      {kyleCutsceneActive && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 46 }}>
          <button
            type="button"
            onClick={() => hudState.dispatchKyleDialogueAction("skip")}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              padding: "4px 12px",
              background: "linear-gradient(180deg, rgba(8, 4, 12, 0.6) 0%, rgba(16, 8, 16, 0.65) 100%)",
              border: "1px solid rgba(255, 34, 68, 0.25)",
              borderRadius: 3,
              boxShadow: "0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.1)",
              fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
              fontSize: 14,
              color: "#e8e0e0",
              textShadow: "0 0 4px rgba(255, 34, 68, 0.3), 0 1px 2px rgba(0, 0, 0, 0.9)",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              cursor: "pointer",
              pointerEvents: "auto",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 34, 68, 0.7)";
              e.currentTarget.style.boxShadow = "0 0 16px rgba(255, 34, 68, 0.5), 0 0 32px rgba(255, 34, 68, 0.25)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(255, 34, 68, 0.25)";
              e.currentTarget.style.boxShadow = "0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.1)";
            }}
          >
            Skip Cutscene
          </button>
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
          </div>
        </div>
      )}

      {/* Notification toasts — always visible (even during cutscenes) */}
      {!gameOver && (
        <div
          className="absolute pointer-events-none"
          style={{ ...baseStyle, zIndex: 46 }}
        >
          <div style={{
            position: "absolute", top: cutsceneActive ? 80 : 200, right: 12,
            display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4,
          }}>
            <NotificationToast />
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
            <TopStats />
            <StealthBarometer />
            <Hotbar />
          </div>
          {/* Survival timer — top right */}
          <div style={{
            position: "absolute",
            top: 12,
            right: 12,
          }}>
            <WaveInfo />
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

      {/* Countdown + game messages */}
      {!gameOver && !cutsceneActive && (
        <div
          className="absolute pointer-events-none"
          style={{ ...baseStyle, zIndex: 18 }}
        >
          <Countdown />
        </div>
      )}

      {/* Shop overlay */}
      {shopOpen && !gameOver && (
        <div className="absolute" style={{ ...baseStyle, zIndex: 20 }}>
          <ShopOverlay />
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
