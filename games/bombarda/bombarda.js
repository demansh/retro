import { createLoop } from "../../assets/js/engine/loop.js";
import { createBuffer, createDisplay } from "../../assets/js/engine/screen.js";
import { createCrt } from "../../assets/js/engine/crt.js";
import { createGlitch } from "../../assets/js/engine/glitch.js";
import { createInput } from "../../assets/js/engine/input.js";
import { createMenuButton } from "../../assets/js/engine/menubutton.js";
import { sweptAabb } from "../../assets/js/engine/collision.js";
import { createParticles } from "../../assets/js/engine/particles.js";
import { createAudio } from "../../assets/js/engine/audio.js";
import { createStore } from "../../assets/js/engine/storage.js";
import { createSettings, readPalette } from "../../assets/js/engine/settings.js";
import { drawText, measureText } from "../../assets/js/engine/pixelfont.js";

const WIDTH = 192;
const HEIGHT = 108;
const GROUND_BASE_Y = 96;
const CANNON_PAD_RIGHT = 28;
const PLATEAU_LEFT = 106;
const ZONE_LEFT = 112;
const ZONE_RIGHT = 186;
const MIN_STRUCTURE_TOP = 22;
const CANNON_X = 12;
const BARREL_LENGTH = 8;
const MIN_ANGLE = 1;
const MAX_ANGLE = 89;
const ANGLE_SPEED = 55;
const MIN_POWER = 0.15;
const POWER_SPEED = 0.75;
const GRAVITY = 140;
const MAX_SHOT_SPEED = 174;
const SHOTS_PER_LEVEL = 5;
const STARTING_LIVES = 3;
const BLOCK_GRAVITY = 220;
const BLOCK_MAX_FALL_SPEED = 260;
const SLIDE_SPEED = 24;
const FALL_DAMAGE_SPEED = 70;
const FRAGILE_CRUSH_SPEED = 30;
const FALL_SELF_DAMAGE_SPEED = 140;
const CONTACT_EPSILON = 0.5;
const OVERLAP_EPSILON = 0.01;
const SHELL_DAMAGE = 2;
const SHELL_SPLASH_RADIUS = 5;
const HEAVY_DAMAGE = 4;
const HEAVY_PIERCE = 2;
const HEAVY_PIERCE_SLOWDOWN = 0.7;
const BOMB_RADIUS = 16;
const BOMB_DAMAGE = 3;
const TNT_RADIUS = 20;
const TNT_DAMAGE = 3;
const FRAGMENT_COUNT = 5;
const FRAGMENT_SPREAD = 0.18;
const FRAGMENT_DAMAGE = 2;
const CHAIN_DELAY_SECONDS = 0.08;
const RING_SECONDS = 0.25;
const SETTLE_MIN_SECONDS = 0.4;
const SETTLE_TIMEOUT_SECONDS = 4;
const TRAIL_SAMPLE_STEPS = 3;
const TRAIL_MAX_POINTS = 600;
const TRAIL_FADE_SECONDS = 12;
const TARGET_SCORE = 500;
const LEVEL_CLEAR_SCORE = 100;
const UNUSED_SHOT_SCORE = 300;
const LEVEL_BANNER_SECONDS = 1.6;
const LOST_PAUSE_SECONDS = 1.8;
const CLEAR_INPUT_DELAY_SECONDS = 1;
const GAME_OVER_INPUT_DELAY_SECONDS = 1;
const EXIT_FALLBACK_MS = 700;
const LOW_QUALITY_FRAME_SECONDS = 1 / 40;
const PERFORMANCE_SAMPLE_FRAMES = 180;
const PAUSE_MENU_TOP = 46;
const PAUSE_ITEM_SPACING = 12;
const PILLAR_WIDTH = 2;
const PILLAR_HEIGHT = 10;
const PLANK_HEIGHT = 2;
const FLOOR_HEIGHT = PILLAR_HEIGHT + PLANK_HEIGHT;
const MARKER_SIZE = 5;
const CUBE_SIZE = 4;
const TOWER_WIDTHS = [18, 22, 26, 30];
const TOWER_GAP = 4;
const PAUSE_ITEMS = [
  { id: "continue", label: "CONTINUE" },
  { id: "restart", label: "RESTART" },
  { id: "settings", label: "SETTINGS" },
  { id: "exit", label: "EXIT" },
];
const BACK_ITEM = { id: "back", label: "BACK" };
const CONTROLLABLE_STATES = new Set(["title", "aim", "charge", "flight", "settle", "clear", "lost"]);
const SIMULATED_STATES = new Set(["aim", "charge", "flight", "settle", "clear", "lost"]);
const SHOT_TYPES = {
  shell: { id: "shell", label: "SHELL", size: 2, unlockLevel: 1, icon: [".##.", "####", "####", ".##."] },
  heavy: { id: "heavy", label: "HEAVY", size: 3, unlockLevel: 2, icon: ["####", "####", "####", "####"] },
  bomb: { id: "bomb", label: "BOMB", size: 3, unlockLevel: 3, icon: [".##.", "#..#", "#..#", ".##."] },
  split: { id: "split", label: "SPLIT", size: 2, unlockLevel: 4, icon: ["#.#.", ".#.#", "#.#.", ".#.#"] },
};
const MATERIALS = {
  glass: { hp: 1, score: 10, isFragile: true, shades: ["#000", "#5c5c5c"] },
  wood: { hp: 2, score: 20, isFragile: false, shades: ["#000", "#6c6c6c", "#a4a4a4"] },
  stone: { hp: 4, score: 40, isFragile: false, shades: ["#000", "#6a6a6a", "#909090", "#b8b8b8", "#e0e0e0"] },
  steel: { hp: Infinity, score: 0, isFragile: false, shades: ["#fff"] },
  tnt: { hp: 1, score: 30, isFragile: true, shades: ["#fff"] },
  target: { hp: 1, score: TARGET_SCORE, isFragile: true, shades: ["#fff"] },
};
const TARGET_PATTERN = [".###.", "#...#", "#.#.#", "#...#", ".###."];
const TNT_PATTERN = ["#####", "##.##", "#.#.#", "##.##", "#####"];
const COLORS = {
  bright: "#ffffff",
  score: "#d8d8d8",
  dim: "#808080",
  faint: "#505050",
  ground: "#2c2c2c",
  groundEdge: "#8c8c8c",
  cannon: "#b0b0b0",
  veil: "rgba(0, 0, 0, 0.78)",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const toRadians = (degrees) => (degrees * Math.PI) / 180;
const easeInOut = (t) => (1 - Math.cos(Math.PI * t)) / 2;
const gray = (level) => {
  const channel = Math.round(clamp(level, 0, 1) * 255);
  return `rgb(${channel}, ${channel}, ${channel})`;
};

function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const randomInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pickOne = (rng, items) => items[Math.floor(rng() * items.length)];

function pickWeighted(rng, weights) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  return (entries.find(([, weight]) => (roll -= weight) < 0) ?? entries[0])[0];
}

