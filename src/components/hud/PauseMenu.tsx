"use client";

import { memo, useSyncExternalStore, useEffect, useCallback, useState, Fragment } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const PauseMenu = memo(function PauseMenu() {
  const paused = useSyncExternalStore(hudState.subscribe, () => hudState.getField("paused"));
  const settingsOpen = useSyncExternalStore(hudState.subscribe, () => hudState.getField("settingsOpen"));
  const sfxVolume = useSyncExternalStore(hudState.subscribe, () => hudState.getField("sfxVolume"));
  const zoomEnabled = useSyncExternalStore(hudState.subscribe, () => hudState.getField("zoomEnabled"));

  useEffect(() => {
    if (!paused) return;
    const handler = (e: KeyboardEvent) => {
      if (settingsOpen) {
        if (e.key === "Escape") hudState.dispatchPauseAction("closeSettings");
        return;
      }
      if (e.key === "q" || e.key === "Q") hudState.dispatchPauseAction("quit");
      if (e.key === "r" || e.key === "R") hudState.dispatchPauseAction("restart");
      if (e.key === "s" || e.key === "S") hudState.dispatchPauseAction("openSettings");
      if (e.key === "Escape") hudState.dispatchPauseAction("resume");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [paused, settingsOpen]);

  if (!paused) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 30 }}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.65)" }} />

      {settingsOpen ? (
        <SettingsPanel sfxVolume={sfxVolume} zoomEnabled={zoomEnabled} />
      ) : (
        <div className="relative flex flex-col items-center gap-6">
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: 72,
              color: "#ff2244",
              letterSpacing: "0.1em",
              textShadow: "0 0 16px rgba(255, 34, 68, 0.5)",
            }}
          >
            PAUSED
          </span>
          <ControlsPanel />
          <PauseButton label="[ Q ]  Quit to Menu" action="quit" />
          <PauseButton label="[ R ]  Restart" action="restart" />
          <PauseButton label="[ S ]  Settings" action="openSettings" />
        </div>
      )}
    </div>
  );
});

function PauseButton({ label, action }: { label: string; action: string }) {
  const [state, setState] = useState<"normal" | "hover" | "pressed">("normal");

  const bgMap = {
    normal: "/assets/sprites/ui/horror/btn-a-normal.png",
    hover: "/assets/sprites/ui/horror/btn-a-hover.png",
    pressed: "/assets/sprites/ui/horror/btn-a-pressed.png",
  };

  return (
    <button
      style={{
        fontFamily: BODY,
        fontSize: 22,
        color: state === "normal" ? "#cccccc" : "#ffffff",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "10px 40px",
        backgroundImage: `url(${bgMap[state]})`,
        backgroundSize: "100% 100%",
        imageRendering: "pixelated" as const,
        transition: "color 100ms ease",
        minWidth: 280,
      }}
      onMouseEnter={() => setState("hover")}
      onMouseLeave={() => setState("normal")}
      onMouseDown={() => setState("pressed")}
      onMouseUp={() => setState("hover")}
      onClick={() => hudState.dispatchPauseAction(action)}
    >
      {label}
    </button>
  );
}

function SettingsPanel({ sfxVolume, zoomEnabled }: { sfxVolume: number; zoomEnabled: boolean }) {
  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    hudState.dispatchPauseAction("setVolume", parseFloat(e.target.value));
  }, []);

  const handleZoom = useCallback(() => {
    hudState.dispatchPauseAction("toggleZoom");
  }, []);

  return (
    <div
      className="relative flex flex-col"
      style={{
        width: 640,
        padding: "40px 50px",
        backgroundImage: "url(/assets/sprites/ui/horror/panel-frame.png)",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
      }}
    >
      <div
        className="absolute"
        style={{ inset: 10, background: "rgba(12, 12, 24, 0.92)", borderRadius: 2 }}
      />

      <span
        className="relative"
        style={{
          fontFamily: DISPLAY,
          fontSize: 42,
          color: "#ff2244",
          letterSpacing: "0.1em",
          textAlign: "center",
          marginBottom: 32,
        }}
      >
        SETTINGS
      </span>

      {/* SFX Volume */}
      <div className="relative flex items-center justify-between" style={{ marginBottom: 12 }}>
        <span style={{ fontFamily: BODY, fontSize: 26, color: "#cccccc" }}>Sound Volume</span>
        <span style={{ fontFamily: BODY, fontSize: 26, color: "#ffffff" }}>
          {Math.round(sfxVolume * 100)}%
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={sfxVolume}
        onChange={handleVolume}
        className="relative"
        style={{
          width: "100%",
          height: 12,
          marginBottom: 32,
          accentColor: "#ff2244",
          cursor: "pointer",
        }}
      />

      {/* Scroll Zoom Toggle */}
      <div className="relative flex items-center justify-between" style={{ marginBottom: 32 }}>
        <span style={{ fontFamily: BODY, fontSize: 26, color: "#cccccc" }}>Scroll Zoom</span>
        <button
          onClick={handleZoom}
          style={{
            width: 64,
            height: 32,
            borderRadius: 16,
            border: "none",
            background: zoomEnabled ? "#4a90d9" : "#2a2a3a",
            cursor: "pointer",
            position: "relative",
            transition: "background 200ms ease",
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              background: "#d0c8e0",
              position: "absolute",
              top: 4,
              left: zoomEnabled ? 36 : 4,
              transition: "left 200ms ease",
            }}
          />
        </button>
      </div>

      {/* Back button */}
      <div className="relative flex justify-center">
        <SettingsBackButton />
      </div>
    </div>
  );
}

function ControlsPanel() {
  const controls = [
    ["WASD", "Move"],
    ["CLICK / SPACE", "Punch"],
    ["RIGHT-CLICK / F", "Use Item"],
    ["Q / E", "Cycle Slots"],
    ["R", "Ability"],
    ["B", "Shop"],
    ["V", "Rotate Barricade"],
    ["ESC", "Pause"],
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto auto",
        gap: "4px 20px",
        marginBottom: 8,
      }}
    >
      {controls.map(([key, action]) => (
        <Fragment key={key}>
          <span style={{ fontFamily: DISPLAY, fontSize: 13, color: "#ff4466", textAlign: "right" }}>
            {key}
          </span>
          <span style={{ fontFamily: BODY, fontSize: 13, color: "#888899" }}>
            {action}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function SettingsBackButton() {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      style={{
        fontFamily: BODY,
        fontSize: 26,
        color: hovered ? "#ffffff" : "#cccccc",
        background: "none",
        border: "none",
        cursor: "pointer",
        transition: "color 100ms ease",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => hudState.dispatchPauseAction("closeSettings")}
    >
      [ ESC ]  Back
    </button>
  );
}
