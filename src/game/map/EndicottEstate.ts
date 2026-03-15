import Phaser from "phaser";

// Map is ~3200x3200px (roughly 3.3 screen widths at 960px viewport)
export const MAP_WIDTH = 3200;
export const MAP_HEIGHT = 3200;

// Colors — XCOM 2 inspired palette
const GRASS_DARK = 0x1a2a1a;
const GRASS_MID = 0x1f301f;
const PATH_COLOR = 0x2a2520;
const PATH_EDGE = 0x332e28;
const MANSION_WALL = 0x3a3550;
const MANSION_ROOF = 0x2a2540;
const MANSION_TRIM = 0x4a4565;
const GAZEBO_COLOR = 0x4a4040;
const GAZEBO_ROOF = 0x3a3535;
const TREE_TRUNK = 0x2a2018;
const TREE_CANOPY = 0x1a3018;
const TREE_CANOPY_LIGHT = 0x203a1e;
const STREETLIGHT_POLE = 0x555555;
const STREETLIGHT_GLOW = 0xffdd88;
const GATE_COLOR = 0x3a3a3a;
const GATE_PILLAR = 0x4a4a4a;
const PARKING_COLOR = 0x222222;
const PARKING_LINE = 0x444444;
const LIBRARY_WALL = 0x251a1a;
const LIBRARY_ROOF = 0x1a1212;
const LIBRARY_TRIM = 0x352828;

// Landmark positions and sizes (used for collision)
export const MANSION = {
  x: MAP_WIDTH / 2 - 200,
  y: MAP_HEIGHT / 2 - 160,
  width: 400,
  height: 320,
};

export const GAZEBO = {
  x: MAP_WIDTH / 2 + 400,
  y: MAP_HEIGHT / 2 + 200,
  radius: 60,
};

// Library — southwest area (where parking lot was, bumped right). Impassable.
export const LIBRARY = {
  x: 400,
  y: MAP_HEIGHT - 700,
  width: 220,
  height: 160,
};

// Parking lot — to the left of the library
export const PARKING_LOT = {
  x: 100,
  y: MAP_HEIGHT - 680,
  width: 250,
  height: 300,
};

// Hiding grove — cluster of 3-4 impassable trees with a walkable pocket in the center.
// West (left) of the winding south road.
const GROVE_CENTER_X = MAP_WIDTH / 2 - 130;
const GROVE_CENTER_Y = MAP_HEIGHT / 2 + 520;
export const HIDING_GROVE = [
  { x: GROVE_CENTER_X - 45, y: GROVE_CENTER_Y - 40, size: 50, collisionRadius: 18 },
  { x: GROVE_CENTER_X + 50, y: GROVE_CENTER_Y - 30, size: 45, collisionRadius: 16 },
  { x: GROVE_CENTER_X - 35, y: GROVE_CENTER_Y + 45, size: 48, collisionRadius: 17 },
  { x: GROVE_CENTER_X + 45, y: GROVE_CENTER_Y + 40, size: 42, collisionRadius: 15 },
];

// Giant willow — west side, south of the west road, near boundary. Impassable.
export const GIANT_WILLOW = {
  x: 350,
  y: MAP_HEIGHT / 2 + 500,
  radius: 140,
};

// Streetlight positions for lighting system
export const STREETLIGHTS = [
  // Main path from south gate to mansion
  { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 500 },
  { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 800 },
  { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 + 350 },
  // East path
  { x: MAP_WIDTH / 2 + 500, y: MAP_HEIGHT / 2 },
  { x: MAP_WIDTH / 2 + 300, y: MAP_HEIGHT / 2 + 150 },
  // West path
  { x: MAP_WIDTH / 2 - 500, y: MAP_HEIGHT / 2 },
  { x: MAP_WIDTH / 2 - 300, y: MAP_HEIGHT / 2 - 200 },
  // North area
  { x: MAP_WIDTH / 2 - 200, y: 600 },
  { x: MAP_WIDTH / 2 + 200, y: 500 },
  // Parking lot
  { x: 500, y: MAP_HEIGHT - 400 },
  { x: 700, y: MAP_HEIGHT - 600 },
];

// Gate positions (enemy spawn points)
export const GATES = [
  { x: MAP_WIDTH / 2, y: MAP_HEIGHT - 100, label: "South Gate" },
  { x: MAP_WIDTH / 2, y: 100, label: "North Gate" },
  { x: 100, y: MAP_HEIGHT / 2, label: "West Gate" },
  { x: MAP_WIDTH - 100, y: MAP_HEIGHT / 2, label: "East Gate" },
];

