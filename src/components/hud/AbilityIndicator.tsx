"use client";

interface AbilityIndicatorProps {
  name: string;
  cooldown: number; // 0 = ready
  keyBind: string;
}

export function AbilityIndicator({ name, cooldown, keyBind }: AbilityIndicatorProps) {
  const ready = cooldown <= 0;

  return (
    <div className="flex items-center gap-3">
      <span
        className="text-sm font-bold"
        style={{ color: ready ? "#ffffff" : "#888888" }}
      >
        [{keyBind}] {name}
      </span>
      <span
        className="text-sm font-bold"
        style={{ color: ready ? "#5aabff" : "#888899" }}
      >
        {ready ? "READY" : `${Math.ceil(cooldown)}s`}
      </span>
    </div>
  );
}
