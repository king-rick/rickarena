"use client";

interface TopStatsProps {
  kills: number;
  currency: number;
  level: number;
}

export function TopStats({ kills, currency, level }: TopStatsProps) {
  return (
    <div className="flex items-center gap-6">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 text-xs font-bold">LV</span>
        <span className="text-amber-400 text-sm font-bold tabular-nums">{level}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 text-xs font-bold">KILLS</span>
        <span className="text-white text-sm font-bold tabular-nums">{kills}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 text-xs font-bold">$</span>
        <span className="text-yellow-400 text-sm font-bold tabular-nums">{currency}</span>
      </div>
    </div>
  );
}