function shuffle(rng, items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function levelSeed(runSeed, level) {
  return (runSeed ^ Math.imul(level, 0x9e3779b1)) >>> 0;
}

function sanitizeRecords(raw) {
  return { best: toCount(raw.best) };
}

function showSystemMessage(text) {
  const message = document.createElement("p");
  message.className = "system-message glow";
  message.textContent = text;
  document.body.append(message);
}

function createSounds(audio) {
  const arpeggio = (frequencies, step, duration) =>
    frequencies.forEach((frequency, index) => audio.tone({ frequency, duration, delay: index * step }));
  return {
    fire: () => {
      audio.noise({ duration: 0.25, volume: 0.2, highpass: 200 });
      audio.tone({ frequency: 120, slideTo: 50, duration: 0.25, volume: 0.14 });
    },
    glass: () => audio.noise({ duration: 0.12, volume: 0.12, highpass: 3000 }),
    wood: () => audio.tone({ frequency: 190, duration: 0.06, volume: 0.12 }),
    stone: () => audio.tone({ frequency: 110, duration: 0.07, volume: 0.13 }),
    steel: () => audio.tone({ frequency: 950, duration: 0.05, volume: 0.07 }),
    ground: () => audio.noise({ duration: 0.1, volume: 0.08, highpass: 600 }),
    explosion: () => {
      audio.noise({ duration: 0.45, volume: 0.25, highpass: 120 });
      audio.tone({ frequency: 90, slideTo: 40, duration: 0.4, volume: 0.14 });
    },
    split: () => {
      audio.noise({ duration: 0.08, volume: 0.12, highpass: 2000 });
      audio.tone({ frequency: 1400, slideTo: 700, duration: 0.08, volume: 0.06 });
    },
    target: () => arpeggio([784, 988, 1319], 0.06, 0.08),
    levelClear: () => arpeggio([523, 659, 784, 1047], 0.1, 0.12),
    lifeLost: () => audio.tone({ frequency: 300, slideTo: 80, duration: 0.5, volume: 0.12 }),
    newBest: () => arpeggio([523, 659, 784, 1047, 1319], 0.12, 0.14),
    gameOver: () => arpeggio([392, 330, 262, 196], 0.16, 0.18),
    select: () => audio.tone({ frequency: 880, duration: 0.04, volume: 0.08 }),
    pause: () => audio.noise({ duration: 0.12, volume: 0.08, highpass: 1500 }),
  };
}

function buildTerrain(rng, level) {
  const ground = new Int16Array(WIDTH);
  const cannonY = GROUND_BASE_Y - (level >= 2 && rng() < 0.45 ? randomInt(rng, 6, 22) : 0);
  const plateauY = GROUND_BASE_Y - (level >= 2 && rng() < 0.5 ? randomInt(rng, 6, 20) : 0);
  const features = level >= 3 ? ["none", "hill", "hill", "pit"] : level === 2 ? ["none", "hill"] : ["none"];
  const feature = pickOne(rng, features);
  const hillHeight = Math.min(randomInt(rng, 10, 18 + level * 2), Math.min(cannonY, plateauY) - 50);
  const pitDepth = randomInt(rng, 4, 10);
  for (let x = 0; x < WIDTH; x++) {
    if (x < CANNON_PAD_RIGHT) {
      ground[x] = cannonY;
    } else if (x >= PLATEAU_LEFT) {
      ground[x] = plateauY;
    } else {
      const t = (x - CANNON_PAD_RIGHT) / (PLATEAU_LEFT - CANNON_PAD_RIGHT);
      const bump = Math.sin(Math.PI * t) ** 2;
      const offset = feature === "hill" ? -hillHeight * bump : feature === "pit" ? pitDepth * bump : 0;
      ground[x] = Math.min(HEIGHT - 2, Math.round(cannonY + (plateauY - cannonY) * easeInOut(t) + offset));
    }
  }
  return { ground, plateauY };
}

function materialWeights(level, part) {
  const weights = {
    glass: Math.max(1, 5 - level * 0.5),
    wood: 4,
    stone: Math.min(4, (level - 1) * 0.6),
  };
  if (part === "plank" && level >= 6) {
    weights.steel = Math.min(1.5, (level - 5) * 0.3);
  }
  return weights;
}

function createBlock(x, y, w, h, material) {
  return { x, y, w, h, material, hp: MATERIALS[material].hp, vx: 0, vy: 0, isResting: true, isAlive: true };
}

function chooseTowerWidths(rng, level) {
  const maxTowers = level >= 8 ? 3 : level >= 4 ? 2 : 1;
  const towerCount = randomInt(rng, Math.max(1, maxTowers - 1), maxTowers);
  const widths = Array.from({ length: towerCount }, () => pickOne(rng, TOWER_WIDTHS));
  const available = ZONE_RIGHT - ZONE_LEFT;
  while (widths.reduce((sum, width) => sum + width, 0) + TOWER_GAP * (widths.length - 1) > available) {
    const widestIndex = widths.indexOf(Math.max(...widths));
    if (widths[widestIndex] > TOWER_WIDTHS[0]) {
      widths[widestIndex] -= 4;
    } else {
      widths.pop();
    }
  }
  return widths;
}

function pillarOffsets(width) {
  const offsets = [0, width - PILLAR_WIDTH];
  if (width >= 26) {
    offsets.splice(1, 0, Math.floor(width / 2) - 1);
  }
  return offsets;
}

function buildTower(rng, level, left, width, surfaceY, blocks, rooms, roofs) {
  const maxFloors = clamp(1 + Math.floor(level / 3), 1, 5);
  const floorCount = randomInt(rng, Math.ceil(maxFloors / 2), maxFloors);
  let floorLeft = left;
  let floorWidth = width;
  let floorY = surfaceY;
  for (let floor = 0; floor < floorCount && floorY - FLOOR_HEIGHT >= MIN_STRUCTURE_TOP; floor++) {
    const pillarMaterial = pickWeighted(rng, materialWeights(level, "pillar"));
    const plankMaterial = pickWeighted(rng, materialWeights(level, "plank"));
    const offsets = pillarOffsets(floorWidth);
    const pillars = offsets.map((offset) => createBlock(floorLeft + offset, floorY - PILLAR_HEIGHT, PILLAR_WIDTH, PILLAR_HEIGHT, pillarMaterial));
    const plank = createBlock(floorLeft, floorY - FLOOR_HEIGHT, floorWidth, PLANK_HEIGHT, plankMaterial);
    blocks.push(...pillars, plank);
    offsets.slice(0, -1).forEach((offset, index) => {
      const roomLeft = floorLeft + offset + PILLAR_WIDTH;
      rooms.push({ x: roomLeft, w: floorLeft + offsets[index + 1] - roomLeft, floorY, plank, frontPillar: pillars[index] });
    });
    floorY -= FLOOR_HEIGHT;
    if (rng() < 0.5 && floorWidth - 4 >= TOWER_WIDTHS[0] - 4) {
      floorLeft += 2;
      floorWidth -= 4;
    }
  }
  roofs.push({ x: floorLeft, w: floorWidth, floorY });
}

function softenBlock(block, hardMaterial) {
  if (block && block.material === hardMaterial) {
    block.material = "wood";
    block.hp = MATERIALS.wood.hp;
  }
}

function openAccess(room) {
  softenBlock(room.plank, "steel");
  softenBlock(room.frontPillar, "stone");
}

function placeCentered(space, size, material) {
  return createBlock(space.x + Math.floor((space.w - size) / 2), space.floorY - size, size, size, material);
}

function buildStructure(rng, level, plateauY) {
  const blocks = [];
  const rooms = [];
  const roofs = [];
  const widths = chooseTowerWidths(rng, level);
  const totalWidth = widths.reduce((sum, width) => sum + width, 0) + TOWER_GAP * (widths.length - 1);
  let left = ZONE_LEFT + randomInt(rng, 0, ZONE_RIGHT - ZONE_LEFT - totalWidth);
  widths.forEach((width) => {
    buildTower(rng, level, left, width, plateauY, blocks, rooms, roofs);
    left += width + TOWER_GAP;
  });
  const targetCount = Math.min(3, 1 + Math.floor((level - 1) / 4));
  const freeRooms = shuffle(rng, rooms.filter((room) => room.w >= MARKER_SIZE + 2));
  const freeRoofs = shuffle(rng, roofs);
  for (let placed = 0; placed < targetCount; placed++) {
    const space = freeRooms.shift() ?? freeRoofs.shift();
    if (space) {
      blocks.push(placeCentered(space, MARKER_SIZE, "target"));
      openAccess(space);
    }
  }
  freeRooms.forEach((room) => {
    if (level >= 2 && rng() < 0.3) {
      blocks.push(placeCentered(room, MARKER_SIZE, "tnt"));
    } else if (rng() < 0.4) {
      blocks.push(placeCentered(room, CUBE_SIZE, "glass"));
    }
  });
  freeRoofs.forEach((roof) => {
    if (rng() < 0.5) {
      blocks.push(placeCentered(roof, CUBE_SIZE, "stone"));
    }
  });
  return blocks;
}

function buildShotQueue(rng, level) {
  const unlocked = Object.values(SHOT_TYPES).filter((type) => level >= type.unlockLevel);
  const queue = Array.from({ length: SHOTS_PER_LEVEL }, () => pickOne(rng, unlocked).id);
  const newType = unlocked.find((type) => type.unlockLevel === level && type.id !== "shell");
  if (newType && !queue.includes(newType.id)) {
    queue[0] = newType.id;
  }
  if (!queue.includes("shell")) {
    queue[randomInt(rng, 0, SHOTS_PER_LEVEL - 1)] = "shell";
  }
  return queue;
}

function renderTerrain(ground) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  for (let x = 0; x < WIDTH; x++) {
    context.fillStyle = COLORS.ground;
    context.fillRect(x, ground[x], 1, HEIGHT - ground[x]);
    const neighborTop = Math.min(ground[Math.max(0, x - 1)], ground[Math.min(WIDTH - 1, x + 1)]);
    context.fillStyle = COLORS.groundEdge;
    context.fillRect(x, ground[x], 1, Math.max(1, ground[x] - neighborTop));
  }
  return canvas;
}

