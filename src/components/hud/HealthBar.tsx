"use client";

interface HealthBarProps {
  current: number;
  max: number;
  label?: string;
  color: string;
  glowColor: string;
  burnedOut?: boolean;
}

export function HealthBar({ current, max, label, color, glowColor, burnedOut }: HealthBarProps) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));

  return (
    <div className="flex items-center gap-2">
      {label && <span className="text-xs font-bold text-gray-500 w-6">{label}</span>}
      <div className="relative h-3 flex-1 rounded-full overflow-hidden bg-[#1a1520]">
        <div
          className="h-full rounded-full transition-[width] duration-100 ease-out"
          style={{
            width: `${pct}%`,
            background: burnedOut
              ? "#555"
              : `linear-gradient(to bottom, ${glowColor}, ${color})`,
            boxShadow: burnedOut ? "none" : `0 0 6px ${glowColor}40`,
          }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums text-gray-400 w-12 text-right">
        {Math.ceil(current)}/{max}
      </span>
    </div>
  );
}
