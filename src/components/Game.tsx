"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { HUDOverlay } from "./HUDOverlay";
import { CharacterSelect } from "./CharacterSelect";

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

  return (
    <div id="game-container" style={{ width: "100vw", height: "100vh", position: "relative" }}>
      {canvasRect && (
        <>
          <CharacterSelect canvasRect={canvasRect} />
          <HUDOverlay canvasRect={canvasRect} />
        </>
      )}
    </div>
  );
}
