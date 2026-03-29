"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

export const WaveInfo = memo(function WaveInfo() {
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));
  const state = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveState"));
  const enemiesLeft = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveEnemiesLeft"));
  const countdown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveCountdown"));

  let label = "";
  let sublabel = "";
  let accent = "#eeeeee";

  switch (state) {
    case "pre_game":
      label = "GET READY";
      sublabel = countdown > 0 ? `Starting in ${countdown}s` : "";
      accent = "#ff2244";
      break;
    case "active":
      label = `WAVE ${wave}`;
      sublabel = enemiesLeft > 0 ? `${enemiesLeft} remaining` : "Clearing...";
      accent = "#eeeeee";
      break;
    case "intermission":
      label = `WAVE ${wave} CLEAR`;
      sublabel = countdown > 0 ? `Next wave in ${countdown}s` : "SPACE to start";
      accent = "#22ff88";
      break;
  }

  return (
    <div className="flex flex-col items-center">
      <span
        style={{
          fontFamily: "HorrorPixel, monospace",
          fontSize: 20,
          color: accent,
          letterSpacing: "0.08em",
          textShadow: `0 0 10px ${accent}44`,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "HorrorPixel, monospace",
          fontSize: 12,
          color: "#667788",
          marginTop: 6,
        }}
      >
        {sublabel}
      </span>
    </div>
  );
});
