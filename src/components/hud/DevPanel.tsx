"use client";

import { memo, useSyncExternalStore, useState, useCallback, useEffect } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";

const ENEMY_TYPES = [
  { id: "basic", label: "Zombie", color: "#55cc55" },
  { id: "fast", label: "Zombie Dog", color: "#55aaff" },
  { id: "boss", label: "SCARYBOI", color: "#ff4400" },
] as const;

export const DevPanel = memo(function DevPanel() {
  const open = useSyncExternalStore(hudState.subscribe, () => hudState.getField("devPanelOpen"));
  const devMode = useSyncExternalStore(hudState.subscribe, () => hudState.getField("devMode"));
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));
  const spawningDisabled = useSyncExternalStore(hudState.subscribe, () => hudState.getField("devSpawningDisabled"));

  const [spawnCounts, setSpawnCounts] = useState<Record<string, number>>({ basic: 1, fast: 1, boss: 1 });
  const [jumpWave, setJumpWave] = useState(1);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "F5") {
        e.preventDefault();
        e.stopPropagation();
        hudState.dispatchDevAction("closePanel");
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open]);

  if (!open || !devMode) return null;

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        top: 60,
        left: 12,
        width: 300,
        background: "rgba(10, 0, 20, 0.95)",
        border: "2px solid #ff00ff",
        borderRadius: 8,
        padding: "16px 20px",
        fontFamily: BODY,
        color: "#dddddd",
        fontSize: 14,
        zIndex: 40,
        boxShadow: "0 0 20px rgba(255, 0, 255, 0.3)",
      }}
    >
      {/* Header */}
      <div style={{
        fontFamily: "ChainsawCarnage, monospace",
        fontSize: 22,
        color: "#ff00ff",
        textAlign: "center",
        marginBottom: 16,
        letterSpacing: "0.08em",
        textShadow: "0 0 10px rgba(255, 0, 255, 0.5)",
      }}>
        DEV TOOLS
      </div>

      {/* Current state */}
      <div style={{ marginBottom: 12, color: "#999", fontSize: 12 }}>
        Current Wave: {wave}
      </div>

      <Divider />

      {/* Jump to Wave */}
      <Section title="JUMP TO WAVE">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="number"
            min={1}
            max={99}
            value={jumpWave}
            onChange={(e) => setJumpWave(Math.max(1, parseInt(e.target.value) || 1))}
            style={{
              width: 60,
              padding: "4px 8px",
              background: "#1a1a2e",
              border: "1px solid #444",
              borderRadius: 4,
              color: "#fff",
              fontFamily: BODY,
              fontSize: 14,
              textAlign: "center",
            }}
          />
          <DevButton
            label="GO"
            color="#ff00ff"
            onClick={() => hudState.dispatchDevAction("jumpToWave", jumpWave)}
          />
        </div>
      </Section>

      <Divider />

      {/* Toggle spawning */}
      <Section title="WAVE SPAWNING">
        <DevButton
          label={spawningDisabled ? "ENABLE SPAWNING" : "DISABLE SPAWNING"}
          color={spawningDisabled ? "#55cc55" : "#cc5555"}
          wide
          onClick={() => hudState.dispatchDevAction("toggleSpawning")}
        />
      </Section>

      <Divider />

      {/* Kill all */}
      <Section title="BATTLEFIELD">
        <DevButton
          label="KILL ALL ENEMIES"
          color="#cc3333"
          wide
          onClick={() => hudState.dispatchDevAction("killAll")}
        />
      </Section>

      <Divider />

      {/* Spawn enemies */}
      <Section title="SPAWN ENEMIES">
        {ENEMY_TYPES.map(({ id, label, color }) => (
          <div key={id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ color, flex: 1, fontSize: 13 }}>{label}</span>
            <CounterInput
              value={spawnCounts[id]}
              onChange={(n) => setSpawnCounts((prev) => ({ ...prev, [id]: n }))}
            />
            <DevButton
              label="SPAWN"
              color={color}
              onClick={() => hudState.dispatchDevAction("spawnEnemy", { type: id, count: spawnCounts[id] })}
            />
          </div>
        ))}
      </Section>

      {/* Close hint */}
      <div style={{ textAlign: "center", color: "#666", fontSize: 11, marginTop: 12 }}>
        F5 or ESC to close
      </div>
    </div>
  );
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: "#ff00ff", letterSpacing: "0.1em", marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      height: 1,
      background: "linear-gradient(90deg, transparent, rgba(255, 0, 255, 0.3), transparent)",
      margin: "8px 0",
    }} />
  );
}

function DevButton({
  label,
  color,
  wide,
  onClick,
}: {
  label: string;
  color: string;
  wide?: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: 12,
        color: hover ? "#fff" : "#ddd",
        background: hover ? color : "rgba(255,255,255,0.05)",
        border: `1px solid ${color}`,
        borderRadius: 4,
        padding: "4px 12px",
        cursor: "pointer",
        transition: "all 100ms ease",
        width: wide ? "100%" : undefined,
      }}
    >
      {label}
    </button>
  );
}

function CounterInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        style={{
          width: 22, height: 22, padding: 0,
          background: "rgba(255,255,255,0.05)", border: "1px solid #555",
          borderRadius: 3, color: "#aaa", cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        -
      </button>
      <input
        type="number"
        min={1}
        max={50}
        value={value}
        onChange={(e) => onChange(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
        style={{
          width: 36, padding: "2px 4px",
          background: "#1a1a2e", border: "1px solid #444",
          borderRadius: 3, color: "#fff", fontSize: 13,
          textAlign: "center", fontFamily: "var(--font-special-elite)",
        }}
      />
      <button
        onClick={() => onChange(Math.min(50, value + 1))}
        style={{
          width: 22, height: 22, padding: 0,
          background: "rgba(255,255,255,0.05)", border: "1px solid #555",
          borderRadius: 3, color: "#aaa", cursor: "pointer", fontSize: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        +
      </button>
    </div>
  );
}
