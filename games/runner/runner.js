import { createLoop } from "../../assets/js/engine/loop.js";
import { createBuffer, createDisplay } from "../../assets/js/engine/screen.js";
import { createCrt } from "../../assets/js/engine/crt.js";
import { createGlitch } from "../../assets/js/engine/glitch.js";
import { createInput } from "../../assets/js/engine/input.js";
import { overlaps } from "../../assets/js/engine/collision.js";
import { createParticles } from "../../assets/js/engine/particles.js";
import { createAudio } from "../../assets/js/engine/audio.js";
import { createStore } from "../../assets/js/engine/storage.js";
import { createSettings, readPalette } from "../../assets/js/engine/settings.js";
import { drawText, measureText } from "../../assets/js/engine/pixelfont.js";

const WIDTH = 192;
const HEIGHT = 108;
const GROUND_Y = 88;
const PLAYER_X = 28;
const BODY_WIDTH = 8;
const BODY_HEIGHT = 8;
const LEG_HEIGHT = 3;
const STAND_HEIGHT = BODY_HEIGHT + LEG_HEIGHT;
const DUCK_WIDTH = 10;
const DUCK_BODY_HEIGHT = 5;
const DUCK_HEIGHT = DUCK_BODY_HEIGHT + 1;
const FOOT_INSET = 1;
const GRAVITY = 620;
const FAST_FALL_MULTIPLIER = 2.6;
const MAX_FALL_SPEED = 320;
const JUMP_SPEED = 156;
const DOUBLE_JUMP_SPEED = 128;
const MAX_JUMPS = 2;
const COYOTE_SECONDS = 0.08;
const JUMP_BUFFER_SECONDS = 0.12;
const DUCK_SECONDS = 0.55;
const PIT_RESCUE_DEPTH = 3;
const SWIPE_THRESHOLD = 6;
const TITLE_SPEED = 40;
const START_SPEED = 82;
const MAX_SPEED = 210;
const ACCELERATION = 2.2;
const FLYER_EXTRA_SPEED = 22;
const FLYER_CLEARANCE = 8;
const FLYER_WIDTH = 7;
const FLYER_HEIGHT = 4;
const PIXELS_PER_POINT = 6;
const MILESTONE_POINTS = 100;
const GAP_BASE = 26;
const GAP_SPEED_FACTOR = 0.62;
const GAP_RANDOM_FACTOR = 0.75;
const JUMP_AIRTIME_SECONDS = (2 * JUMP_SPEED) / GRAVITY;
const PIT_AIRTIME_FACTOR = JUMP_AIRTIME_SECONDS * 0.6;
const SPAWN_MARGIN = 24;
const STEP_LENGTH = 6;
const HILL_PARALLAX = 0.25;
const STAR_PARALLAX = 0.05;
const STAR_COUNT = 18;
const GAME_OVER_INPUT_DELAY_SECONDS = 0.7;
const EXIT_FALLBACK_MS = 700;
const LOW_QUALITY_FRAME_SECONDS = 1 / 40;
const PERFORMANCE_SAMPLE_FRAMES = 180;
const PAUSE_MENU_TOP = 46;
const PAUSE_ITEM_SPACING = 12;
const PAUSE_ITEMS = [
  { id: "continue", label: "CONTINUE" },
  { id: "restart", label: "RESTART" },
  { id: "settings", label: "SETTINGS" },
  { id: "exit", label: "EXIT" },
];
const BACK_ITEM = { id: "back", label: "BACK" };
const CONTROLLABLE_STATES = new Set(["title", "play", "falling"]);
const JUMP_KEYS = new Set(["Space", "Enter", "ArrowUp", "KeyW"]);
const DUCK_KEYS = ["ArrowDown", "KeyS"];
const COLORS = {
  bright: "#ffffff",
  ground: "#b0b0b0",
  score: "#d8d8d8",
  dim: "#808080",
  crateInner: "#606060",
  faint: "#505050",
  hillLine: "#404040",
  hillFill: "#161616",
  black: "#000000",
  veil: "rgba(0, 0, 0, 0.78)",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const randomInt = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
const toCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const padScore = (value) => String(value).padStart(5, "0");

function hashColumn(column) {
  let hash = Math.imul(column, 374761393);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function hillHeight(column) {
  return 9 + 5 * Math.sin(column * 0.045) + 3 * Math.sin(column * 0.11 + 2);
}

function sanitizeRecords(raw) {
  return {
    best: toCount(raw.best),
    runs: toCount(raw.runs),
  };
}

function showSystemMessage(text) {
  const message = document.createElement("p");
  message.className = "system-message glow";
  message.textContent = text;
  document.body.append(message);
}

function createSounds(audio) {
  return {
    jump: () => audio.tone({ frequency: 360, slideTo: 720, duration: 0.09, volume: 0.1 }),
    doubleJump: () => audio.tone({ frequency: 540, slideTo: 1080, duration: 0.08, volume: 0.1 }),
    duck: () => audio.noise({ duration: 0.06, volume: 0.06, highpass: 2000 }),
    milestone: () => [880, 1320].forEach((frequency, index) => audio.tone({ frequency, duration: 0.07, volume: 0.09, delay: index * 0.08 })),
    crash: () => {
      audio.noise({ duration: 0.4, volume: 0.2, highpass: 300 });
      audio.tone({ frequency: 200, slideTo: 60, duration: 0.35, volume: 0.12 });
    },
    fall: () => audio.tone({ frequency: 600, slideTo: 80, duration: 0.6, volume: 0.12 }),
    record: () => [523, 659, 784, 1047].forEach((frequency, index) => audio.tone({ frequency, duration: 0.12, delay: 0.4 + index * 0.1 })),
    select: () => audio.tone({ frequency: 880, duration: 0.04, volume: 0.08 }),
    pause: () => audio.noise({ duration: 0.12, volume: 0.08, highpass: 1500 }),
  };
}

function createStars() {
  return Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * WIDTH,
    y: randomInt(12, GROUND_Y - 30),
    color: Math.random() < 0.3 ? "#707070" : "#404040",
  }));
}

