import { createLoop } from "../../assets/js/engine/loop.js";
import { createBuffer, createDisplay } from "../../assets/js/engine/screen.js";
import { createCrt } from "../../assets/js/engine/crt.js";
import { createGlitch } from "../../assets/js/engine/glitch.js";
import { createInput } from "../../assets/js/engine/input.js";
import { createMenuButton } from "../../assets/js/engine/menubutton.js";
import { createParticles } from "../../assets/js/engine/particles.js";
import { createAudio } from "../../assets/js/engine/audio.js";
import { createStore } from "../../assets/js/engine/storage.js";
import { createSettings, readPalette } from "../../assets/js/engine/settings.js";
import { drawText, measureText } from "../../assets/js/engine/pixelfont.js";

const WIDTH = 108;
const HEIGHT = 192;
const GROUND_Y = 186;
const IMPACT_Y = 180;
const MAX_TARGET_Y = 166;
const ANTENNA_X = 54;
const ANTENNA_Y = 172;
const ANTENNA_GAP_LEFT = 48;
const ANTENNA_GAP_RIGHT = 60;
const SPAWN_MIN_X = 4;
const SPAWN_MAX_X = 104;
const TARGET_MIN_X = 6;
const TARGET_MAX_X = 102;
const BEAM_MIN_ANGLE = 0.04;
const BEAM_MAX_ANGLE = Math.PI - 0.04;
const BEAM_LENGTH = 200;
const BEAM_START = 5;
const BASE_SWEEP_SPEED = 2;
const BASE_BLIP_FADE = 2.6;
const PINGS_PER_ENEMY = 2;
const RANGE_ARC_RADII = [50, 100, 150];
const BASE_INTERCEPTOR_SPEED = 120;
const BASE_BLAST_RADIUS = 10;
const BLAST_GROW_SECONDS = 0.18;
const BLAST_HOLD_SECONDS = 0.25;
const BLAST_SHRINK_SECONDS = 0.3;
const BASE_SILO_CAPACITY = 3;
const BASE_RELOAD_SECONDS = 1;
const CITY_MAX_HP = 12;
const REPAIR_HP = 4;
const REPAIR_HEALTH = 0.35;
const IMPACT_DAMAGE_RADIUS = 5;
const IMPACT_BUILDING_DAMAGE = 0.45;
const DODGER_TURN_RATE = 1.2;
const DODGER_RETARGET_SECONDS = [1.2, 2.4];
const SPLIT_HEIGHT_RANGE = [50, 100];
const FRAGMENT_SPREAD_X = 18;
const COMBO_BONUS = 25;
const POPUP_SECONDS = 0.8;
const WAVE_BANNER_SECONDS = 2.2;
const FIRST_SPAWN_DELAY_SECONDS = 1.8;
const UPGRADE_INPUT_DELAY_SECONDS = 0.6;
const FALL_SECONDS = 1.6;
const GAME_OVER_INPUT_DELAY_SECONDS = 1;
const EXIT_FALLBACK_MS = 700;
const LOW_QUALITY_FRAME_SECONDS = 1 / 40;
const PERFORMANCE_SAMPLE_FRAMES = 180;
const PAUSE_MENU_TOP = 70;
const PAUSE_ITEM_SPACING = 12;
const UPGRADE_OFFER_COUNT = 3;
const CARD_LEFT = 6;
const CARD_WIDTH = 96;
const CARD_HEIGHT = 20;
const CARD_TOP = 78;
const CARD_SPACING = 24;
const PAUSE_ITEMS = [
  { id: "continue", label: "CONTINUE" },
  { id: "restart", label: "RESTART" },
  { id: "settings", label: "SETTINGS" },
  { id: "exit", label: "EXIT" },
];
const BACK_ITEM = { id: "back", label: "BACK" };
const CONTROLLABLE_STATES = new Set(["title", "wave", "upgrade", "fall"]);
const SIMULATED_STATES = new Set(["wave", "fall"]);
const ENEMY_KINDS = {
  warhead: { label: "WARHEAD", score: 25, damage: 2, speedFactor: 1, intensity: 1, fadeFactor: 1, unlockWave: 1, weight: 4 },
  splitter: { label: "SPLITTER", score: 50, damage: 2, speedFactor: 0.9, intensity: 1, fadeFactor: 1, unlockWave: 3, weight: 1.5 },
  dodger: { label: "DODGER", score: 50, damage: 2, speedFactor: 1, intensity: 1, fadeFactor: 1, unlockWave: 5, weight: 1.5 },
  stealth: { label: "STEALTH", score: 75, damage: 2, speedFactor: 0.9, intensity: 0.55, fadeFactor: 0.4, unlockWave: 7, weight: 1.2 },
  fragment: { label: "FRAGMENT", score: 15, damage: 1, speedFactor: 1.15, intensity: 0.8, fadeFactor: 1, unlockWave: Infinity, weight: 0 },
};
const UPGRADES = [
  { id: "blast", label: "BLAST +", detail: "BIGGER EXPLOSIONS", maxLevel: 4 },
  { id: "speed", label: "SPEED +", detail: "FASTER INTERCEPTORS", maxLevel: 4 },
  { id: "silo", label: "SILO +1", detail: "ONE MORE READY MISSILE", maxLevel: 4 },
  { id: "reload", label: "RELOAD", detail: "SILO RELOADS FASTER", maxLevel: 4 },
  { id: "radar", label: "RADAR", detail: "FASTER BEAM SWEEP", maxLevel: 3 },
  { id: "phosphor", label: "PHOSPHOR", detail: "BLIPS FADE SLOWER", maxLevel: 3 },
  { id: "repair", label: "REPAIR", detail: `CITY +${REPAIR_HP} HP`, maxLevel: Infinity },
];
const COLORS = {
  bright: "#ffffff",
  score: "#d8d8d8",
  dim: "#808080",
  faint: "#505050",
  arc: "#262626",
  beam: "#6a6a6a",
  ground: "#1c1c1c",
  groundEdge: "#6c6c6c",
  building: "#4a4a4a",
  window: "#9a9a9a",
  mast: "#909090",
  veil: "rgba(0, 0, 0, 0.78)",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const randomBetween = (min, max) => min + Math.random() * (max - min);
const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const gray = (level) => {
  const channel = Math.round(clamp(level, 0, 1) * 255);
  return `rgb(${channel}, ${channel}, ${channel})`;
};

function pickWeighted(weights) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  return (entries.find(([, weight]) => (roll -= weight) < 0) ?? entries[0])[0];
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function turnTowards(current, desired, maxStep) {
  const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
  return current + clamp(difference, -maxStep, maxStep);
}

function sanitizeRecords(raw) {
  return { best: toCount(raw.best), bestWave: toCount(raw.bestWave) };
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
    ping: () => audio.tone({ frequency: 1760, duration: 0.03, volume: 0.03, type: "triangle" }),
    launch: () => audio.tone({ frequency: 300, slideTo: 900, duration: 0.15, volume: 0.08 }),
    empty: () => audio.tone({ frequency: 120, duration: 0.05, volume: 0.08 }),
    blast: () => audio.noise({ duration: 0.3, volume: 0.16, highpass: 400 }),
    kill: () => audio.tone({ frequency: 660, slideTo: 1320, duration: 0.08, volume: 0.08 }),
    combo: () => arpeggio([880, 1175], 0.05, 0.06),
    impact: () => {
      audio.noise({ duration: 0.5, volume: 0.25, highpass: 100 });
      audio.tone({ frequency: 80, slideTo: 35, duration: 0.45, volume: 0.15 });
    },
    waveClear: () => arpeggio([523, 659, 784, 1047], 0.1, 0.12),
    upgrade: () => arpeggio([784, 1047], 0.06, 0.08),
    newBest: () => arpeggio([523, 659, 784, 1047, 1319], 0.12, 0.14),
    gameOver: () => arpeggio([392, 330, 262, 196], 0.16, 0.18),
    select: () => audio.tone({ frequency: 880, duration: 0.04, volume: 0.08 }),
    pause: () => audio.noise({ duration: 0.12, volume: 0.08, highpass: 1500 }),
  };
}

