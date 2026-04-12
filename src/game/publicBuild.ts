/**
 * Vercel / public demo: set NEXT_PUBLIC_RICKARENA_PUBLIC_BUILD=true in the hosting project.
 * Local dev: leave unset — full game, all doors behave as in Tiled.
 *
 * Build-time: Next.js inlines NEXT_PUBLIC_* at compile time.
 */
export const PUBLIC_BUILD_UNLOCKABLE_DOOR_LABEL = "Gate";

export function isPublicBuild(): boolean {
  return process.env.NEXT_PUBLIC_RICKARENA_PUBLIC_BUILD === "true";
}