function horizontalOverlap(first, second) {
  return Math.min(first.x + first.w, second.x + second.w) - Math.max(first.x, second.x);
}

function distanceToBox(x, y, box) {
  const deltaX = Math.max(box.x - x, 0, x - (box.x + box.w));
  const deltaY = Math.max(box.y - y, 0, y - (box.y + box.h));
  return Math.hypot(deltaX, deltaY);
}

function startGame() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  const isStandalone = window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone === true;
  const homeUrl = document.body.dataset.home || "/";

  const buffer = createBuffer(WIDTH, HEIGHT);
  const crt = createCrt(document.getElementById("screen"), buffer, { reducedMotion: prefersReducedMotion });
  const display = createDisplay(crt.canvas, WIDTH, HEIGHT);
  const menuButton = createMenuButton(display, WIDTH);
  const glitch = createGlitch({ width: WIDTH, height: HEIGHT, reducedMotion: prefersReducedMotion });
  const particles = createParticles(400);
  const audio = createAudio();
  const sounds = createSounds(audio);
  const settings = createSettings();
  const recordsStore = createStore("bombarda", 1, { best: 0 });
  let records = sanitizeRecords(recordsStore.load());

  const game = {
    state: "title",
    resumeState: "title",
    stateTime: 0,
    time: 0,
    isReady: false,
    isExiting: false,
    hasRequestedImmersive: false,
    runSeed: 0,
    level: 1,
    score: 0,
    levelStartScore: 0,
    lives: STARTING_LIVES,
    ground: new Int16Array(WIDTH),
    terrainImage: null,
    blocks: [],
    shotQueue: [],
    shotIndex: 0,
    angle: 45,
    angleDirection: 1,
    power: MIN_POWER,
    powerDirection: 1,
    lastPower: null,
    projectiles: [],
    explosions: [],
    rings: [],
    currentTrail: [],
    ghostTrail: [],
    ghostAge: TRAIL_FADE_SECONDS,
    trailStep: 0,
    lastBonus: 0,
    levelBannerTime: 0,
    isNewBest: false,
    pauseIndex: 0,
    pauseView: "main",
  };
  const performanceSample = { frames: 0, seconds: 0, isDone: false };

  function setState(state) {
    game.state = state;
    game.stateTime = 0;
  }

  function sceneState() {
    return game.state === "paused" ? game.resumeState : game.state;
  }

  function terrainTop(column) {
    return column >= 0 && column < WIDTH ? game.ground[column] : Infinity;
  }

  function cannonPivot() {
    return { x: CANNON_X, y: game.ground[CANNON_X] - 5 };
  }

  function shotsLeft() {
    return game.shotQueue.length - game.shotIndex;
  }

  function targetsLeft() {
    return game.blocks.filter((block) => block.isAlive && block.material === "target").length;
  }

  function loadLevel() {
    const rng = createRng(levelSeed(game.runSeed, game.level));
    const terrain = buildTerrain(rng, game.level);
    game.ground = terrain.ground;
    game.terrainImage = renderTerrain(terrain.ground);
    game.blocks = buildStructure(rng, game.level, terrain.plateauY);
    game.shotQueue = buildShotQueue(rng, game.level);
    game.shotIndex = 0;
    game.projectiles = [];
    game.explosions = [];
    game.rings = [];
    game.currentTrail = [];
    game.ghostTrail = [];
    game.ghostAge = TRAIL_FADE_SECONDS;
    game.lastPower = null;
    game.levelStartScore = game.score;
    game.levelBannerTime = LEVEL_BANNER_SECONDS;
    particles.clear();
  }

  function startRun() {
    game.runSeed = Math.floor(Math.random() * 4294967296);
    game.level = 1;
    game.score = 0;
    game.lives = STARTING_LIVES;
    game.isNewBest = false;
    loadLevel();
    setState("aim");
  }

  function restartLevel() {
    game.score = game.levelStartScore;
    loadLevel();
    setState("aim");
  }

  function advanceLevel() {
    game.level += 1;
    loadLevel();
    setState("aim");
  }

  function emitDebris(block, count) {
    particles.emit(block.x + block.w / 2, block.y + block.h / 2, { count, spread: Math.PI * 2, speed: [15, 60], lifetime: [0.2, 0.6], sizes: [1, 1, 2], fall: 120 });
  }

  function playMaterialSound(material) {
    if (material === "glass" || material === "target" || material === "tnt") {
      sounds.glass();
    } else if (material === "wood") {
      sounds.wood();
    } else if (material === "stone") {
      sounds.stone();
    } else {
      sounds.steel();
    }
  }

  function queueExplosion(x, y, radius, damage, delay) {
    game.explosions.push({ x, y, radius, damage, delay });
  }

  function destroyBlock(block) {
    block.isAlive = false;
    game.score += MATERIALS[block.material].score;
    emitDebris(block, Math.min(24, 6 + Math.round((block.w * block.h) / 2)));
    if (block.material === "tnt") {
      queueExplosion(block.x + block.w / 2, block.y + block.h / 2, TNT_RADIUS, TNT_DAMAGE, CHAIN_DELAY_SECONDS);
    } else if (block.material === "target") {
      sounds.target();
    }
  }

  function damageBlock(block, amount) {
    if (!block.isAlive) {
      return false;
    }
    playMaterialSound(block.material);
    if (block.material === "steel") {
      emitDebris(block, 2);
      return false;
    }
    block.hp -= amount;
    if (block.hp > 0) {
      emitDebris(block, 3);
      return false;
    }
    destroyBlock(block);
    return true;
  }

  function damageArea(x, y, radius, damage, excludedBlock = null) {
    game.blocks.forEach((block) => {
      if (block === excludedBlock || !block.isAlive) {
        return;
      }
      const distance = distanceToBox(x, y, block);
      if (distance < radius) {
        damageBlock(block, Math.max(1, Math.round(damage * (1 - distance / radius))));
      }
    });
  }

  function explode(explosion) {
    sounds.explosion();
    glitch.trigger("hit");
    game.rings.push({ x: explosion.x, y: explosion.y, maxRadius: explosion.radius, age: 0 });
    particles.emit(explosion.x, explosion.y, { count: 30, spread: Math.PI * 2, speed: [30, 110], lifetime: [0.2, 0.7], sizes: [1, 2], fall: 60 });
    damageArea(explosion.x, explosion.y, explosion.radius, explosion.damage);
  }

  function updateExplosions(deltaSeconds) {
    const due = [];
    game.explosions = game.explosions.filter((explosion) => {
      explosion.delay -= deltaSeconds;
      if (explosion.delay <= 0) {
        due.push(explosion);
        return false;
      }
      return true;
    });
    due.forEach(explode);
    game.rings = game.rings.filter((ring) => (ring.age += deltaSeconds) < RING_SECONDS);
  }

  function terrainFloor(box) {
    let floor = Infinity;
    for (let column = Math.floor(box.x); column < Math.ceil(box.x + box.w); column++) {
      floor = Math.min(floor, terrainTop(column));
    }
    return floor;
  }

  function findFloor(block, aliveBlocks) {
    const bottom = block.y + block.h;
    let floor = terrainFloor(block);
    aliveBlocks.forEach((other) => {
      if (other !== block && other.isAlive && other.y >= bottom - OVERLAP_EPSILON && horizontalOverlap(block, other) > OVERLAP_EPSILON) {
        floor = Math.min(floor, other.y);
      }
    });
    return floor;
  }

  function blocksBelow(block, aliveBlocks) {
    const bottom = block.y + block.h;
    return aliveBlocks.filter((other) => other !== block && other.isAlive && Math.abs(other.y - bottom) <= CONTACT_EPSILON && horizontalOverlap(block, other) > OVERLAP_EPSILON);
  }

  function supportSpan(block, aliveBlocks) {
    const bottom = block.y + block.h;
    let left = Infinity;
    let right = -Infinity;
    for (let column = Math.floor(block.x); column < Math.ceil(block.x + block.w); column++) {
      if (terrainTop(column) <= bottom + CONTACT_EPSILON) {
        left = Math.min(left, Math.max(column, block.x));
        right = Math.max(right, Math.min(column + 1, block.x + block.w));
      }
    }
    blocksBelow(block, aliveBlocks).forEach((other) => {
      left = Math.min(left, Math.max(block.x, other.x));
      right = Math.max(right, Math.min(block.x + block.w, other.x + other.w));
    });
    return left <= right ? { left, right } : null;
  }

  function crushSpeed(block) {
    return MATERIALS[block.material].isFragile ? FRAGILE_CRUSH_SPEED : FALL_DAMAGE_SPEED;
  }

  function applyLandingDamage(block, impactSpeed, aliveBlocks) {
    if (impactSpeed < FRAGILE_CRUSH_SPEED) {
      return;
    }
    blocksBelow(block, aliveBlocks).forEach((other) => {
      if (impactSpeed >= crushSpeed(other)) {
        damageBlock(other, 1);
      }
    });
    if (impactSpeed >= FALL_SELF_DAMAGE_SPEED || (MATERIALS[block.material].isFragile && impactSpeed >= FALL_DAMAGE_SPEED)) {
      damageBlock(block, 1);
    }
  }

  function moveBlockVertically(block, deltaSeconds, aliveBlocks) {
    block.vy = Math.min(block.vy + BLOCK_GRAVITY * deltaSeconds, BLOCK_MAX_FALL_SPEED);
    const floor = findFloor(block, aliveBlocks);
    if (block.y + block.h + block.vy * deltaSeconds < floor) {
      block.y += block.vy * deltaSeconds;
      block.isResting = false;
      return;
    }
    const impactSpeed = block.vy;
    block.y = floor - block.h;
    block.vy = 0;
    block.isResting = true;
    applyLandingDamage(block, impactSpeed, aliveBlocks);
  }

  function collidesSideways(block, nextX, aliveBlocks) {
    const probe = { x: nextX, y: block.y + OVERLAP_EPSILON, w: block.w, h: block.h - OVERLAP_EPSILON * 2 };
    const hitsBlock = aliveBlocks.some((other) => other !== block && other.isAlive && horizontalOverlap(probe, other) > OVERLAP_EPSILON && probe.y < other.y + other.h && probe.y + probe.h > other.y);
    return hitsBlock || terrainFloor(probe) < block.y + block.h - CONTACT_EPSILON;
  }

  function updateSlide(block, deltaSeconds, aliveBlocks) {
    if (block.isResting) {
      const support = supportSpan(block, aliveBlocks);
      const center = block.x + block.w / 2;
      if (!support) {
        block.vx = 0;
      } else if (center < support.left - OVERLAP_EPSILON) {
        block.vx = -SLIDE_SPEED;
      } else if (center > support.right + OVERLAP_EPSILON) {
        block.vx = SLIDE_SPEED;
      } else {
        block.vx = 0;
      }
    }
    if (block.vx === 0) {
      return;
    }
    const nextX = block.x + block.vx * deltaSeconds;
    if (collidesSideways(block, nextX, aliveBlocks)) {
      block.vx = 0;
    } else {
      block.x = nextX;
    }
  }

  function updateBlocks(deltaSeconds) {
    const aliveBlocks = game.blocks.filter((block) => block.isAlive).sort((first, second) => second.y + second.h - (first.y + first.h));
    aliveBlocks.forEach((block) => {
      if (!block.isAlive) {
        return;
      }
      moveBlockVertically(block, deltaSeconds, aliveBlocks);
      if (block.isAlive) {
        updateSlide(block, deltaSeconds, aliveBlocks);
      }
      if (block.isAlive && (block.y > HEIGHT || block.x + block.w < 0 || block.x > WIDTH)) {
        destroyBlock(block);
      }
    });
    if (game.blocks.some((block) => !block.isAlive)) {
      game.blocks = game.blocks.filter((block) => block.isAlive);
    }
  }

  function areBlocksSettled() {
    return game.blocks.every((block) => block.isResting && block.vx === 0);
  }

  function muzzle() {
    const pivot = cannonPivot();
    const radians = toRadians(game.angle);
    return { x: pivot.x + Math.cos(radians) * BARREL_LENGTH, y: pivot.y - Math.sin(radians) * BARREL_LENGTH, radians };
  }

  function createProjectile(kind, centerX, centerY, vx, vy) {
    const size = kind === "fragment" ? 1 : SHOT_TYPES[kind].size;
    return { kind, x: centerX - size / 2, y: centerY - size / 2, w: size, h: size, vx, vy, pierceLeft: kind === "heavy" ? HEAVY_PIERCE : 0, isAlive: true };
  }

  function fire() {
    const kind = game.shotQueue[game.shotIndex];
    const { x, y, radians } = muzzle();
    const speed = game.power * MAX_SHOT_SPEED;
    game.projectiles = [createProjectile(kind, x, y, Math.cos(radians) * speed, -Math.sin(radians) * speed)];
    game.shotIndex += 1;
    game.lastPower = game.power;
    game.currentTrail = [];
    game.trailStep = 0;
    sounds.fire();
    glitch.trigger("hit");
    particles.emit(x, y, { count: 10, angle: -radians, spread: 0.8, speed: [10, 40], lifetime: [0.2, 0.5], sizes: [1], fall: -10 });
    setState("flight");
  }

  function splitProjectile(projectile) {
    projectile.isAlive = false;
    const centerX = projectile.x + projectile.w / 2;
    const centerY = projectile.y + projectile.h / 2;
    const speed = Math.max(Math.hypot(projectile.vx, projectile.vy), 40);
    const heading = Math.atan2(projectile.vy, projectile.vx);
    for (let index = 0; index < FRAGMENT_COUNT; index++) {
      const angle = heading + (index - (FRAGMENT_COUNT - 1) / 2) * FRAGMENT_SPREAD;
      const fragmentSpeed = speed * (0.9 + Math.random() * 0.2);
      game.projectiles.push(createProjectile("fragment", centerX, centerY, Math.cos(angle) * fragmentSpeed, Math.sin(angle) * fragmentSpeed));
    }
    sounds.split();
    particles.emit(centerX, centerY, { count: 12, spread: Math.PI * 2, speed: [20, 60], lifetime: [0.15, 0.35], sizes: [1] });
  }

  function hitBlock(projectile, block) {
    const centerX = projectile.x + projectile.w / 2;
    const centerY = projectile.y + projectile.h / 2;
    if (projectile.kind === "bomb") {
      projectile.isAlive = false;
      queueExplosion(centerX, centerY, BOMB_RADIUS, BOMB_DAMAGE, 0);
    } else if (projectile.kind === "heavy") {
      const isDestroyed = damageBlock(block, HEAVY_DAMAGE);
      if (isDestroyed && projectile.pierceLeft > 0) {
        projectile.pierceLeft -= 1;
        projectile.vx *= HEAVY_PIERCE_SLOWDOWN;
        projectile.vy *= HEAVY_PIERCE_SLOWDOWN;
      } else {
        projectile.isAlive = false;
      }
    } else if (projectile.kind === "fragment") {
      projectile.isAlive = false;
      damageBlock(block, FRAGMENT_DAMAGE);
    } else {
      projectile.isAlive = false;
      damageBlock(block, SHELL_DAMAGE);
      damageArea(centerX, centerY, SHELL_SPLASH_RADIUS, 1, block);
    }
    glitch.trigger("hit");
  }

  function hitGround(projectile) {
    projectile.isAlive = false;
    const centerX = projectile.x + projectile.w / 2;
    const bottom = projectile.y + projectile.h;
    if (projectile.kind === "bomb") {
      queueExplosion(centerX, bottom, BOMB_RADIUS, BOMB_DAMAGE, 0);
      return;
    }
    sounds.ground();
    particles.emit(centerX, bottom, { count: 8, angle: -Math.PI / 2, spread: 1.4, speed: [15, 45], lifetime: [0.2, 0.5], sizes: [1], fall: 100 });
  }

  function findBlockHit(projectile, deltaX, deltaY) {
    let earliest = null;
    game.blocks.forEach((block) => {
      if (!block.isAlive) {
        return;
      }
      const hit = sweptAabb(projectile, deltaX, deltaY, block);
      if (hit && (!earliest || hit.time < earliest.hit.time)) {
        earliest = { hit, block };
      }
    });
    return earliest;
  }

  function moveProjectile(projectile, deltaSeconds) {
    const previousVy = projectile.vy;
    projectile.vy += GRAVITY * deltaSeconds;
    if (projectile.kind === "split" && previousVy < 0 && projectile.vy >= 0) {
      splitProjectile(projectile);
      return;
    }
    const deltaX = projectile.vx * deltaSeconds;
    const deltaY = projectile.vy * deltaSeconds;
    const earliest = findBlockHit(projectile, deltaX, deltaY);
    if (earliest) {
      projectile.x += deltaX * earliest.hit.time;
      projectile.y += deltaY * earliest.hit.time;
      hitBlock(projectile, earliest.block);
      return;
    }
    projectile.x += deltaX;
    projectile.y += deltaY;
    if (terrainFloor(projectile) <= projectile.y + projectile.h) {
      hitGround(projectile);
    } else if (projectile.x > WIDTH + 8 || projectile.x + projectile.w < -8 || projectile.y > HEIGHT) {
      projectile.isAlive = false;
    }
  }

  function recordTrail() {
    game.trailStep += 1;
    if (game.trailStep % TRAIL_SAMPLE_STEPS !== 0 || game.currentTrail.length >= TRAIL_MAX_POINTS) {
      return;
    }
    game.projectiles.forEach((projectile) => {
      if (projectile.isAlive) {
        game.currentTrail.push({ x: Math.round(projectile.x + projectile.w / 2), y: Math.round(projectile.y + projectile.h / 2) });
      }
    });
  }

  function updateProjectiles(deltaSeconds) {
    [...game.projectiles].forEach((projectile) => projectile.isAlive && moveProjectile(projectile, deltaSeconds));
    game.projectiles = game.projectiles.filter((projectile) => projectile.isAlive);
    recordTrail();
    if (game.projectiles.length === 0) {
      game.ghostTrail = game.currentTrail;
      game.ghostAge = 0;
      game.currentTrail = [];
      setState("settle");
    }
  }

  function clearLevel() {
    game.lastBonus = LEVEL_CLEAR_SCORE * game.level + UNUSED_SHOT_SCORE * shotsLeft();
    game.score += game.lastBonus;
    sounds.levelClear();
    setState("clear");
  }

  function loseLife() {
    game.lives -= 1;
    sounds.lifeLost();
    glitch.trigger("goal");
    setState("lost");
  }

  function finishRun() {
    game.isNewBest = game.score > records.best;
    if (game.isNewBest) {
      records.best = game.score;
      recordsStore.save(records);
      sounds.newBest();
    } else {
      sounds.gameOver();
    }
    setState("over");
  }

  function finishSettle() {
    if (targetsLeft() === 0) {
      clearLevel();
    } else if (shotsLeft() === 0) {
      loseLife();
    } else {
      setState("aim");
    }
  }

  function updateAim(deltaSeconds) {
    game.angle += game.angleDirection * ANGLE_SPEED * deltaSeconds;
    if (game.angle >= MAX_ANGLE || game.angle <= MIN_ANGLE) {
      game.angle = clamp(game.angle, MIN_ANGLE, MAX_ANGLE);
      game.angleDirection *= -1;
    }
  }

  function updateCharge(deltaSeconds) {
    game.power += game.powerDirection * POWER_SPEED * deltaSeconds;
    if (game.power >= 1 || game.power <= MIN_POWER) {
      game.power = clamp(game.power, MIN_POWER, 1);
      game.powerDirection *= -1;
    }
  }

  function startCharge() {
    if (game.state !== "aim" || !game.isReady || game.isExiting) {
      return;
    }
    game.power = MIN_POWER;
    game.powerDirection = 1;
    setState("charge");
  }

  function releaseCharge(isCancelled) {
    if (game.state !== "charge") {
      return;
    }
    if (isCancelled) {
      setState("aim");
    } else {
      fire();
    }
  }

  function pause() {
    if (!CONTROLLABLE_STATES.has(game.state)) {
      return;
    }
    game.resumeState = game.state === "charge" ? "aim" : game.state;
    game.state = "paused";
    game.pauseIndex = 0;
    game.pauseView = "main";
    sounds.pause();
  }

  function resume() {
    if (game.state === "paused") {
      game.state = game.resumeState;
      sounds.select();
    }
  }

  function togglePause() {
    if (game.state === "paused") {
      resume();
    } else {
      pause();
    }
  }

  function exitToMenu() {
    if (game.isExiting) {
      return;
    }
    game.isExiting = true;
    const navigate = () => window.location.assign(homeUrl);
    const fallbackTimer = window.setTimeout(navigate, EXIT_FALLBACK_MS);
    crt.powerOff().then(() => {
      window.clearTimeout(fallbackTimer);
      navigate();
    });
  }

  function currentPauseItems() {
    return game.pauseView === "settings" ? [...settings.menuItems(), BACK_ITEM] : PAUSE_ITEMS;
  }

  function openPauseView(view) {
    game.pauseIndex = view === "settings" ? 0 : PAUSE_ITEMS.findIndex((item) => item.id === "settings");
    game.pauseView = view;
  }

  function movePauseSelection(step) {
    const itemCount = currentPauseItems().length;
    game.pauseIndex = (game.pauseIndex + step + itemCount) % itemCount;
    sounds.select();
  }

  function activatePauseItem(index, step = 1) {
    const item = currentPauseItems()[index];
    if (!item) {
      return;
    }
    sounds.select();
    if (settings.activate(item.id, step)) {
      return;
    }
    if (item.id === "continue") {
      resume();
    } else if (item.id === "restart") {
      startRun();
    } else if (item.id === "settings") {
      openPauseView("settings");
    } else if (item.id === "back") {
      openPauseView("main");
    } else if (item.id === "exit") {
      exitToMenu();
    }
  }

  function pauseItemAt(point) {
    const index = Math.round((point.y - PAUSE_MENU_TOP - 2) / PAUSE_ITEM_SPACING);
    const itemCenterY = PAUSE_MENU_TOP + 2 + index * PAUSE_ITEM_SPACING;
    return index >= 0 && index < currentPauseItems().length && Math.abs(point.y - itemCenterY) <= PAUSE_ITEM_SPACING / 2 ? index : -1;
  }

  function handleAction(point) {
    if (!game.isReady || game.isExiting) {
      return;
    }
    if (game.state === "title") {
      startRun();
    } else if (game.state === "paused") {
      const index = point ? pauseItemAt(point) : game.pauseIndex;
      if (index >= 0) {
        game.pauseIndex = index;
        activatePauseItem(index);
      }
    } else if (game.state === "clear" && game.stateTime >= CLEAR_INPUT_DELAY_SECONDS) {
      advanceLevel();
    } else if (game.state === "over" && game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS) {
      startRun();
    }
  }

  function handleKey(code) {
    if (code === "Space" && game.state === "aim") {
      startCharge();
    } else if (code === "Space" || code === "Enter") {
      handleAction(null);
    } else if (code === "Escape" && game.state === "paused" && game.pauseView === "settings") {
      sounds.select();
      openPauseView("main");
    } else if (code === "Escape" || code === "KeyP") {
      togglePause();
    } else if (game.state === "paused" && (code === "ArrowUp" || code === "KeyW")) {
      movePauseSelection(-1);
    } else if (game.state === "paused" && (code === "ArrowDown" || code === "KeyS")) {
      movePauseSelection(1);
    } else if (game.state === "paused" && game.pauseView === "settings" && (code === "ArrowLeft" || code === "KeyA")) {
      activatePauseItem(game.pauseIndex, -1);
    } else if (game.state === "paused" && game.pauseView === "settings" && (code === "ArrowRight" || code === "KeyD")) {
      activatePauseItem(game.pauseIndex, 1);
    }
  }

  function handleKeyUp(code) {
    if (code === "Space") {
      releaseCharge(false);
    }
  }

  function requestImmersive() {
    if (game.hasRequestedImmersive || !isTouchDevice || isStandalone || document.fullscreenElement) {
      return;
    }
    game.hasRequestedImmersive = true;
    const root = document.documentElement;
    if (typeof root.requestFullscreen !== "function") {
      return;
    }
    root.requestFullscreen({ navigationUI: "hide" }).catch((error) => console.info("Fullscreen is unavailable", error));
  }

  createInput(document.querySelector(".game-stage"), {
    onInteraction: () => audio.unlock(),
    onPress: () => startCharge(),
    onRelease: (clientX, clientY, isCancelled) => releaseCharge(isCancelled),
    onTap: (clientX, clientY) => {
      requestImmersive();
      handleAction(display.clientToBuffer(clientX, clientY));
    },
    onMenu: togglePause,
    isMenuZone: menuButton.containsClient,
    onKey: handleKey,
    onKeyUp: handleKeyUp,
  });

  function updateSimulation(deltaSeconds) {
    updateExplosions(deltaSeconds);
    updateBlocks(deltaSeconds);
    game.ghostAge += deltaSeconds;
    game.levelBannerTime = Math.max(0, game.levelBannerTime - deltaSeconds);
  }

  function updateState(deltaSeconds) {
    if (game.state === "aim") {
      updateAim(deltaSeconds);
    } else if (game.state === "charge") {
      updateCharge(deltaSeconds);
    } else if (game.state === "flight") {
      updateProjectiles(deltaSeconds);
    } else if (game.state === "settle") {
      const isCalm = areBlocksSettled() && game.explosions.length === 0;
      if ((isCalm && game.stateTime >= SETTLE_MIN_SECONDS) || game.stateTime >= SETTLE_TIMEOUT_SECONDS) {
        finishSettle();
      }
    } else if (game.state === "lost" && game.stateTime >= LOST_PAUSE_SECONDS) {
      if (game.lives > 0) {
        restartLevel();
      } else {
        finishRun();
      }
    }
    if ((game.state === "aim" || game.state === "charge") && targetsLeft() === 0) {
      clearLevel();
    }
  }

  function update(deltaSeconds) {
    game.time += deltaSeconds;
    glitch.update(deltaSeconds);
    if (game.state === "paused") {
      return;
    }
    game.stateTime += deltaSeconds;
    particles.update(deltaSeconds);
    if (SIMULATED_STATES.has(game.state)) {
      updateSimulation(deltaSeconds);
    }
    updateState(deltaSeconds);
  }

  function isBlinkOn() {
    return Math.floor(game.time * 2.5) % 2 === 0;
  }

  function drawCenteredText(text, y, options) {
    drawText(buffer.context, text, WIDTH / 2, y, { align: "center", ...options });
  }

  function drawBannerText(text, y, color = COLORS.bright) {
    const width = measureText(text);
    buffer.rect(Math.floor(WIDTH / 2 - width / 2) - 2, y - 2, width + 4, 9, "#000");
    drawCenteredText(text, y, { color });
  }

  function drawPattern(pattern, x, y, color) {
    pattern.forEach((row, rowIndex) => {
      Array.from(row).forEach((cell, columnIndex) => {
        if (cell === "#") {
          buffer.rect(x + columnIndex, y + rowIndex, 1, 1, color);
        }
      });
    });
  }

  function drawHud() {
    drawText(buffer.context, String(game.score), 2, 3, { color: COLORS.score });
    drawCenteredText(`LEVEL ${game.level}`, 3, { color: COLORS.dim });
    const livesRight = menuButton.left - 5;
    for (let life = 0; life < game.lives; life++) {
      buffer.rect(livesRight - (life + 1) * 7 + 2, 5, 5, 2, COLORS.dim);
    }
  }

  function drawShotQueue() {
    const top = HEIGHT - 7;
    for (let index = game.shotIndex; index < game.shotQueue.length; index++) {
      const isCurrent = index === game.shotIndex;
      drawPattern(SHOT_TYPES[game.shotQueue[index]].icon, 3 + (index - game.shotIndex) * 7, top, isCurrent ? COLORS.bright : COLORS.dim);
    }
    if (shotsLeft() > 0) {
      drawText(buffer.context, SHOT_TYPES[game.shotQueue[game.shotIndex]].label, 3 + shotsLeft() * 7 + 2, top - 1, { color: COLORS.dim });
    }
  }

  function drawCannon() {
    const pivot = cannonPivot();
    const groundY = game.ground[CANNON_X];
    const radians = toRadians(game.angle);
    for (let step = 0; step <= BARREL_LENGTH; step++) {
      buffer.rect(pivot.x + Math.cos(radians) * step - 1, pivot.y - Math.sin(radians) * step - 1, 2, 2, COLORS.bright);
    }
    buffer.rect(CANNON_X - 4, pivot.y - 1, 8, groundY - pivot.y + 1, COLORS.cannon);
    buffer.rect(CANNON_X - 6, groundY - 2, 12, 2, COLORS.dim);
  }

  function drawAimInfo(scene) {
    const top = cannonPivot().y - 20;
    drawText(buffer.context, String(Math.round(game.angle)), 3, top - 7, { color: COLORS.dim });
    if (scene !== "charge") {
      return;
    }
    buffer.rect(3, top, 22, 3, COLORS.faint);
    buffer.rect(3, top, Math.round(22 * game.power), 3, COLORS.bright);
    if (game.lastPower !== null) {
      buffer.rect(3 + Math.min(21, Math.round(22 * game.lastPower)), top - 1, 1, 5, COLORS.dim);
    }
  }

  function drawBlock(block) {
    const { x, y, w, h, material } = block;
    if (material === "target") {
      drawPattern(TARGET_PATTERN, Math.round(x), Math.round(y), isBlinkOn() ? COLORS.bright : "#b0b0b0");
    } else if (material === "tnt") {
      drawPattern(TNT_PATTERN, Math.round(x), Math.round(y), COLORS.bright);
    } else if (material === "steel") {
      buffer.rect(x, y, w, h, COLORS.bright);
      for (let offset = 1; offset < w - 1; offset += 3) {
        buffer.rect(x + offset, y + Math.floor(h / 2), 1, 1, "#000");
      }
    } else {
      buffer.rect(x, y, w, h, MATERIALS[material].shades[Math.max(0, block.hp)]);
    }
  }

  function drawGhostTrail() {
    const fade = 1 - game.ghostAge / TRAIL_FADE_SECONDS;
    if (fade <= 0 || game.ghostTrail.length === 0) {
      return;
    }
    const color = gray(0.15 + 0.45 * fade);
    game.ghostTrail.forEach((point) => buffer.rect(point.x, point.y, 1, 1, color));
  }

  function drawRings() {
    game.rings.forEach((ring) => {
      const radius = ring.maxRadius * (ring.age / RING_SECONDS);
      const pointCount = 20;
      for (let index = 0; index < pointCount; index++) {
        const angle = (index / pointCount) * Math.PI * 2;
        buffer.rect(ring.x + Math.cos(angle) * radius, ring.y + Math.sin(angle) * radius, 1, 1, COLORS.bright);
      }
    });
  }

  function drawProjectiles() {
    game.projectiles.forEach((projectile) => buffer.rect(projectile.x, projectile.y, projectile.w, projectile.h, COLORS.bright));
  }

  function drawWorld(scene) {
    if (game.terrainImage) {
      buffer.context.drawImage(game.terrainImage, 0, 0);
    }
    drawGhostTrail();
    game.blocks.forEach(drawBlock);
    drawCannon();
    drawProjectiles();
    drawRings();
    particles.draw(buffer.context);
    if (scene !== "title") {
      drawHud();
      drawShotQueue();
    }
    if (scene === "aim" || scene === "charge") {
      drawAimInfo(scene);
    }
  }

  function drawVeil() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.veil);
  }

  function drawTitle() {
    drawVeil();
    drawCenteredText("BOMBARDA", 14, { scale: 3, color: COLORS.bright });
    if (isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO START" : "PRESS SPACE", 42, { color: COLORS.bright });
    }
    const hints = isTouchDevice ? ["HOLD: STOP AIM AND CHARGE", "RELEASE: FIRE", "II: PAUSE"] : ["HOLD SPACE: STOP AIM AND CHARGE", "RELEASE: FIRE", "ESC: PAUSE"];
    hints.forEach((hint, index) => drawCenteredText(hint, 58 + index * 9, { color: COLORS.dim }));
    drawCenteredText(`BEST ${records.best}`, 92, { color: COLORS.dim });
  }

  function drawStateHint(scene) {
    if (scene === "clear") {
      drawBannerText("LEVEL CLEAR", 30);
      drawBannerText(`BONUS ${game.lastBonus}`, 42, COLORS.dim);
      if (game.stateTime >= CLEAR_INPUT_DELAY_SECONDS && isBlinkOn()) {
        drawBannerText(isTouchDevice ? "TAP TO CONTINUE" : "SPACE TO CONTINUE", 54);
      }
    } else if (scene === "lost") {
      drawBannerText("OUT OF AMMO", 30);
      drawBannerText(game.lives > 0 ? `LIVES ${game.lives}` : "NO LIVES LEFT", 42, COLORS.dim);
    } else if (game.levelBannerTime > 0) {
      drawBannerText(`LEVEL ${game.level}`, 30);
      drawBannerText(game.blocks.filter((block) => block.material === "target").length > 1 ? "DESTROY THE TARGETS" : "DESTROY THE TARGET", 42, COLORS.dim);
    }
  }

  function drawPauseMenu() {
    drawVeil();
    drawCenteredText(game.pauseView === "settings" ? "SETTINGS" : "PAUSED", 18, { scale: 2, color: COLORS.bright });
    currentPauseItems().forEach((item, index) => {
      const isSelected = index === game.pauseIndex;
      const y = PAUSE_MENU_TOP + index * PAUSE_ITEM_SPACING;
      drawCenteredText(item.label, y, { color: isSelected ? COLORS.bright : COLORS.dim });
      if (isSelected) {
        drawText(buffer.context, ">", Math.floor(WIDTH / 2 - measureText(item.label) / 2) - 8, y, { color: COLORS.bright });
      }
    });
    drawCenteredText(`BEST ${records.best}`, 100, { color: COLORS.faint });
  }

  function drawGameOver() {
    drawVeil();
    drawCenteredText("GAME OVER", 14, { scale: 3, color: COLORS.bright });
    drawCenteredText(String(game.score), 38, { scale: 2, color: COLORS.score });
    drawCenteredText(game.isNewBest ? "NEW BEST!" : `BEST ${records.best}`, 56, { color: game.isNewBest ? COLORS.bright : COLORS.dim });
    drawCenteredText(`LEVEL ${game.level}`, 66, { color: COLORS.dim });
    if (game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS && isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO PLAY AGAIN" : "SPACE TO PLAY AGAIN", 88, { color: COLORS.bright });
    }
  }

  function drawMenuButton() {
    if (game.state === "paused") {
      menuButton.draw(buffer, COLORS.bright);
    } else if (CONTROLLABLE_STATES.has(game.state)) {
      menuButton.draw(buffer, COLORS.dim);
    }
  }

  function monitorPerformance(frameSeconds) {
    if (performanceSample.isDone || !crt.isAccelerated) {
      return;
    }
    performanceSample.frames += 1;
    performanceSample.seconds += frameSeconds;
    if (performanceSample.frames >= PERFORMANCE_SAMPLE_FRAMES) {
      performanceSample.isDone = true;
      if (performanceSample.seconds / performanceSample.frames > LOW_QUALITY_FRAME_SECONDS) {
        crt.setQuality("low");
      }
    }
  }

  function render(frameSeconds) {
    const scene = sceneState();
    buffer.clear("#000");
    drawWorld(scene);
    if (game.state === "paused") {
      drawPauseMenu();
    } else if (scene === "title") {
      drawTitle();
    } else if (scene === "over") {
      drawGameOver();
    } else {
      drawStateHint(scene);
    }
    drawMenuButton();
    crt.render(glitch.uniforms(), frameSeconds);
    monitorPerformance(frameSeconds);
  }

  function powerOn() {
    game.isReady = false;
    game.isExiting = false;
    crt.powerOn().then(() => {
      game.isReady = true;
    });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      pause();
    }
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      powerOn();
    }
  });

  window.addEventListener("storage", () => {
    records = sanitizeRecords(recordsStore.load());
  });

  settings.onChange(({ sound }) => {
    audio.setMuted(!sound);
    crt.setPalette(readPalette());
  });

  const loop = createLoop({
    update,
    render,
    onError: (error) => {
      console.error("Bombarda crashed", error);
      showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
    },
  });

  game.runSeed = Math.floor(Math.random() * 4294967296);
  loadLevel();
  loop.start();
  powerOn();
}

try {
  startGame();
} catch (error) {
  console.error("Unable to start Bombarda", error);
  showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
}