// Willow tree positions
const TREES = [
  { x: MAP_WIDTH / 2 + 500, y: MAP_HEIGHT / 2 - 300, size: 80 },
  { x: MAP_WIDTH / 2 - 600, y: MAP_HEIGHT / 2 + 100, size: 90 },
  { x: MAP_WIDTH / 2 + 200, y: 400, size: 70 },
  { x: MAP_WIDTH / 2 - 400, y: 500, size: 85 },
  { x: MAP_WIDTH / 2 + 600, y: MAP_HEIGHT / 2 + 400, size: 75 },
  { x: 400, y: 400, size: 65 },
  { x: MAP_WIDTH - 400, y: 400, size: 70 },
  { x: 350, y: MAP_HEIGHT / 2 + 400, size: 80 },
  { x: MAP_WIDTH - 350, y: MAP_HEIGHT - 600, size: 75 },
  { x: MAP_WIDTH / 2 - 100, y: MAP_HEIGHT - 400, size: 60 },
];

export function drawMap(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();

  // Ground — dark grass base
  g.fillStyle(GRASS_DARK, 1);
  g.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

  // Grass variation patches
  g.fillStyle(GRASS_MID, 0.4);
  for (let i = 0; i < 40; i++) {
    const px = Math.random() * MAP_WIDTH;
    const py = Math.random() * MAP_HEIGHT;
    const pw = 100 + Math.random() * 200;
    const ph = 80 + Math.random() * 150;
    g.fillRect(px, py, pw, ph);
  }

  // Paths (stone walkways connecting landmarks)
  drawPaths(g);

  // Parking lot (left of library)
  drawParkingLot(g);

  // Library (southwest, impassable)
  drawLibrary(g);

  // Mansion (center, solid obstacle)
  drawMansion(g);

  // Gazebo (east of mansion)
  drawGazebo(g);

  // Hiding grove — cluster of trees with walkable center
  for (const tree of HIDING_GROVE) {
    drawTree(g, tree.x, tree.y, tree.size);
  }

  // Giant willow (west side, impassable)
  drawTree(g, GIANT_WILLOW.x, GIANT_WILLOW.y, GIANT_WILLOW.radius);

  // Willow trees
  for (const tree of TREES) {
    drawTree(g, tree.x, tree.y, tree.size);
  }

  // Estate gates
  for (const gate of GATES) {
    drawGate(g, gate.x, gate.y);
  }

  // Streetlights
  for (const light of STREETLIGHTS) {
    drawStreetlightBase(g, light.x, light.y);
  }

  // Map boundary — low stone wall
  g.lineStyle(4, 0x3a3a3a, 0.8);
  g.strokeRect(50, 50, MAP_WIDTH - 100, MAP_HEIGHT - 100);
  g.lineStyle(1, 0x555555, 0.3);
  g.strokeRect(54, 54, MAP_WIDTH - 108, MAP_HEIGHT - 108);

  return g;
}

function drawPaths(g: Phaser.GameObjects.Graphics) {
  const pathW = 48;
  const cx = MAP_WIDTH / 2;
  const cy = MAP_HEIGHT / 2;

  // Main path: south gate to mansion (winding)
  g.fillStyle(PATH_COLOR, 1);
  g.lineStyle(1, PATH_EDGE, 0.5);

  const southPathTop = cy + MANSION.height / 2 + 40;
  const southPathBottom = MAP_HEIGHT - 100;
  const segments = 40;
  const segHeight = (southPathBottom - southPathTop) / segments;

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const sy = southPathTop + i * segHeight;
    // S-curve: gentle sway left then right
    const sway = Math.sin(t * Math.PI * 2.5) * 60;
    g.fillRect(cx + sway - pathW / 2, sy, pathW, segHeight + 2);
  }

  // North path from mansion
  g.fillStyle(PATH_COLOR, 1);
  g.fillRect(cx - pathW / 2, 50, pathW, cy - MANSION.height / 2 - 50);

  // East path to gazebo
  g.fillRect(cx + MANSION.width / 2, cy - pathW / 2, 500, pathW);

  // West path
  g.fillRect(50, cy - pathW / 2, cx - MANSION.width / 2 - 50, pathW);

  // Circular path around mansion
  g.lineStyle(pathW, PATH_COLOR, 0.6);
  const mansionCx = MANSION.x + MANSION.width / 2;
  const mansionCy = MANSION.y + MANSION.height / 2;
  g.strokeRect(
    mansionCx - MANSION.width / 2 - 40,
    mansionCy - MANSION.height / 2 - 40,
    MANSION.width + 80,
    MANSION.height + 80
  );
}

