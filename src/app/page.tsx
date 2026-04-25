"use client";

import dynamic from "next/dynamic";

const Game = dynamic(() => import("../components/Game"), { ssr: false });

export default function Home() {
  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ background: "#0a0a0f" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <Game />
    </div>
  );
}
