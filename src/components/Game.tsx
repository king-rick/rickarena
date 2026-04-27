"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { HUDOverlay } from "./HUDOverlay";
import { CharacterSelect } from "./CharacterSelect";
import { MainMenu } from "./MainMenu";
import { LoadingScreen } from "./LoadingScreen";

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export default function Game() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [canvasRect, setCanvasRect] = useState<CanvasRect | null>(null);

  const updateRect = useCallback(() => {
    const canvas = document.querySelector("#game-container canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const cRect = canvas.getBoundingClientRect();
    const pRect = parent.getBoundingClientRect();
    setCanvasRect({
      left: cRect.left - pRect.left,
      top: cRect.top - pRect.top,
      width: cRect.width,
      height: cRect.height,
    });
  }, []);

  useEffect(() => {
    let observer: ResizeObserver | null = null;

    async function initGame() {
      const Phaser = (await import("phaser")).default;
      const { gameConfig } = await import("../game/config");

      if (gameRef.current) return;

      gameRef.current = new Phaser.Game(gameConfig);
      (window as any).__PHASER_GAME__ = gameRef.current;

      // Patch Phaser's WebAudio suspend/resume to survive HMR and closed AudioContext
      gameRef.current.events.once("ready", () => {
        const sm = gameRef.current?.sound as any;
        if (sm?.context) {
          const orig = {
            suspend: sm.context.suspend?.bind(sm.context),
            resume: sm.context.resume?.bind(sm.context),
          };
          sm.context.suspend = async () => { try { await orig.suspend?.(); } catch {} };
          sm.context.resume  = async () => { try { await orig.resume?.();  } catch {} };
        }
      });

      // Block right-click context menu on the entire page (canvas, overlays, everywhere)
      document.addEventListener("contextmenu", (e) => { e.preventDefault(); }, true);

      // Focus the canvas so keyboard input works immediately
      gameRef.current.events.once("ready", () => {
        gameRef.current?.canvas?.focus();

        // Track canvas position/size for React overlay alignment
        const canvas = gameRef.current?.canvas;
        if (canvas) {
          updateRect();
          observer = new ResizeObserver(updateRect);
          observer.observe(canvas);
          // Also track window resize (Phaser rescales the canvas)
          window.addEventListener("resize", updateRect);
        }
      });
    }

    initGame();

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateRect);
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, [updateRect]);

  // Keep canvas focused so Phaser keyboard input works
  const refocusCanvas = useCallback(() => {
    gameRef.current?.canvas?.focus();
  }, []);

  // Refocus canvas whenever game container is clicked (but not on HUD overlays)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      // Don't steal focus from interactive HUD elements (sliders, buttons, etc.)
      const target = e.target as HTMLElement;
      if (target.closest("[data-hud-interactive]") || target.closest("button") || target.closest("input")) return;
      refocusCanvas();
    };
    const container = document.getElementById("game-container");
    container?.addEventListener("mousedown", handler);
    return () => container?.removeEventListener("mousedown", handler);
  }, [refocusCanvas]);

  return (
    <div id="game-container" style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {canvasRect && (
        <>
          <MainMenu canvasRect={canvasRect} />
          <CharacterSelect canvasRect={canvasRect} />
          <LoadingScreen canvasRect={canvasRect} />
          <HUDOverlay canvasRect={canvasRect} />
        </>
      )}
    </div>
  );
}
