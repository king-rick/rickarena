"use client";

import { useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

export function Letterbox() {
  const active = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("letterboxActive")
  );

  const barStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    width: "100%",
    height: "13%",
    background: "#000",
    transition: "transform 500ms cubic-bezier(0.76, 0, 0.24, 1)",
    pointerEvents: "none",
  };

  return (
    <>
      <div
        style={{
          ...barStyle,
          top: 0,
          transform: active ? "translateY(0)" : "translateY(-100%)",
        }}
      />
      <div
        style={{
          ...barStyle,
          bottom: 0,
          transform: active ? "translateY(0)" : "translateY(100%)",
        }}
      />
    </>
  );
}
