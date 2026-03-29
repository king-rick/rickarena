"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";

export const ZoomIndicator = memo(function ZoomIndicator() {
  const visible = useSyncExternalStore(hudState.subscribe, () => hudState.getField("zoomVisible"));
  const pct = useSyncExternalStore(hudState.subscribe, () => hudState.getField("zoomPercent"));

  if (!visible) return null;

  return (
    <div className="absolute" style={{ top: 16, left: 16, zIndex: 15 }}>
      <span style={{ fontFamily: BODY, fontSize: 20, color: "#ffffff" }}>
        {pct}%
      </span>
    </div>
  );
});
