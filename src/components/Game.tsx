"use client";

import { useEffect, useRef } from "react";

export default function Game() {
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    async function initGame() {
      const Phaser = (await import("phaser")).default;
      const { gameConfig } = await import("../game/config");

      if (gameRef.current) return;

      gameRef.current = new Phaser.Game(gameConfig);

      // Focus the canvas so keyboard input works immediately
      gameRef.current.events.once("ready", () => {
        gameRef.current?.canvas?.focus();
      });
    }

    initGame();

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
    };
  }, []);

  return <div id="game-container" style={{ width: "100vw", height: "100vh" }} />;
}
