import { DIRECTIONS, Direction } from "./characters";

// Which characters have which animations
export const CHARACTER_ANIMATIONS: Record<
  string,
  { type: string; frames: number }[]
> = {
  rick: [
    { type: "walk", frames: 8 },
    { type: "running-6-frames", frames: 6 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 7 },
    { type: "shooting-pistol", frames: 4 },
    { type: "shooting-shotgun", frames: 4 },
    { type: "shooting-smg", frames: 9 },
    { type: "high-kick", frames: 7 },
    { type: "walking-shooting-pistol", frames: 9 },
    { type: "reloading-pistol", frames: 9 },
    { type: "reloading-shotgun", frames: 4 },
    { type: "reloading-smg", frames: 4 },
  ],
  dan: [
    { type: "walk", frames: 6 },
    { type: "running-6-frames", frames: 6 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 7 },
    { type: "shooting-pistol", frames: 4 },
    { type: "shooting-shotgun", frames: 4 },
    { type: "shooting-smg", frames: 9 },
    { type: "throw-grenade", frames: 4 },
    { type: "electric-fist", frames: 9 },
    { type: "reloading-pistol", frames: 9 },
    { type: "reloading-shotgun", frames: 4 },
    { type: "reloading-smg", frames: 4 },
  ],
  mason: [
    { type: "breathing-idle", frames: 4 },
    { type: "walk", frames: 6 },
    { type: "lead-jab", frames: 3 },
    { type: "fire-breath", frames: 9 },
    { type: "boom-box", frames: 17 },
    { type: "death", frames: 9 },
    { type: "jump", frames: 4 },
    { type: "landing", frames: 4 },
    { type: "angry", frames: 4 },
  ],
  pj: [
    { type: "walk", frames: 6 },
    { type: "running-6-frames", frames: 6 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 7 },
    { type: "shooting-pistol", frames: 4 },
    { type: "shooting-shotgun", frames: 4 },
    { type: "shooting-smg", frames: 16 },
    { type: "swinging-katana", frames: 4 },
    { type: "reloading-pistol", frames: 9 },
    { type: "reloading-shotgun", frames: 4 },
    { type: "reloading-smg", frames: 4 },
  ],
  jason: [
    { type: "walk", frames: 6 },
    { type: "running-6-frames", frames: 6 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 7 },
    { type: "shooting-pistol", frames: 4 },
    { type: "shooting-shotgun", frames: 4 },
    { type: "shooting-smg", frames: 9 },
    { type: "light-cigarette", frames: 4 },
    { type: "swinging-sledgehammer", frames: 9 },
    { type: "reloading-pistol", frames: 9 },
    { type: "reloading-shotgun", frames: 4 },
    { type: "reloading-smg", frames: 4 },
  ],
  creepyzombie: [
    { type: "walk", frames: 8 },
    { type: "bite", frames: 4 },
    { type: "lunge-bite", frames: 4 },
    { type: "death", frames: 17 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 7 },
    { type: "gunshot-death", frames: 17 },
    { type: "running-8-frames", frames: 8 },
    { type: "electrified-stun", frames: 9 },
  ],
  zombiedog: [
    { type: "walk", frames: 8 },
    { type: "bite", frames: 4 },
    { type: "death", frames: 4 },
    { type: "leap", frames: 4 },
    { type: "walk-6-frames", frames: 6 },
    { type: "howl", frames: 4 },
    { type: "running", frames: 9 },
    { type: "being-shot", frames: 9 },
  ],
  scaryboi: [
    { type: "fight-stance-idle-8-frames", frames: 8 },
    { type: "running-8-frames", frames: 8 },
    { type: "running-jump", frames: 8 },
    { type: "cross-punch", frames: 6 },
    { type: "lead-jab", frames: 3 },
    { type: "fireball", frames: 6 },
    { type: "throw-object", frames: 7 },
    { type: "backflip", frames: 10 },
    { type: "falling-back-death", frames: 7 },
    { type: "being-shot", frames: 9 },
    { type: "smoke-vanish", frames: 9 },
    { type: "smoke-appear", frames: 9 },  // reverse of smoke-vanish
  ],
};

// Animation key format: {charId}-{animType}-{direction}
// e.g. "rick-walk-south", "dan-breathing-idle-north-east"
export function getAnimKey(
  charId: string,
  animType: string,
  dir: Direction
): string {
  return `${charId}-${animType}-${dir}`;
}

// Frame image key format: {charId}-{animType}-{direction}-{frameIndex}
export function getFrameKey(
  charId: string,
  animType: string,
  dir: Direction,
  frame: number
): string {
  return `${charId}-${animType}-${dir}-${frame}`;
}

export function hasAnimation(charId: string, animType: string): boolean {
  return (
    CHARACTER_ANIMATIONS[charId]?.some((a) => a.type === animType) ?? false
  );
}

export function getFrameCount(charId: string, animType: string): number {
  return (
    CHARACTER_ANIMATIONS[charId]?.find((a) => a.type === animType)?.frames ?? 0
  );
}