function drawParkingLot(g: Phaser.GameObjects.Graphics) {
  const { x: px, y: py, width: pw, height: ph } = PARKING_LOT;

  g.fillStyle(0x1a1a1a, 1);
  g.fillRect(px, py, pw, ph);

  // Parking lines
  g.lineStyle(1, PARKING_LINE, 0.5);
  const lineCount = Math.floor(pw / 50);
  for (let i = 0; i < lineCount; i++) {
    const lx = px + 30 + i * 50;
    g.moveTo(lx, py + 20);
    g.lineTo(lx, py + ph - 20);
  }
  g.strokePath();

  // Border
  g.lineStyle(2, 0x333333, 0.6);
  g.strokeRect(px, py, pw, ph);
}

function drawMansion(g: Phaser.GameObjects.Graphics) {
  const { x, y, width, height } = MANSION;

  // Shadow
  g.fillStyle(0x000000, 0.3);
  g.fillRect(x + 8, y + 8, width, height);

  // Main building
  g.fillStyle(MANSION_WALL, 1);
  g.fillRect(x, y, width, height);

  // Roof line
  g.fillStyle(MANSION_ROOF, 1);
  g.fillRect(x - 10, y - 10, width + 20, 30);

  // Trim
  g.lineStyle(2, MANSION_TRIM, 0.8);
  g.strokeRect(x, y, width, height);

  // Windows (2 rows of 5)
  g.fillStyle(0x2a3a5a, 0.8);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const wx = x + 40 + col * 70;
      const wy = y + 50 + row * 100;
      g.fillRect(wx, wy, 30, 40);
      // Window glow
      g.fillStyle(0x445577, 0.3);
      g.fillRect(wx + 2, wy + 2, 26, 36);
      g.fillStyle(0x2a3a5a, 0.8);
    }
  }

  // Front door (south side)
  g.fillStyle(0x4a3520, 1);
  g.fillRect(x + width / 2 - 20, y + height - 4, 40, 4);

  // Label
  g.fillStyle(0x666688, 1);
}

function drawGazebo(g: Phaser.GameObjects.Graphics) {
  const { x, y, radius } = GAZEBO;

  // Floor
  g.fillStyle(0x3a3030, 0.7);
  g.fillCircle(x, y, radius);

  // Roof (slightly larger)
  g.fillStyle(GAZEBO_ROOF, 0.6);
  g.fillCircle(x, y, radius + 10);

  // Posts (8 around the circle)
  g.fillStyle(GAZEBO_COLOR, 1);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(angle) * (radius - 5);
    const py = y + Math.sin(angle) * (radius - 5);
    g.fillRect(px - 3, py - 3, 6, 6);
  }

  // Center
  g.fillStyle(0x555050, 0.5);
  g.fillCircle(x, y, 8);
}

function drawTree(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number
) {
  // Shadow
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(x + 5, y + size * 0.3, size * 1.2, size * 0.6);

  // Trunk
  g.fillStyle(TREE_TRUNK, 1);
  g.fillRect(x - 6, y - 4, 12, 20);

  // Canopy (overlapping circles for willow effect)
  g.fillStyle(TREE_CANOPY, 0.7);
  g.fillCircle(x, y - size * 0.3, size * 0.5);
  g.fillCircle(x - size * 0.25, y - size * 0.1, size * 0.4);
  g.fillCircle(x + size * 0.25, y - size * 0.15, size * 0.4);

  // Lighter highlights
  g.fillStyle(TREE_CANOPY_LIGHT, 0.4);
  g.fillCircle(x + size * 0.1, y - size * 0.35, size * 0.25);
}

function drawStreetlightBase(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number
) {
  // Pole
  g.fillStyle(STREETLIGHT_POLE, 1);
  g.fillRect(x - 2, y - 20, 4, 20);

  // Lamp head
  g.fillStyle(0x666666, 1);
  g.fillRect(x - 6, y - 24, 12, 6);
}

