"use client";

import dynamic from "next/dynamic";

const Game = dynamic(() => import("../components/Game"), { ssr: false });

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-black">
      <Game />
    </div>
  );
}
