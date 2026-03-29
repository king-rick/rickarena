"use client";

import { memo, useSyncExternalStore, useEffect, useState } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const WaveAnnouncement = memo(function WaveAnnouncement() {
  const text = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveAnnouncement"));
  const key = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveAnnouncementKey"));
  const [visible, setVisible] = useState(false);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (!text || key === 0) return;
    setVisible(true);
    setAnimKey(key);
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [text, key]);

  if (!visible || !text) return null;

  return (
    <div
      key={animKey}
      className="absolute flex items-center justify-center pointer-events-none"
      style={{
        inset: 0,
        zIndex: 18,
      }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 72,
          color: "#ffffff",
          textShadow: "0 0 20px rgba(255, 34, 68, 0.6), 0 4px 8px rgba(0, 0, 0, 0.8)",
          animation: "wave-announce 2s ease-out forwards",
        }}
      >
        {text}
      </span>
    </div>
  );
});