// Hiding grove canopy — drawn ABOVE the player so you disappear when inside the pocket
export function drawHidingGroveCanopy(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setDepth(25); // Above player but below lighting

  for (const tree of HIDING_GROVE) {
    const { x, y, size } = tree;
    // Dense canopy per tree
    g.fillStyle(TREE_CANOPY, 0.85);
    g.fillCircle(x, y - size * 0.3, size * 0.5);
    g.fillCircle(x - size * 0.25, y - size * 0.1, size * 0.4);
    g.fillCircle(x + size * 0.25, y - size * 0.15, size * 0.4);
    g.fillStyle(TREE_CANOPY_LIGHT, 0.35);
    g.fillCircle(x + size * 0.1, y - size * 0.35, size * 0.25);
  }

  return g;
}

function drawLibrary(g: Phaser.GameObjects.Graphics) {
  const { x, y, width, height } = LIBRARY;

  // Shadow
  g.fillStyle(0x000000, 0.3);
  g.fillRect(x + 6, y + 6, width, height);

  // Main building
  g.fillStyle(LIBRARY_WALL, 1);
  g.fillRect(x, y, width, height);

  // Roof line
  g.fillStyle(LIBRARY_ROOF, 1);
  g.fillRect(x - 6, y - 8, width + 12, 20);

  // Trim
  g.lineStyle(2, LIBRARY_TRIM, 0.8);
  g.strokeRect(x, y, width, height);

  // Windows (row of 3)
  g.fillStyle(0x2a2a3a, 0.8);
  for (let col = 0; col < 3; col++) {
    const wx = x + 30 + col * 60;
    const wy = y + 35;
    g.fillRect(wx, wy, 25, 35);
    g.fillStyle(0x3a3a4a, 0.3);
    g.fillRect(wx + 2, wy + 2, 21, 31);
    g.fillStyle(0x2a2a3a, 0.8);
  }

  // Front door (south side)
  g.fillStyle(0x3a2518, 1);
  g.fillRect(x + width / 2 - 15, y + height - 4, 30, 4);
}

function drawGate(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number
) {
  // Stone pillars
  g.fillStyle(GATE_PILLAR, 1);
  g.fillRect(x - 30, y - 10, 16, 20);
  g.fillRect(x + 14, y - 10, 16, 20);

  // Gate bars between pillars
  g.fillStyle(GATE_COLOR, 0.8);
  g.fillRect(x - 14, y - 6, 28, 4);
  g.fillRect(x - 14, y + 2, 28, 4);

  // Pillar caps
  g.fillStyle(0x5a5a5a, 1);
  g.fillRect(x - 32, y - 14, 20, 6);
  g.fillRect(x + 12, y - 14, 20, 6);
}

// Lighting layer using RenderTexture to punch light holes in darkness
export function drawLighting(scene: Phaser.Scene): Phaser.GameObjects.RenderTexture {
  // Create a RenderTexture the size of the map
  const rt = scene.add.renderTexture(0, 0, MAP_WIDTH, MAP_HEIGHT);
  rt.setOrigin(0, 0);
  rt.setDepth(50);

  // Fill with darkness
  const darkness = scene.add.graphics();
  darkness.fillStyle(0x0a0a1a, 1);
  darkness.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  rt.draw(darkness);
  darkness.destroy();

  // Punch light holes using erase (works on RenderTexture)
  const lights = scene.add.graphics();

  for (const light of STREETLIGHTS) {
    // Outer soft glow
    lights.fillStyle(0xffffff, 0.3);
    lights.fillCircle(light.x, light.y, 180);
    // Inner brighter
    lights.fillStyle(0xffffff, 0.4);
    lights.fillCircle(light.x, light.y, 100);
    // Core
    lights.fillStyle(0xffffff, 0.2);
    lights.fillCircle(light.x, light.y, 50);
  }

  // Mansion window glow
  lights.fillStyle(0xffffff, 0.25);
  lights.fillRect(
    MANSION.x - 40,
    MANSION.y - 40,
    MANSION.width + 80,
    MANSION.height + 80
  );
  lights.fillStyle(0xffffff, 0.15);
  lights.fillRect(
    MANSION.x - 80,
    MANSION.y - 80,
    MANSION.width + 160,
    MANSION.height + 160
  );

  rt.erase(lights);
  lights.destroy();

  // Set overall alpha so it's a dim overlay, not pitch black
  rt.setAlpha(0.5);

  // Warm glow halos ABOVE the darkness so the color reads correctly
  const glows = scene.add.graphics();
  glows.setDepth(51);
  for (const light of STREETLIGHTS) {
    glows.fillStyle(STREETLIGHT_GLOW, 0.04);
    glows.fillCircle(light.x, light.y, 120);
    glows.fillStyle(STREETLIGHT_GLOW, 0.06);
    glows.fillCircle(light.x, light.y, 60);
  }

  return rt;
}
