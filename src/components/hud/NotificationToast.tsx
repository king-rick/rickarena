"use client";

import { memo, useState, useEffect, useRef, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";
const HOLD_MS = 2000;
const FADE_MS = 1000;

interface ToastItem {
  id: number;
  text: string;
  color: string;
  phase: "in" | "hold" | "out" | "gone";
}

export const NotificationToast = memo(function NotificationToast() {
  const notifications = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("notifications")
  );

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!notifications || notifications.length === 0) return;

    // Process any new notifications we haven't seen
    const newOnes: typeof notifications = [];
    for (const notif of notifications) {
      if (seenRef.current.has(notif.id)) continue;
      seenRef.current.add(notif.id);
      newOnes.push(notif);

      const id = notif.id;

      // Add toast
      setToasts((prev) => [...prev, { ...notif, phase: "in" }]);

      // in → hold
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id && t.phase === "in" ? { ...t, phase: "hold" } : t))
        );
      }, 50);

      // hold → out
      setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, phase: "out" } : t))
        );
      }, HOLD_MS);

      // remove
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        seenRef.current.delete(id);
      }, HOLD_MS + FADE_MS);
    }

    // Clear consumed notifications from HUDState so they don't re-appear on next update
    if (newOnes.length > 0) {
      hudState.update({ notifications: [] });
    }
  }, [notifications]);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => {
        const visible = toast.phase === "hold";
        const fading = toast.phase === "out";
        const entering = toast.phase === "in";

        return (
          <div
            key={toast.id}
            style={{
              display: "inline-flex",
              alignItems: "center",
              alignSelf: "flex-end",
              gap: 8,
              padding: "6px 14px",
              background:
                "linear-gradient(180deg, rgba(8, 4, 12, 0.7) 0%, rgba(16, 8, 16, 0.75) 100%)",
              border: `1px solid ${toast.color}44`,
              borderRadius: 3,
              boxShadow: `0 0 8px rgba(0, 0, 0, 0.6), 0 0 6px ${toast.color}33`,
              opacity: entering ? 0 : fading ? 0 : 1,
              transform: entering
                ? "translateX(12px)"
                : fading
                  ? "translateX(6px)"
                  : "translateX(0)",
              transition: entering
                ? "none"
                : fading
                  ? `opacity ${FADE_MS}ms ease-in, transform ${FADE_MS}ms ease-in`
                  : "opacity 200ms ease-out, transform 200ms ease-out",
              animation: visible ? "notif-glow 1.5s ease-in-out infinite" : "none",
            }}
          >
            <span
              style={{
                fontFamily: DISPLAY,
                fontSize: 15,
                fontWeight: "bold",
                color: toast.color,
                textShadow: `0 0 6px ${toast.color}80, 0 1px 3px rgba(0,0,0,0.9)`,
                letterSpacing: 1.5,
                lineHeight: 1,
                whiteSpace: "nowrap",
              }}
            >
              {toast.text}
            </span>
          </div>
        );
      })}

      <style>{`
        @keyframes notif-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.15); }
          50% { box-shadow: 0 0 14px rgba(255, 34, 68, 0.4), 0 0 24px rgba(255, 34, 68, 0.2), 0 0 6px rgba(0, 0, 0, 0.6); }
        }
      `}</style>
    </div>
  );
});
