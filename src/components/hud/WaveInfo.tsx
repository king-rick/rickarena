"use client";

interface WaveInfoProps {
  wave: number;
  state: "pre_game" | "active" | "intermission";
  enemiesLeft: number;
  countdown: number;
}

export function WaveInfo({ wave, state, enemiesLeft, countdown }: WaveInfoProps) {
  let label = "";
  let sublabel = "";

  switch (state) {
    case "pre_game":
      label = "GET READY";
      sublabel = countdown > 0 ? `Starting in ${countdown}s` : "";
      break;
    case "active":
      label = `WAVE ${wave}`;
      sublabel = enemiesLeft > 0 ? `${enemiesLeft} remaining` : "Clearing...";
      break;
    case "intermission":
      label = `WAVE ${wave} CLEAR`;
      sublabel = countdown > 0 ? `Next wave in ${countdown}s` : "SPACE to start";
      break;
  }

  return (
    <div className="flex flex-col items-center">
      <span className="text-lg font-bold text-white tracking-wider">{label}</span>
      <span className="text-xs text-gray-400">{sublabel}</span>
    </div>
  );
}