function buildCity() {
  const buildings = [];
  let x = 2;
  while (x < WIDTH - 4) {
    const width = randomInt(4, 7);
    if (x + width > ANTENNA_GAP_LEFT && x < ANTENNA_GAP_RIGHT) {
      x = ANTENNA_GAP_RIGHT;
      continue;
    }
    if (x + width > WIDTH - 2) {
      break;
    }
    const height = randomInt(4, 11);
    const windows = [];
    for (let row = 2; row < height - 1; row += 2) {
      for (let column = 1; column < width - 1; column += 2) {
        if (Math.random() < 0.55) {
          windows.push({ column, row });
        }
      }
    }
    buildings.push({ x, w: width, h: height, health: 1, windows });
    x += width + 1;
  }
  return buildings;
}

function buildArcPoints() {
  return RANGE_ARC_RADII.flatMap((radius) => {
    const pointCount = Math.round(radius / 2);
    return Array.from({ length: pointCount + 1 }, (_, index) => {
      const angle = (index / pointCount) * Math.PI;
      return { x: Math.round(ANTENNA_X + Math.cos(angle) * radius), y: Math.round(ANTENNA_Y - Math.sin(angle) * radius) };
    }).filter((point) => point.x >= 0 && point.x < WIDTH && point.y >= 0);
  });
}