function startGame() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
  const portraitQuery = window.matchMedia("(orientation: portrait) and (pointer: coarse)");
  const isStandalone = window.matchMedia("(display-mode: fullscreen), (display-mode: standalone)").matches || navigator.standalone === true;
  const homeUrl = document.body.dataset.home || "/";

  const buffer = createBuffer(WIDTH, HEIGHT);
  const crt = createCrt(document.getElementById("screen"), buffer, { reducedMotion: prefersReducedMotion });
  const display = createDisplay(crt.canvas, WIDTH, HEIGHT);
  const glitch = createGlitch({ width: WIDTH, height: HEIGHT, reducedMotion: prefersReducedMotion });
  const particles = createParticles(256);
  const audio = createAudio();
  const sounds = createSounds(audio);
  const settings = createSettings();
  const recordsStore = createStore("runner", 1, { best: 0, runs: 0 });
  let records = sanitizeRecords(recordsStore.load());

  const stars = createStars();
  const player = {
    feetY: GROUND_Y,
    vy: 0,
    isGrounded: true,
    isDucking: false,
    jumpsUsed: 0,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
    duckTimer: 0,
  };
  const playerHitbox = { x: 0, y: 0, w: 0, h: 0 };
  const obstacleHitbox = { x: 0, y: 0, w: 0, h: 0 };
  const swipe = { accumulated: 0, hasJumped: false };
  const game = {
    state: "title",
    resumeState: "title",
    stateTime: 0,
    time: 0,
    isReady: false,
    isExiting: false,
    hasRequestedImmersive: false,
    distance: 0,
    runStartDistance: 0,
    speed: START_SPEED,
    runTime: 0,
    obstacles: [],
    nextSpawnX: 0,
    nextMilestone: MILESTONE_POINTS,
    isNewRecord: false,
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

  function currentScore() {
    return Math.floor((game.distance - game.runStartDistance) / PIXELS_PER_POINT);
  }

  function resetPlayer() {
    player.feetY = GROUND_Y;
    player.vy = 0;
    player.isGrounded = true;
    player.isDucking = false;
    player.jumpsUsed = 0;
    player.coyoteTimer = 0;
    player.jumpBufferTimer = 0;
    player.duckTimer = 0;
  }

  function startRun() {
    resetPlayer();
    particles.clear();
    game.runStartDistance = game.distance;
    game.speed = START_SPEED;
    game.runTime = 0;
    game.obstacles = [];
    game.nextSpawnX = game.distance + WIDTH + SPAWN_MARGIN * 2;
    game.nextMilestone = MILESTONE_POINTS;
    game.isNewRecord = false;
    setState("play");
  }

  function screenX(obstacle) {
    return Math.round(obstacle.x - game.distance);
  }

  function chooseObstacleKind() {
    const score = currentScore();
    const options = [
      { kind: "block", weight: 5 },
      { kind: "cluster", weight: score >= 60 ? 2 : 0 },
      { kind: "pit", weight: score >= 40 ? 3 : 0 },
      { kind: "flyer", weight: score >= 150 ? 2.5 : 0 },
    ];
    const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const option of options) {
      roll -= option.weight;
      if (roll < 0) {
        return option.kind;
      }
    }
    return "block";
  }

  function addBlock(x, width, height) {
    game.obstacles.push({ kind: "block", x, y: GROUND_Y - height, w: width, h: height });
    return width;
  }

  function spawnBlock(x) {
    const isTall = Math.random() < 0.5;
    return isTall ? addBlock(x, randomInt(4, 5), randomInt(9, 13)) : addBlock(x, randomInt(5, 7), randomInt(5, 7));
  }

  function spawnCluster(x) {
    const count = randomInt(2, 3);
    let width = 0;
    for (let index = 0; index < count; index++) {
      width += addBlock(x + width, 5, randomInt(5, 8)) + 1;
    }
    return width - 1;
  }

  function spawnPit(x) {
    const maxWidth = Math.max(16, Math.floor(game.speed * PIT_AIRTIME_FACTOR));
    const width = randomInt(14, Math.min(42, maxWidth));
    game.obstacles.push({ kind: "pit", x, y: GROUND_Y, w: width, h: HEIGHT - GROUND_Y });
    return width;
  }

  function spawnFlyer(x) {
    const lead = (FLYER_EXTRA_SPEED / game.speed) * WIDTH;
    game.obstacles.push({ kind: "flyer", x: x + lead, y: GROUND_Y - FLYER_CLEARANCE - FLYER_HEIGHT, w: FLYER_WIDTH, h: FLYER_HEIGHT });
    return FLYER_WIDTH + lead;
  }

  const SPAWNERS = { block: spawnBlock, cluster: spawnCluster, pit: spawnPit, flyer: spawnFlyer };

  function spawnObstacles() {
    while (game.nextSpawnX < game.distance + WIDTH + SPAWN_MARGIN) {
      const width = SPAWNERS[chooseObstacleKind()](game.nextSpawnX);
      const gap = GAP_BASE + game.speed * GAP_SPEED_FACTOR + Math.random() * game.speed * GAP_RANDOM_FACTOR;
      game.nextSpawnX += width + gap;
    }
  }

  function updateObstacles(deltaSeconds) {
    for (const obstacle of game.obstacles) {
      if (obstacle.kind === "flyer") {
        obstacle.x -= FLYER_EXTRA_SPEED * deltaSeconds;
      }
    }
    game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.w > game.distance - SPAWN_MARGIN);
    spawnObstacles();
  }

  function isOverPit() {
    const footLeft = PLAYER_X + FOOT_INSET;
    const footRight = PLAYER_X + BODY_WIDTH - FOOT_INSET;
    return game.obstacles.some((obstacle) => {
      if (obstacle.kind !== "pit") {
        return false;
      }
      const left = obstacle.x - game.distance;
      return left <= footLeft && left + obstacle.w >= footRight;
    });
  }

  function emitDust(count) {
    particles.emit(PLAYER_X + 2, GROUND_Y - 1, {
      count,
      angle: Math.PI,
      spread: 1.2,
      speed: [10, 35],
      lifetime: [0.15, 0.35],
      sizes: [1],
      fall: -20,
    });
  }

  function tryJump() {
    if (player.isGrounded || player.coyoteTimer > 0) {
      player.vy = -JUMP_SPEED;
      player.jumpsUsed = 1;
      sounds.jump();
      emitDust(4);
    } else if (player.jumpsUsed < MAX_JUMPS) {
      player.vy = -DOUBLE_JUMP_SPEED;
      player.jumpsUsed = MAX_JUMPS;
      sounds.doubleJump();
      particles.emit(PLAYER_X + BODY_WIDTH / 2, player.feetY, { count: 5, angle: Math.PI / 2, spread: 1.6, speed: [15, 40], lifetime: [0.12, 0.3], sizes: [1] });
    } else {
      return false;
    }
    player.isGrounded = false;
    player.isDucking = false;
    player.coyoteTimer = 0;
    player.duckTimer = 0;
    return true;
  }

  function queueJump() {
    player.jumpBufferTimer = JUMP_BUFFER_SECONDS;
  }

  function startDuck() {
    if (player.duckTimer <= 0) {
      sounds.duck();
    }
    player.duckTimer = DUCK_SECONDS;
    player.jumpBufferTimer = 0;
  }

  function land() {
    player.feetY = GROUND_Y;
    player.vy = 0;
    player.isGrounded = true;
    player.jumpsUsed = 0;
    emitDust(3);
  }

  function updatePlayer(deltaSeconds) {
    player.jumpBufferTimer -= deltaSeconds;
    player.coyoteTimer -= deltaSeconds;
    player.duckTimer -= deltaSeconds;
    const wantsDuck = player.duckTimer > 0 || input.isKeyDown(...DUCK_KEYS);
    if (player.isGrounded && isOverPit()) {
      player.isGrounded = false;
      player.coyoteTimer = COYOTE_SECONDS;
    }
    if (player.jumpBufferTimer > 0 && tryJump()) {
      player.jumpBufferTimer = 0;
    }
    if (!player.isGrounded) {
      const gravity = wantsDuck ? GRAVITY * FAST_FALL_MULTIPLIER : GRAVITY;
      const previousFeetY = player.feetY;
      player.vy = Math.min(player.vy + gravity * deltaSeconds, MAX_FALL_SPEED);
      player.feetY += player.vy * deltaSeconds;
      const isOverHole = isOverPit();
      if (player.vy >= 0 && player.feetY >= GROUND_Y && previousFeetY <= GROUND_Y + PIT_RESCUE_DEPTH && !isOverHole) {
        land();
      } else if (player.feetY > GROUND_Y + PIT_RESCUE_DEPTH) {
        startFalling();
        return;
      }
    }
    player.isDucking = player.isGrounded && wantsDuck;
  }

  function updatePlayerHitbox() {
    const width = player.isDucking ? DUCK_WIDTH : BODY_WIDTH;
    const height = player.isDucking ? DUCK_HEIGHT : STAND_HEIGHT;
    playerHitbox.x = (player.isDucking ? PLAYER_X - 1 : PLAYER_X) + 1;
    playerHitbox.y = player.feetY - height + 1;
    playerHitbox.w = width - 2;
    playerHitbox.h = height - 1;
  }

  function hitsObstacle() {
    updatePlayerHitbox();
    return game.obstacles.some((obstacle) => {
      if (obstacle.kind === "pit") {
        return false;
      }
      const inset = obstacle.kind === "flyer" ? 1 : 0;
      obstacleHitbox.x = obstacle.x - game.distance + inset;
      obstacleHitbox.y = obstacle.y + inset;
      obstacleHitbox.w = obstacle.w - inset * 2;
      obstacleHitbox.h = obstacle.h - inset * 2;
      return overlaps(playerHitbox, obstacleHitbox);
    });
  }

  function finishRun() {
    const score = currentScore();
    records.runs += 1;
    game.isNewRecord = score > records.best;
    if (game.isNewRecord) {
      records.best = score;
      sounds.record();
    }
    recordsStore.save(records);
    setState("over");
  }

  function crash() {
    player.isDucking = false;
    particles.emit(PLAYER_X + BODY_WIDTH / 2, player.feetY - STAND_HEIGHT / 2, {
      count: 50,
      spread: Math.PI * 2,
      speed: [25, 110],
      lifetime: [0.4, 1.1],
      sizes: [1, 2, 2],
      fall: 90,
    });
    glitch.trigger("goal");
    sounds.crash();
    finishRun();
  }

  function startFalling() {
    player.isDucking = false;
    sounds.fall();
    glitch.trigger("hit");
    setState("falling");
  }

  function updateFalling(deltaSeconds) {
    player.vy = Math.min(player.vy + GRAVITY * deltaSeconds, MAX_FALL_SPEED);
    player.feetY += player.vy * deltaSeconds;
    if (player.feetY - STAND_HEIGHT > HEIGHT) {
      glitch.trigger("goal");
      finishRun();
    }
  }

  function checkMilestone() {
    if (currentScore() >= game.nextMilestone) {
      game.nextMilestone += MILESTONE_POINTS;
      sounds.milestone();
      glitch.trigger("tear");
    }
  }

  function updatePlay(deltaSeconds) {
    game.runTime += deltaSeconds;
    game.speed = Math.min(MAX_SPEED, START_SPEED + ACCELERATION * game.runTime);
    game.distance += game.speed * deltaSeconds;
    updateObstacles(deltaSeconds);
    updatePlayer(deltaSeconds);
    if (game.state !== "play") {
      return;
    }
    if (hitsObstacle()) {
      crash();
      return;
    }
    checkMilestone();
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

  function handleAction(point) {
    if (!game.isReady || game.isExiting) {
      return;
    }
    if (game.state === "title") {
      startRun();
    } else if (game.state === "play") {
      queueJump();
    } else if (game.state === "paused") {
      const index = point ? pauseItemAt(point) : game.pauseIndex;
      if (index >= 0) {
        game.pauseIndex = index;
        activatePauseItem(index);
      }
    } else if (game.state === "over" && game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS) {
      startRun();
    }
  }

  function handlePausedKey(code) {
    if (code === "Space" || code === "Enter") {
      handleAction(null);
    } else if (code === "Escape" && game.pauseView === "settings") {
      sounds.select();
      openPauseView("main");
    } else if (code === "Escape" || code === "KeyP") {
      resume();
    } else if (code === "ArrowUp" || code === "KeyW") {
      movePauseSelection(-1);
    } else if (code === "ArrowDown" || code === "KeyS") {
      movePauseSelection(1);
    } else if (game.pauseView === "settings" && (code === "ArrowLeft" || code === "KeyA")) {
      activatePauseItem(game.pauseIndex, -1);
    } else if (game.pauseView === "settings" && (code === "ArrowRight" || code === "KeyD")) {
      activatePauseItem(game.pauseIndex, 1);
    }
  }

  function handleKey(code) {
    if (game.state === "paused") {
      handlePausedKey(code);
    } else if (JUMP_KEYS.has(code)) {
      handleAction(null);
    } else if (DUCK_KEYS.includes(code) && game.state === "play") {
      startDuck();
    } else if (code === "Escape" || code === "KeyP") {
      pause();
    }
  }

  function handleDrag(deltaY) {
    if (game.state !== "play") {
      return;
    }
    swipe.accumulated += deltaY * display.cssToBufferScale();
    if (swipe.accumulated > SWIPE_THRESHOLD) {
      swipe.accumulated = 0;
      startDuck();
    } else if (swipe.accumulated < -SWIPE_THRESHOLD && !swipe.hasJumped) {
      swipe.accumulated = 0;
      swipe.hasJumped = true;
      queueJump();
    }
  }

  function resetSwipe() {
    swipe.accumulated = 0;
    swipe.hasJumped = false;
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
    root
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => window.screen.orientation?.lock?.("landscape"))
      .catch((error) => console.info("Fullscreen or orientation lock is unavailable", error));
  }

  const input = createInput(document.querySelector(".game-stage"), {
    onInteraction: () => {
      audio.unlock();
      resetSwipe();
    },
    onDrag: (deltaX, deltaY) => handleDrag(deltaY),
    onTap: (clientX, clientY) => {
      requestImmersive();
      handleAction(display.clientToBuffer(clientX, clientY));
    },
    onLongPress: togglePause,
    onEdgeSwipe: exitToMenu,
    onKey: handleKey,
  });

  function update(deltaSeconds) {
    game.time += deltaSeconds;
    glitch.update(deltaSeconds);
    if (game.state === "paused") {
      return;
    }
    game.stateTime += deltaSeconds;
    particles.update(deltaSeconds);
    if (game.state === "title") {
      game.distance += TITLE_SPEED * deltaSeconds;
    } else if (game.state === "play") {
      updatePlay(deltaSeconds);
    } else if (game.state === "falling") {
      updateFalling(deltaSeconds);
    }
  }

  function isBlinkOn() {
    return Math.floor(game.time * 2.5) % 2 === 0;
  }

  function drawCenteredText(text, y, options) {
    drawText(buffer.context, text, WIDTH / 2, y, { align: "center", ...options });
  }

  function drawStars() {
    for (const star of stars) {
      const x = (((star.x - game.distance * STAR_PARALLAX) % WIDTH) + WIDTH) % WIDTH;
      buffer.rect(x, star.y, 1, 1, star.color);
    }
  }

  function drawHills() {
    const offset = Math.round(game.distance * HILL_PARALLAX);
    for (let x = 0; x < WIDTH; x++) {
      const top = Math.round(GROUND_Y - hillHeight(x + offset));
      buffer.rect(x, top + 1, 1, GROUND_Y - top - 1, COLORS.hillFill);
      buffer.rect(x, top, 1, 1, COLORS.hillLine);
    }
  }

  function drawPebbles() {
    const offset = Math.round(game.distance);
    for (let x = 0; x < WIDTH; x++) {
      const hash = hashColumn(x + offset);
      if (hash % 9 === 0) {
        buffer.rect(x, GROUND_Y + 3 + ((hash >>> 8) % 15), (hash >>> 4) % 4 === 0 ? 2 : 1, 1, COLORS.faint);
      }
    }
  }

  function visiblePits() {
    return game.obstacles.filter((obstacle) => obstacle.kind === "pit" && screenX(obstacle) < WIDTH && screenX(obstacle) + obstacle.w > 0);
  }

  function drawGround() {
    drawPebbles();
    let segmentStart = 0;
    for (const pit of visiblePits()) {
      const left = screenX(pit);
      buffer.rect(left, GROUND_Y, pit.w, HEIGHT - GROUND_Y, COLORS.black);
      buffer.rect(left, GROUND_Y + 1, 1, HEIGHT - GROUND_Y, COLORS.faint);
      buffer.rect(left + pit.w - 1, GROUND_Y + 1, 1, HEIGHT - GROUND_Y, COLORS.faint);
      buffer.rect(segmentStart, GROUND_Y, left - segmentStart, 1, COLORS.ground);
      segmentStart = left + pit.w;
    }
    buffer.rect(segmentStart, GROUND_Y, WIDTH - segmentStart, 1, COLORS.ground);
  }

  function drawBlock(obstacle) {
    const x = screenX(obstacle);
    const isPillar = obstacle.h >= 9;
    if (isPillar) {
      buffer.rect(x, obstacle.y + 1, obstacle.w, obstacle.h - 1, COLORS.bright);
      buffer.rect(x - 1, obstacle.y, obstacle.w + 2, 2, COLORS.bright);
      buffer.rect(x + 1, obstacle.y + 3, 1, obstacle.h - 4, COLORS.crateInner);
      return;
    }
    buffer.rect(x, obstacle.y, obstacle.w, obstacle.h, COLORS.bright);
    buffer.rect(x + 1, obstacle.y + 1, obstacle.w - 2, obstacle.h - 2, COLORS.crateInner);
  }

  function drawFlyer(obstacle) {
    const x = screenX(obstacle);
    const isWingUp = Math.floor(game.time * 8) % 2 === 0;
    buffer.rect(x + 1, obstacle.y + 1, obstacle.w - 1, 2, COLORS.bright);
    buffer.rect(x, obstacle.y + 1, 1, 1, COLORS.dim);
    buffer.rect(x + 2, obstacle.y + 1, 1, 1, COLORS.black);
    buffer.rect(x + 3, isWingUp ? obstacle.y : obstacle.y + 3, 3, 1, COLORS.bright);
  }

  function drawObstacles() {
    for (const obstacle of game.obstacles) {
      if (obstacle.kind === "block") {
        drawBlock(obstacle);
      } else if (obstacle.kind === "flyer") {
        drawFlyer(obstacle);
      }
    }
  }

  function drawEyes(x, y) {
    const scene = sceneState();
    const isDead = scene === "over" || scene === "falling";
    const isBlinking = game.time % 3.2 < 0.12;
    const eyeHeight = isDead || isBlinking ? 1 : 2;
    const eyeY = isDead || isBlinking ? y + 1 : y;
    buffer.rect(x, eyeY, isDead ? 2 : 1, eyeHeight, COLORS.black);
    buffer.rect(x + 3, eyeY, isDead ? 2 : 1, eyeHeight, COLORS.black);
  }

  function drawLegs(feetY) {
    const scene = sceneState();
    const isRunning = player.isGrounded && (scene === "play" || scene === "title");
    const step = Math.floor(game.distance / STEP_LENGTH) % 2;
    const legTop = feetY - LEG_HEIGHT;
    const leftLift = !player.isGrounded || (isRunning && step === 0) ? 1 : 0;
    const rightLift = !player.isGrounded || (isRunning && step === 1) ? 1 : 0;
    buffer.rect(PLAYER_X + 1, legTop, 2, LEG_HEIGHT - leftLift, COLORS.bright);
    buffer.rect(PLAYER_X + 5, legTop, 2, LEG_HEIGHT - rightLift, COLORS.bright);
  }

  function drawStandingPlayer(feetY) {
    const bodyTop = feetY - STAND_HEIGHT;
    buffer.rect(PLAYER_X, bodyTop, BODY_WIDTH, BODY_HEIGHT, COLORS.bright);
    drawEyes(PLAYER_X + 3, bodyTop + 2);
    drawLegs(feetY);
  }

  function drawDuckingPlayer(feetY) {
    const bodyTop = feetY - DUCK_HEIGHT;
    buffer.rect(PLAYER_X - 1, bodyTop, DUCK_WIDTH, DUCK_BODY_HEIGHT, COLORS.bright);
    drawEyes(PLAYER_X + 4, bodyTop + 1);
    buffer.rect(PLAYER_X, feetY - 1, 2, 1, COLORS.bright);
    buffer.rect(PLAYER_X + 5, feetY - 1, 2, 1, COLORS.bright);
  }

  function drawPlayer() {
    const feetY = Math.round(player.feetY);
    if (player.isDucking) {
      drawDuckingPlayer(feetY);
    } else {
      drawStandingPlayer(feetY);
    }
  }

  function drawHud() {
    const text = records.best > 0 ? `HI ${padScore(records.best)}  ${padScore(currentScore())}` : padScore(currentScore());
    drawText(buffer.context, text, WIDTH - 4, 4, { color: COLORS.score, align: "right" });
  }

  function drawVeil() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.veil);
  }

  function drawTitle() {
    drawVeil();
    drawCenteredText("RUNNER", 12, { scale: 4, color: COLORS.bright });
    if (isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO START" : "PRESS SPACE TO START", 44, { color: COLORS.bright });
    }
    drawCenteredText(isTouchDevice ? "TAP: JUMP   TAP AGAIN: DOUBLE" : "SPACE: JUMP   AGAIN: DOUBLE", 58, { color: COLORS.dim });
    drawCenteredText(isTouchDevice ? "SWIPE DOWN: DUCK   HOLD: PAUSE" : "DOWN: DUCK   ESC: PAUSE", 66, { color: COLORS.dim });
    drawCenteredText("SWIPE FROM LEFT EDGE: EXIT", 74, { color: COLORS.faint });
    drawCenteredText(`BEST ${records.best}   RUNS ${records.runs}`, 96, { color: COLORS.dim });
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
    drawCenteredText(`BEST ${records.best}   RUNS ${records.runs}`, 98, { color: COLORS.faint });
  }

  function drawGameOver() {
    drawVeil();
    drawCenteredText("GAME OVER", 14, { scale: 3, color: COLORS.bright });
    drawCenteredText(String(currentScore()), 38, { scale: 2, color: COLORS.score });
    if (game.isNewRecord && isBlinkOn()) {
      drawCenteredText("NEW RECORD!", 54, { color: COLORS.bright });
    }
    drawCenteredText(`BEST ${records.best}   RUNS ${records.runs}`, 66, { color: COLORS.dim });
    if (game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS && isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO RUN AGAIN" : "SPACE TO RUN AGAIN", 88, { color: COLORS.bright });
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
    buffer.clear(COLORS.black);
    drawStars();
    drawHills();
    drawGround();
    drawObstacles();
    drawPlayer();
    particles.draw(buffer.context);
    if (scene !== "title") {
      drawHud();
    }
    if (game.state === "paused") {
      drawPauseMenu();
    } else if (scene === "title") {
      drawTitle();
    } else if (scene === "over") {
      drawGameOver();
    }
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

  portraitQuery.addEventListener("change", (event) => {
    if (event.matches) {
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
      console.error("Runner crashed", error);
      showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
    },
  });

  loop.start();
  powerOn();
}

try {
  startGame();
} catch (error) {
  console.error("Unable to start Runner", error);
  showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
}