function bearingOf(x, y) {
  return clamp(Math.atan2(ANTENNA_Y - y, x - ANTENNA_X), BEAM_MIN_ANGLE, BEAM_MAX_ANGLE);
}

function waveParameters(wave) {
  return {
    count: Math.min(28, 6 + wave * 2),
    interval: Math.max(0.55, 2.2 - wave * 0.13),
    speed: Math.min(34, 13 + wave * 1.4),
  };
}

function buildSpawnList(wave, count) {
  const weights = Object.fromEntries(Object.entries(ENEMY_KINDS).map(([kind, profile]) => [kind, wave >= profile.unlockWave ? profile.weight : 0]));
  const kinds = Array.from({ length: count }, () => pickWeighted(weights));
  const newKind = Object.keys(ENEMY_KINDS).find((kind) => ENEMY_KINDS[kind].unlockWave === wave && kind !== "warhead");
  if (newKind && kinds.filter((kind) => kind === newKind).length < 2) {
    kinds[1] = newKind;
    kinds[3] = newKind;
  }
  return { kinds, newKind };
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
  const recordsStore = createStore("skyshield", 1, { best: 0, bestWave: 0 });
  const arcPoints = buildArcPoints();
  let records = sanitizeRecords(recordsStore.load());

  const game = {
    state: "title",
    resumeState: "title",
    stateTime: 0,
    time: 0,
    isReady: false,
    isExiting: false,
    hasRequestedImmersive: false,
    wave: 1,
    score: 0,
    cityHp: CITY_MAX_HP,
    buildings: buildCity(),
    levels: {},
    silo: { ready: BASE_SILO_CAPACITY, reloadTime: 0 },
    beamAngle: Math.PI / 2,
    beamDirection: 1,
    enemies: [],
    interceptors: [],
    blasts: [],
    popups: [],
    spawnQueue: [],
    spawnTimer: 0,
    waveSpeed: 0,
    waveInterval: 0,
    newKind: null,
    bannerTime: 0,
    lastBonus: 0,
    offers: [],
    offerIndex: 0,
    isNewBest: false,
    pauseIndex: 0,
    pauseView: "main",
  };
  const performanceSample = { frames: 0, seconds: 0, isDone: false };

  const levelOf = (id) => game.levels[id] ?? 0;
  const blastRadius = () => BASE_BLAST_RADIUS + 2 * levelOf("blast");
  const interceptorSpeed = () => BASE_INTERCEPTOR_SPEED * (1 + 0.2 * levelOf("speed"));
  const siloCapacity = () => BASE_SILO_CAPACITY + levelOf("silo");
  const reloadSeconds = () => BASE_RELOAD_SECONDS * 0.85 ** levelOf("reload");
  const sweepSpeed = () => BASE_SWEEP_SPEED * (1 + 0.15 * levelOf("radar"));
  const blipFade = () => BASE_BLIP_FADE + 0.7 * levelOf("phosphor");

  function setState(state) {
    game.state = state;
    game.stateTime = 0;
  }

  function sceneState() {
    return game.state === "paused" ? game.resumeState : game.state;
  }

  function startWave(wave) {
    const parameters = waveParameters(wave);
    const spawnList = buildSpawnList(wave, parameters.count);
    game.wave = wave;
    game.spawnQueue = spawnList.kinds;
    game.newKind = spawnList.newKind;
    game.waveSpeed = parameters.speed;
    game.waveInterval = parameters.interval;
    game.spawnTimer = FIRST_SPAWN_DELAY_SECONDS;
    game.bannerTime = WAVE_BANNER_SECONDS;
    game.enemies = [];
    game.interceptors = [];
    game.blasts = [];
    game.popups = [];
    game.silo = { ready: siloCapacity(), reloadTime: 0 };
    setState("wave");
  }

  function startRun() {
    game.score = 0;
    game.cityHp = CITY_MAX_HP;
    game.buildings = buildCity();
    game.levels = {};
    game.isNewBest = false;
    particles.clear();
    startWave(1);
  }

  function createEnemy(kind, x, y, targetX, speed) {
    return {
      kind,
      x,
      y,
      targetX,
      speed,
      heading: Math.atan2(IMPACT_Y - y, targetX - x),
      pings: [],
      splitY: kind === "splitter" ? randomBetween(...SPLIT_HEIGHT_RANGE) : Infinity,
      retargetTime: randomBetween(...DODGER_RETARGET_SECONDS),
      isAlive: true,
    };
  }

  function spawnEnemy(kind) {
    const speed = game.waveSpeed * ENEMY_KINDS[kind].speedFactor;
    game.enemies.push(createEnemy(kind, randomBetween(SPAWN_MIN_X, SPAWN_MAX_X), -2, randomBetween(TARGET_MIN_X, TARGET_MAX_X), speed));
  }

  function updateSpawning(deltaSeconds) {
    if (game.spawnQueue.length === 0) {
      return;
    }
    game.spawnTimer -= deltaSeconds;
    if (game.spawnTimer <= 0) {
      spawnEnemy(game.spawnQueue.shift());
      game.spawnTimer = game.waveInterval * randomBetween(0.6, 1.4);
    }
  }

  function splitEnemy(enemy) {
    enemy.isAlive = false;
    const speed = game.waveSpeed * ENEMY_KINDS.fragment.speedFactor;
    [-1, 0, 1].forEach((side) => {
      const targetX = clamp(enemy.targetX + side * FRAGMENT_SPREAD_X, TARGET_MIN_X, TARGET_MAX_X);
      game.enemies.push(createEnemy("fragment", enemy.x, enemy.y, targetX, speed));
    });
  }

  function steerDodger(enemy, deltaSeconds) {
    enemy.retargetTime -= deltaSeconds;
    if (enemy.retargetTime <= 0) {
      enemy.targetX = randomBetween(TARGET_MIN_X, TARGET_MAX_X);
      enemy.retargetTime = randomBetween(...DODGER_RETARGET_SECONDS);
    }
    const desired = Math.atan2(IMPACT_Y - enemy.y, enemy.targetX - enemy.x);
    enemy.heading = turnTowards(enemy.heading, desired, DODGER_TURN_RATE * deltaSeconds);
  }

  function damageCity(enemy) {
    game.cityHp = Math.max(0, game.cityHp - ENEMY_KINDS[enemy.kind].damage);
    game.buildings.forEach((building) => {
      if (building.x < enemy.x + IMPACT_DAMAGE_RADIUS && building.x + building.w > enemy.x - IMPACT_DAMAGE_RADIUS) {
        building.health = Math.max(0, building.health - IMPACT_BUILDING_DAMAGE);
      }
    });
    particles.emit(enemy.x, IMPACT_Y, { count: 26, angle: -Math.PI / 2, spread: 1.6, speed: [20, 70], lifetime: [0.3, 0.9], sizes: [1, 2], fall: 90 });
    sounds.impact();
    glitch.trigger("hit");
    if (game.cityHp === 0 && game.state === "wave") {
      setState("fall");
    }
  }

  function moveEnemy(enemy, deltaSeconds) {
    if (enemy.kind === "dodger") {
      steerDodger(enemy, deltaSeconds);
    }
    enemy.x = clamp(enemy.x + Math.cos(enemy.heading) * enemy.speed * deltaSeconds, 1, WIDTH - 1);
    enemy.y += Math.sin(enemy.heading) * enemy.speed * deltaSeconds;
    enemy.pings.forEach((ping) => (ping.age += deltaSeconds));
    if (enemy.y >= enemy.splitY) {
      splitEnemy(enemy);
    } else if (enemy.y >= IMPACT_Y) {
      enemy.isAlive = false;
      damageCity(enemy);
    }
  }

  function updateBeam(deltaSeconds) {
    const previousAngle = game.beamAngle;
    let sweptMin = previousAngle;
    let sweptMax = previousAngle;
    game.beamAngle += game.beamDirection * sweepSpeed() * deltaSeconds;
    if (game.beamAngle >= BEAM_MAX_ANGLE || game.beamAngle <= BEAM_MIN_ANGLE) {
      const bound = game.beamAngle >= BEAM_MAX_ANGLE ? BEAM_MAX_ANGLE : BEAM_MIN_ANGLE;
      sweptMin = Math.min(sweptMin, bound);
      sweptMax = Math.max(sweptMax, bound);
      game.beamAngle = bound;
      game.beamDirection *= -1;
    }
    return { min: Math.min(sweptMin, game.beamAngle), max: Math.max(sweptMax, game.beamAngle) };
  }

  function detectEnemies(swept) {
    let hasDetected = false;
    game.enemies.forEach((enemy) => {
      const bearing = bearingOf(enemy.x, enemy.y);
      if (bearing >= swept.min && bearing <= swept.max) {
        enemy.pings.unshift({ x: enemy.x, y: enemy.y, age: 0 });
        enemy.pings.length = Math.min(enemy.pings.length, PINGS_PER_ENEMY);
        hasDetected = true;
      }
    });
    if (hasDetected && game.state === "wave") {
      sounds.ping();
    }
  }

  function launchInterceptor(point) {
    if (game.silo.ready === 0) {
      sounds.empty();
      return;
    }
    const targetX = clamp(point.x, 1, WIDTH - 1);
    const targetY = clamp(point.y, 1, MAX_TARGET_Y);
    const distance = Math.hypot(targetX - ANTENNA_X, targetY - ANTENNA_Y);
    const speed = interceptorSpeed();
    game.silo.ready -= 1;
    game.interceptors.push({
      x: ANTENNA_X,
      y: ANTENNA_Y,
      targetX,
      targetY,
      vx: ((targetX - ANTENNA_X) / distance) * speed,
      vy: ((targetY - ANTENNA_Y) / distance) * speed,
      remaining: distance / speed,
    });
    sounds.launch();
  }

  function updateSilo(deltaSeconds) {
    if (game.silo.ready >= siloCapacity()) {
      game.silo.reloadTime = 0;
      return;
    }
    game.silo.reloadTime += deltaSeconds;
    if (game.silo.reloadTime >= reloadSeconds()) {
      game.silo.ready += 1;
      game.silo.reloadTime = 0;
    }
  }

  function detonate(interceptor) {
    game.blasts.push({ x: interceptor.targetX, y: interceptor.targetY, age: 0, maxRadius: blastRadius(), kills: 0 });
    sounds.blast();
  }

  function updateInterceptors(deltaSeconds) {
    game.interceptors = game.interceptors.filter((interceptor) => {
      interceptor.remaining -= deltaSeconds;
      if (interceptor.remaining <= 0) {
        detonate(interceptor);
        return false;
      }
      interceptor.x += interceptor.vx * deltaSeconds;
      interceptor.y += interceptor.vy * deltaSeconds;
      return true;
    });
  }

  function blastRadiusAt(blast) {
    if (blast.age < BLAST_GROW_SECONDS) {
      return blast.maxRadius * (blast.age / BLAST_GROW_SECONDS);
    }
    const shrinkAge = blast.age - BLAST_GROW_SECONDS - BLAST_HOLD_SECONDS;
    return shrinkAge <= 0 ? blast.maxRadius : blast.maxRadius * Math.max(0, 1 - shrinkAge / BLAST_SHRINK_SECONDS);
  }

  function addPopup(x, y, text) {
    game.popups.push({ x, y, text, age: 0 });
  }

  function destroyEnemy(enemy, blast) {
    enemy.isAlive = false;
    blast.kills += 1;
    game.score += ENEMY_KINDS[enemy.kind].score;
    particles.emit(enemy.x, enemy.y, { count: 14, spread: Math.PI * 2, speed: [15, 55], lifetime: [0.2, 0.6], sizes: [1, 1, 2], fall: 40 });
    if (blast.kills >= 2) {
      const bonus = COMBO_BONUS * (blast.kills - 1);
      game.score += bonus;
      addPopup(blast.x, blast.y - blast.maxRadius - 6, `+${bonus}`);
      sounds.combo();
    } else {
      sounds.kill();
    }
  }

  function updateBlasts(deltaSeconds) {
    const totalSeconds = BLAST_GROW_SECONDS + BLAST_HOLD_SECONDS + BLAST_SHRINK_SECONDS;
    game.blasts = game.blasts.filter((blast) => (blast.age += deltaSeconds) < totalSeconds);
    game.blasts.forEach((blast) => {
      const radius = blastRadiusAt(blast);
      game.enemies.forEach((enemy) => {
        if (enemy.isAlive && Math.hypot(enemy.x - blast.x, enemy.y - blast.y) <= radius) {
          destroyEnemy(enemy, blast);
        }
      });
    });
  }

  function updateEnemies(deltaSeconds) {
    [...game.enemies].forEach((enemy) => enemy.isAlive && moveEnemy(enemy, deltaSeconds));
    game.enemies = game.enemies.filter((enemy) => enemy.isAlive);
  }

  function isWaveOver() {
    return game.spawnQueue.length === 0 && game.enemies.length === 0 && game.interceptors.length === 0 && game.blasts.length === 0;
  }

  function availableUpgrades() {
    return UPGRADES.filter((upgrade) => (upgrade.id === "repair" ? game.cityHp < CITY_MAX_HP : levelOf(upgrade.id) < upgrade.maxLevel));
  }

  function finishWave() {
    game.lastBonus = 50 * game.wave + 10 * game.cityHp;
    game.score += game.lastBonus;
    game.offers = shuffle(availableUpgrades()).slice(0, UPGRADE_OFFER_COUNT);
    game.offerIndex = 0;
    sounds.waveClear();
    setState("upgrade");
  }

  function repairCity() {
    game.cityHp = Math.min(CITY_MAX_HP, game.cityHp + REPAIR_HP);
    game.buildings.forEach((building) => (building.health = Math.min(1, building.health + REPAIR_HEALTH)));
  }

  function chooseUpgrade(index) {
    const offer = game.offers[index];
    if (offer) {
      game.levels[offer.id] = levelOf(offer.id) + 1;
      if (offer.id === "repair") {
        repairCity();
      }
      sounds.upgrade();
    }
    startWave(game.wave + 1);
  }

  function finishRun() {
    game.isNewBest = game.score > records.best;
    records.bestWave = Math.max(records.bestWave, game.wave);
    if (game.isNewBest) {
      records.best = game.score;
      sounds.newBest();
    } else {
      sounds.gameOver();
    }
    recordsStore.save(records);
    setState("over");
  }

  function pause() {
    if (!CONTROLLABLE_STATES.has(game.state)) {
      return;
    }
    game.resumeState = game.state;
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

  function cardTop(index) {
    return CARD_TOP + index * CARD_SPACING;
  }

  function cardAt(point) {
    return game.offers.findIndex((_, index) => point.x >= CARD_LEFT && point.x <= CARD_LEFT + CARD_WIDTH && point.y >= cardTop(index) && point.y <= cardTop(index) + CARD_HEIGHT);
  }

  function isUpgradeInputOpen() {
    return game.state === "upgrade" && game.stateTime >= UPGRADE_INPUT_DELAY_SECONDS;
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
    } else if (isUpgradeInputOpen()) {
      const index = point ? cardAt(point) : game.offerIndex;
      if (index >= 0 || game.offers.length === 0) {
        chooseUpgrade(index);
      }
    } else if (game.state === "over" && game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS) {
      startRun();
    }
  }

  function handlePress(clientX, clientY) {
    if (game.state === "wave" && game.isReady && !game.isExiting) {
      launchInterceptor(display.clientToBuffer(clientX, clientY));
    }
  }

  function moveOfferSelection(step) {
    if (game.offers.length > 0) {
      game.offerIndex = (game.offerIndex + step + game.offers.length) % game.offers.length;
      sounds.select();
    }
  }

  function handleKey(code) {
    if (code === "Space" || code === "Enter") {
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
    } else if (game.state === "upgrade" && (code === "ArrowUp" || code === "KeyW")) {
      moveOfferSelection(-1);
    } else if (game.state === "upgrade" && (code === "ArrowDown" || code === "KeyS")) {
      moveOfferSelection(1);
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
    onPress: handlePress,
    onTap: (clientX, clientY) => {
      requestImmersive();
      handleAction(display.clientToBuffer(clientX, clientY));
    },
    onMenu: togglePause,
    isMenuZone: menuButton.containsClient,
    onKey: handleKey,
  });

  function updateSimulation(deltaSeconds) {
    updateInterceptors(deltaSeconds);
    updateBlasts(deltaSeconds);
    updateEnemies(deltaSeconds);
    game.popups = game.popups.filter((popup) => (popup.age += deltaSeconds) < POPUP_SECONDS);
    game.bannerTime = Math.max(0, game.bannerTime - deltaSeconds);
  }

  function updateState(deltaSeconds) {
    if (game.state === "wave") {
      updateSpawning(deltaSeconds);
      updateSilo(deltaSeconds);
      if (isWaveOver()) {
        finishWave();
      }
    } else if (game.state === "fall" && game.stateTime >= FALL_SECONDS) {
      finishRun();
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
    detectEnemies(updateBeam(deltaSeconds));
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

  function drawRadar() {
    arcPoints.forEach((point) => buffer.rect(point.x, point.y, 1, 1, COLORS.arc));
    const directionX = Math.cos(game.beamAngle);
    const directionY = -Math.sin(game.beamAngle);
    for (let distance = BEAM_START; distance < BEAM_LENGTH; distance++) {
      const x = ANTENNA_X + directionX * distance;
      const y = ANTENNA_Y + directionY * distance;
      if (x < 0 || x >= WIDTH || y < 0) {
        break;
      }
      buffer.rect(x, y, 1, 1, COLORS.beam);
    }
  }

  function drawBlips() {
    const fade = blipFade();
    game.enemies.forEach((enemy) => {
      const profile = ENEMY_KINDS[enemy.kind];
      const lifetime = fade * profile.fadeFactor;
      enemy.pings.forEach((ping, index) => {
        const level = profile.intensity * (1 - ping.age / lifetime) * (index === 0 ? 1 : 0.5);
        if (level <= 0.04) {
          return;
        }
        const size = index === 0 && enemy.kind !== "fragment" ? 2 : 1;
        buffer.rect(Math.round(ping.x) - Math.floor(size / 2), Math.round(ping.y) - Math.floor(size / 2), size, size, gray(level));
      });
    });
  }

  function drawCity() {
    buffer.rect(0, GROUND_Y, WIDTH, HEIGHT - GROUND_Y, COLORS.ground);
    buffer.rect(0, GROUND_Y, WIDTH, 1, COLORS.groundEdge);
    game.buildings.forEach((building) => {
      const height = building.health > 0 ? Math.max(1, Math.round(building.h * building.health)) : 0;
      if (height === 0) {
        return;
      }
      const top = GROUND_Y - height;
      buffer.rect(building.x, top, building.w, height, COLORS.building);
      building.windows.forEach(({ column, row }) => {
        if (row < height - 1) {
          buffer.rect(building.x + column, GROUND_Y - 1 - row, 1, 1, COLORS.window);
        }
      });
    });
  }

  function drawAntenna() {
    buffer.rect(ANTENNA_X - 1, ANTENNA_Y, 2, GROUND_Y - ANTENNA_Y, COLORS.mast);
    buffer.rect(ANTENNA_X - 3, GROUND_Y - 2, 6, 2, COLORS.dim);
    for (let step = 0; step <= 3; step++) {
      buffer.rect(ANTENNA_X + Math.cos(game.beamAngle) * step, ANTENNA_Y - Math.sin(game.beamAngle) * step, 1, 1, COLORS.bright);
    }
  }

  function drawInterceptors() {
    game.interceptors.forEach((interceptor) => {
      buffer.rect(interceptor.x, interceptor.y, 1, 1, COLORS.bright);
      if (isBlinkOn()) {
        buffer.rect(interceptor.targetX - 1, interceptor.targetY, 3, 1, COLORS.dim);
        buffer.rect(interceptor.targetX, interceptor.targetY - 1, 1, 3, COLORS.dim);
      }
    });
  }

  function drawBlasts() {
    game.blasts.forEach((blast) => {
      const radius = blastRadiusAt(blast);
      const pointCount = Math.max(12, Math.round(radius * 6));
      for (let index = 0; index < pointCount; index++) {
        const angle = (index / pointCount) * Math.PI * 2;
        buffer.rect(blast.x + Math.cos(angle) * radius, blast.y + Math.sin(angle) * radius, 1, 1, COLORS.bright);
        if (index % 2 === 0) {
          buffer.rect(blast.x + Math.cos(angle) * radius * 0.55, blast.y + Math.sin(angle) * radius * 0.55, 1, 1, COLORS.faint);
        }
      }
    });
  }

  function drawPopups() {
    game.popups.forEach((popup) => {
      drawText(buffer.context, popup.text, popup.x, popup.y - popup.age * 8, { align: "center", color: gray(1 - popup.age / POPUP_SECONDS) });
    });
  }

  function drawHud() {
    drawText(buffer.context, String(game.score), 2, 3, { color: COLORS.score });
    drawCenteredText(`WAVE ${game.wave}`, 3, { color: COLORS.dim });
    const capacity = siloCapacity();
    for (let index = 0; index < capacity; index++) {
      buffer.rect(3 + index * 4, GROUND_Y + 3, 2, 2, index < game.silo.ready ? COLORS.bright : COLORS.faint);
    }
    const barWidth = 40;
    const barLeft = WIDTH - 3 - barWidth;
    buffer.rect(barLeft, GROUND_Y + 3, barWidth, 2, COLORS.faint);
    buffer.rect(barLeft, GROUND_Y + 3, Math.round((barWidth * game.cityHp) / CITY_MAX_HP), 2, COLORS.dim);
  }

  function drawWorld(scene) {
    drawRadar();
    drawBlips();
    drawCity();
    drawAntenna();
    drawInterceptors();
    drawBlasts();
    particles.draw(buffer.context);
    drawPopups();
    if (scene !== "title") {
      drawHud();
    }
  }

  function drawVeil() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.veil);
  }

  function drawTitle() {
    drawVeil();
    drawCenteredText("SKYSHIELD", 40, { scale: 2, color: COLORS.bright });
    if (isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO START" : "CLICK TO START", 66, { color: COLORS.bright });
    }
    const hints = [
      "MISSILES SHOW ONLY",
      "WHEN THE RADAR SEES THEM",
      "",
      isTouchDevice ? "TAP: LAUNCH INTERCEPTOR" : "CLICK: LAUNCH INTERCEPTOR",
      "LEAD YOUR TARGETS",
      isTouchDevice ? "II: PAUSE" : "ESC: PAUSE",
    ];
    hints.forEach((hint, index) => drawCenteredText(hint, 88 + index * 9, { color: COLORS.dim }));
    drawCenteredText(`BEST ${records.best}`, 150, { color: COLORS.dim });
    if (records.bestWave > 0) {
      drawCenteredText(`BEST WAVE ${records.bestWave}`, 159, { color: COLORS.faint });
    }
  }

  function drawWaveBanner() {
    if (game.bannerTime <= 0) {
      return;
    }
    drawBannerText(`WAVE ${game.wave}`, 70);
    if (game.newKind) {
      drawBannerText(`NEW: ${ENEMY_KINDS[game.newKind].label}`, 82, COLORS.dim);
    }
  }

  function drawUpgradeCard(offer, index) {
    const top = cardTop(index);
    const isSelected = index === game.offerIndex && !isTouchDevice;
    buffer.rect(CARD_LEFT, top, CARD_WIDTH, CARD_HEIGHT, isSelected ? COLORS.dim : COLORS.faint);
    buffer.rect(CARD_LEFT + 1, top + 1, CARD_WIDTH - 2, CARD_HEIGHT - 2, "#000");
    const level = levelOf(offer.id);
    const suffix = Number.isFinite(offer.maxLevel) ? ` ${level + 1}/${offer.maxLevel}` : "";
    drawCenteredText(`${offer.label}${suffix}`, top + 4, { color: COLORS.bright });
    drawCenteredText(offer.detail, top + 11, { color: COLORS.dim });
  }

  function drawUpgradeScreen() {
    drawVeil();
    drawCenteredText(`WAVE ${game.wave}`, 26, { scale: 2, color: COLORS.bright });
    drawCenteredText("CLEAR", 42, { color: COLORS.bright });
    drawCenteredText(`BONUS ${game.lastBonus}`, 52, { color: COLORS.dim });
    drawCenteredText(game.offers.length > 0 ? "CHOOSE UPGRADE" : "ALL UPGRADES MAXED", 66, { color: COLORS.dim });
    game.offers.forEach(drawUpgradeCard);
    if (isUpgradeInputOpen() && isBlinkOn()) {
      const hint = game.offers.length > 0 ? (isTouchDevice ? "TAP A CARD" : "CLICK A CARD") : isTouchDevice ? "TAP TO CONTINUE" : "SPACE TO CONTINUE";
      drawCenteredText(hint, 156, { color: COLORS.bright });
    }
  }

  function drawPauseMenu() {
    drawVeil();
    drawCenteredText(game.pauseView === "settings" ? "SETTINGS" : "PAUSED", 40, { scale: 2, color: COLORS.bright });
    currentPauseItems().forEach((item, index) => {
      const isSelected = index === game.pauseIndex;
      const y = PAUSE_MENU_TOP + index * PAUSE_ITEM_SPACING;
      drawCenteredText(item.label, y, { color: isSelected ? COLORS.bright : COLORS.dim });
      if (isSelected) {
        drawText(buffer.context, ">", Math.floor(WIDTH / 2 - measureText(item.label) / 2) - 8, y, { color: COLORS.bright });
      }
    });
    drawCenteredText(`BEST ${records.best}`, 150, { color: COLORS.faint });
  }

  function drawGameOver() {
    drawVeil();
    drawCenteredText("GAME OVER", 46, { scale: 2, color: COLORS.bright });
    drawCenteredText(String(game.score), 70, { scale: 2, color: COLORS.score });
    drawCenteredText(game.isNewBest ? "NEW BEST!" : `BEST ${records.best}`, 90, { color: game.isNewBest ? COLORS.bright : COLORS.dim });
    drawCenteredText(`WAVE ${game.wave}`, 100, { color: COLORS.dim });
    if (game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS && isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO PLAY AGAIN" : "CLICK TO PLAY AGAIN", 140, { color: COLORS.bright });
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
    } else if (scene === "upgrade") {
      drawUpgradeScreen();
    } else if (scene === "over") {
      drawGameOver();
    } else {
      drawWaveBanner();
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
      console.error("Skyshield crashed", error);
      showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
    },
  });

  loop.start();
  powerOn();
}

try {
  startGame();
} catch (error) {
  console.error("Unable to start Skyshield", error);
  showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
}
