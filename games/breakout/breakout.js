import { createLoop } from "../../assets/js/engine/loop.js";
import { createBuffer, createDisplay } from "../../assets/js/engine/screen.js";
import { createCrt } from "../../assets/js/engine/crt.js";
import { createGlitch } from "../../assets/js/engine/glitch.js";
import { createInput } from "../../assets/js/engine/input.js";
import { createMenuButton } from "../../assets/js/engine/menubutton.js";
import { overlaps, sweptAabb } from "../../assets/js/engine/collision.js";
import { createParticles } from "../../assets/js/engine/particles.js";
import { createAudio } from "../../assets/js/engine/audio.js";
import { createStore } from "../../assets/js/engine/storage.js";
import { createSettings, readPalette } from "../../assets/js/engine/settings.js";
import { drawText, measureText } from "../../assets/js/engine/pixelfont.js";

const WIDTH = 108;
const HEIGHT = 192;
const WALL_Y = 12;
const FIELD_TOP = WALL_Y + 1;
const FIELD_LEFT = 1;
const FIELD_RIGHT = WIDTH - 1;
const BRICK_COLUMNS = 9;
const BRICK_WIDTH = 10;
const BRICK_HEIGHT = 4;
const BRICK_STRIDE_X = BRICK_WIDTH + 1;
const BRICK_STRIDE_Y = BRICK_HEIGHT + 1;
const BRICKS_LEFT = FIELD_LEFT + Math.floor((FIELD_RIGHT - FIELD_LEFT - (BRICK_COLUMNS * BRICK_STRIDE_X - 1)) / 2);
const BRICKS_TOP = 26;
const MAX_BRICK_HP = 3;
const PADDLE_Y = 158;
const PADDLE_HEIGHT = 3;
const PADDLE_WIDTH = 16;
const WIDE_PADDLE_WIDTH = 24;
const BALL_SIZE = 2;
const BASE_SPEED = 85;
const MAX_SPEED = 165;
const SPEED_LIMIT = 230;
const ROUND_SPEEDUP = 0.12;
const SPEEDUP_PER_BRICK = 1.012;
const SLOW_FACTOR = 0.75;
const MAX_BOUNCE_ANGLE = Math.PI / 3;
const MIN_VERTICAL_RATIO = 0.3;
const STARTING_LIVES = 3;
const MAX_BALLS = 3;
const MULTI_BALL_SPREAD = 0.4;
const CAPSULE_WIDTH = 9;
const CAPSULE_HEIGHT = 7;
const CAPSULE_SPEED = 32;
const DROP_CHANCE = 0.14;
const LASER_SPEED = 200;
const LASER_HEIGHT = 4;
const LASER_COOLDOWN_SECONDS = 0.3;
const POWER_UP_SCORE = 50;
const BRICK_SCORE = 10;
const LEVEL_CLEAR_SCORE = 100;
const KEYBOARD_PADDLE_SPEED = 140;
const DRAG_SENSITIVITY = 1.15;
const LOST_PAUSE_SECONDS = 1.2;
const CLEAR_PAUSE_SECONDS = 1.6;
const GAME_OVER_INPUT_DELAY_SECONDS = 1;
const EXIT_FALLBACK_MS = 700;
const MAX_COLLISIONS_PER_STEP = 4;
const LOW_QUALITY_FRAME_SECONDS = 1 / 40;
const PERFORMANCE_SAMPLE_FRAMES = 180;
const PAUSE_MENU_TOP = 72;
const PAUSE_ITEM_SPACING = 12;
const PAUSE_ITEMS = [
  { id: "continue", label: "CONTINUE" },
  { id: "restart", label: "RESTART" },
  { id: "settings", label: "SETTINGS" },
  { id: "exit", label: "EXIT" },
];
const BACK_ITEM = { id: "back", label: "BACK" };
const CONTROLLABLE_STATES = new Set(["title", "serve", "play", "lost", "clear"]);
const POWER_UPS = [
  { id: "expand", letter: "E" },
  { id: "laser", letter: "L" },
  { id: "multi", letter: "M" },
  { id: "slow", letter: "S" },
];
const LEVELS = [
  ["222222222", "111111111", "111111111", "111111111", "111111111"],
  ["....1....", "...121...", "..12221..", ".1223221.", "122333221", "111111111"],
  ["1.1.1.1.1", ".2.2.2.2.", "1.1.1.1.1", ".2.2.2.2.", "1.1.1.1.1", ".2.2.2.2."],
  ["222222222", "1#11111#1", "1#12221#1", "1#12321#1", "1#12221#1", "1#11111#1", ".........", "##.....##"],
  ["....3....", "...323...", "..32123..", ".3211123.", "321111123", ".3211123.", "..32123..", "...323...", "....3...."],
  ["3.3.3.3.3", "2.2.2.2.2", "2.2.2.2.2", "1.1.1.1.1", "1.1.1.1.1", "1.1.1.1.1", "#.#.#.#.#"],
  ["..1...1..", "...1.1...", "..22222..", ".22.2.22.", "233333332", "2.22222.2", "2.2...2.2", "...2.2..."],
  ["333333333", "322222223", "321111123", "321###123", "321111123", "322222223", "333333333", "##.###.##"],
];
const BRICK_SHADES = ["#000000", "#909090", "#c8c8c8", "#ffffff"];
const COLORS = {
  bright: "#ffffff",
  score: "#d8d8d8",
  dim: "#808080",
  faint: "#505050",
  veil: "rgba(0, 0, 0, 0.78)",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const toCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const randomSign = () => (Math.random() < 0.5 ? -1 : 1);

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
    launch: () => audio.tone({ frequency: 330, duration: 0.05, volume: 0.1 }),
    paddle: () => audio.tone({ frequency: 440, duration: 0.06 }),
    wall: () => audio.tone({ frequency: 220, duration: 0.05, volume: 0.1 }),
    brick: (row) => audio.tone({ frequency: 760 - row * 40, duration: 0.05, volume: 0.12 }),
    solid: () => audio.tone({ frequency: 140, duration: 0.06, volume: 0.12 }),
    laser: () => audio.tone({ frequency: 1200, slideTo: 600, duration: 0.05, volume: 0.06 }),
    powerUp: () => arpeggio([523, 784, 1047], 0.06, 0.07),
    lifeLost: () => {
      audio.noise({ duration: 0.35, volume: 0.18, highpass: 400 });
      audio.tone({ frequency: 300, slideTo: 80, duration: 0.4, volume: 0.12 });
    },
    levelClear: () => arpeggio([523, 659, 784, 1047], 0.1, 0.12),
    newBest: () => arpeggio([523, 659, 784, 1047, 1319], 0.12, 0.14),
    gameOver: () => arpeggio([392, 330, 262, 196], 0.16, 0.18),
    select: () => audio.tone({ frequency: 880, duration: 0.04, volume: 0.08 }),
    pause: () => audio.noise({ duration: 0.12, volume: 0.08, highpass: 1500 }),
  };
}

function buildBricks(layout, round) {
  const hpBonus = round - 1;
  return layout.flatMap((rowPattern, row) =>
    Array.from(rowPattern).flatMap((cell, column) => {
      if (cell === ".") {
        return [];
      }
      const isSolid = cell === "#";
      const hp = isSolid ? 0 : Math.min(Number(cell) + hpBonus, MAX_BRICK_HP);
      return [{ x: BRICKS_LEFT + column * BRICK_STRIDE_X, y: BRICKS_TOP + row * BRICK_STRIDE_Y, w: BRICK_WIDTH, h: BRICK_HEIGHT, row, hp, maxHp: hp, isSolid, isAlive: true }];
    }),
  );
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
  const particles = createParticles(320);
  const audio = createAudio();
  const sounds = createSounds(audio);
  const settings = createSettings();
  const recordsStore = createStore("breakout", 1, { best: 0 });
  let records = sanitizeRecords(recordsStore.load());

  const paddle = { x: 0, y: PADDLE_Y, w: PADDLE_WIDTH, h: PADDLE_HEIGHT, mode: "normal" };
  const walls = [
    { x: -WIDTH, y: -HEIGHT, w: WIDTH * 3, h: HEIGHT + FIELD_TOP },
    { x: -WIDTH, y: -HEIGHT, w: WIDTH + FIELD_LEFT, h: HEIGHT * 3 },
    { x: FIELD_RIGHT, y: -HEIGHT, w: WIDTH, h: HEIGHT * 3 },
  ];
  const game = {
    state: "title",
    resumeState: "title",
    stateTime: 0,
    time: 0,
    isReady: false,
    isExiting: false,
    hasRequestedImmersive: false,
    score: 0,
    lives: STARTING_LIVES,
    levelIndex: 0,
    round: 1,
    bricks: buildBricks(LEVELS[0], 1),
    bricksLeft: 0,
    balls: [],
    lasers: [],
    capsule: null,
    laserCooldown: 0,
    lastBonus: 0,
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

  function baseSpeed() {
    return BASE_SPEED * (1 + ROUND_SPEEDUP * (game.round - 1));
  }

  function maxSpeed() {
    return Math.min(MAX_SPEED * (1 + ROUND_SPEEDUP * (game.round - 1)), SPEED_LIMIT);
  }

  function clampPaddleX(x) {
    return clamp(x, FIELD_LEFT, FIELD_RIGHT - paddle.w);
  }

  function centerPaddle() {
    paddle.x = clampPaddleX(WIDTH / 2 - paddle.w / 2);
  }

  function setPaddleMode(mode) {
    const centerX = paddle.x + paddle.w / 2;
    paddle.mode = mode;
    paddle.w = mode === "wide" ? WIDE_PADDLE_WIDTH : PADDLE_WIDTH;
    paddle.x = clampPaddleX(centerX - paddle.w / 2);
  }

  function clearFlyingObjects() {
    game.balls = [];
    game.lasers = [];
    game.capsule = null;
  }

  function loadLevel() {
    game.bricks = buildBricks(LEVELS[game.levelIndex], game.round);
    game.bricksLeft = game.bricks.filter((brick) => !brick.isSolid).length;
    clearFlyingObjects();
    setPaddleMode("normal");
    centerPaddle();
    setState("serve");
  }

  function startRun() {
    game.score = 0;
    game.lives = STARTING_LIVES;
    game.levelIndex = 0;
    game.round = 1;
    game.isNewBest = false;
    particles.clear();
    loadLevel();
  }

  function setBallDirection(ball, angleFromVertical) {
    ball.vx = ball.speed * Math.sin(angleFromVertical);
    ball.vy = -ball.speed * Math.cos(angleFromVertical);
  }

  function setBallSpeed(ball, speed) {
    const scale = speed / Math.hypot(ball.vx, ball.vy);
    ball.speed = speed;
    ball.vx *= scale;
    ball.vy *= scale;
  }

  function keepBallSteep(ball) {
    const minVertical = ball.speed * MIN_VERTICAL_RATIO;
    if (Math.abs(ball.vy) >= minVertical) {
      return;
    }
    ball.vy = (Math.sign(ball.vy) || -1) * minVertical;
    ball.vx = (Math.sign(ball.vx) || 1) * Math.sqrt(ball.speed ** 2 - minVertical ** 2);
  }

  function servingBall() {
    return { x: paddle.x + paddle.w / 2 - BALL_SIZE / 2, y: paddle.y - BALL_SIZE, w: BALL_SIZE, h: BALL_SIZE, vx: 0, vy: 0, speed: 0 };
  }

  function launchBall() {
    const ball = servingBall();
    ball.speed = baseSpeed();
    setBallDirection(ball, (0.2 + Math.random() * 0.3) * randomSign());
    game.balls = [ball];
    sounds.launch();
    setState("play");
  }

  function deflectFromPaddle(ball) {
    const offset = clamp((ball.x + ball.w / 2 - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
    const jitter = (Math.random() - 0.5) * 0.05;
    setBallDirection(ball, clamp(offset * MAX_BOUNCE_ANGLE + jitter, -MAX_BOUNCE_ANGLE, MAX_BOUNCE_ANGLE));
    ball.y = paddle.y - ball.h - 0.01;
    glitch.trigger("hit");
    sounds.paddle();
    particles.emit(ball.x + ball.w / 2, paddle.y, { count: 5, angle: -Math.PI / 2, spread: 1.6, speed: [20, 50], lifetime: [0.1, 0.25], sizes: [1] });
  }

  function emitBrickBurst(brick, count) {
    particles.emit(brick.x + brick.w / 2, brick.y + brick.h / 2, { count, spread: Math.PI * 2, speed: [15, 70], lifetime: [0.2, 0.6], sizes: [1, 1, 2], fall: 80 });
  }

  function maybeDropCapsule(brick) {
    if (game.capsule || game.balls.length > 1 || Math.random() >= DROP_CHANCE) {
      return;
    }
    const powerUp = POWER_UPS[Math.floor(Math.random() * POWER_UPS.length)];
    game.capsule = { x: brick.x + (brick.w - CAPSULE_WIDTH) / 2, y: brick.y, w: CAPSULE_WIDTH, h: CAPSULE_HEIGHT, powerUp };
  }

  function clearLevel() {
    game.lastBonus = LEVEL_CLEAR_SCORE * (game.levelIndex + 1) * game.round;
    game.score += game.lastBonus;
    clearFlyingObjects();
    glitch.trigger("goal");
    sounds.levelClear();
    setState("clear");
  }

  function damageBrick(brick) {
    if (brick.isSolid) {
      sounds.solid();
      emitBrickBurst(brick, 3);
      return;
    }
    brick.hp -= 1;
    sounds.brick(brick.row);
    if (brick.hp > 0) {
      emitBrickBurst(brick, 4);
      return;
    }
    brick.isAlive = false;
    game.bricksLeft -= 1;
    game.score += BRICK_SCORE * brick.maxHp * game.round;
    emitBrickBurst(brick, 14);
    if (game.bricksLeft <= 0) {
      clearLevel();
      return;
    }
    maybeDropCapsule(brick);
  }

  function reflect(ball, hit) {
    if (hit.normalX !== 0) {
      ball.vx = hit.normalX * Math.abs(ball.vx);
      ball.x += hit.normalX * 0.01;
    } else {
      ball.vy = hit.normalY * Math.abs(ball.vy);
      ball.y += hit.normalY * 0.01;
    }
    keepBallSteep(ball);
  }

  function resolveBallHit(ball, hit, target) {
    if (target.kind === "wall") {
      reflect(ball, hit);
      sounds.wall();
    } else if (target.kind === "paddle" && hit.normalY < 0) {
      deflectFromPaddle(ball);
    } else if (target.kind === "paddle") {
      reflect(ball, hit);
    } else {
      reflect(ball, hit);
      if (!target.box.isSolid) {
        setBallSpeed(ball, Math.min(ball.speed * SPEEDUP_PER_BRICK, maxSpeed()));
      }
      damageBrick(target.box);
    }
  }

  function findEarliestHit(ball, deltaX, deltaY) {
    let earliest = null;
    const consider = (kind, box) => {
      const hit = sweptAabb(ball, deltaX, deltaY, box);
      if (hit && (!earliest || hit.time < earliest.hit.time)) {
        earliest = { hit, kind, box };
      }
    };
    walls.forEach((wall) => consider("wall", wall));
    consider("paddle", paddle);
    game.bricks.forEach((brick) => brick.isAlive && consider("brick", brick));
    return earliest;
  }

  function moveBall(ball, deltaSeconds) {
    let remaining = 1;
    for (let iteration = 0; iteration < MAX_COLLISIONS_PER_STEP && remaining > 0 && game.state === "play"; iteration++) {
      const deltaX = ball.vx * deltaSeconds * remaining;
      const deltaY = ball.vy * deltaSeconds * remaining;
      const earliest = findEarliestHit(ball, deltaX, deltaY);
      if (!earliest) {
        ball.x += deltaX;
        ball.y += deltaY;
        return;
      }
      ball.x += deltaX * earliest.hit.time;
      ball.y += deltaY * earliest.hit.time;
      remaining *= 1 - earliest.hit.time;
      resolveBallHit(ball, earliest.hit, earliest);
    }
  }

  function resolvePaddleOverlap(ball) {
    if (ball.vy > 0 && overlaps(ball, paddle)) {
      deflectFromPaddle(ball);
    }
  }

  function loseLife() {
    game.lives -= 1;
    clearFlyingObjects();
    setPaddleMode("normal");
    glitch.trigger("goal");
    sounds.lifeLost();
    particles.emit(paddle.x + paddle.w / 2, paddle.y, { count: 40, angle: -Math.PI / 2, spread: Math.PI, speed: [30, 110], lifetime: [0.4, 1], sizes: [1, 2], fall: 90 });
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

  function advanceLevel() {
    game.levelIndex += 1;
    if (game.levelIndex >= LEVELS.length) {
      game.levelIndex = 0;
      game.round += 1;
    }
    loadLevel();
  }

  function splitBalls() {
    const source = game.balls[0];
    if (!source) {
      return;
    }
    const angle = Math.atan2(source.vx, -source.vy);
    [-MULTI_BALL_SPREAD, MULTI_BALL_SPREAD].forEach((spread) => {
      if (game.balls.length >= MAX_BALLS) {
        return;
      }
      const clone = { ...source };
      setBallDirection(clone, angle + spread);
      keepBallSteep(clone);
      game.balls.push(clone);
    });
  }

  function applyPowerUp(powerUp) {
    game.score += POWER_UP_SCORE;
    sounds.powerUp();
    glitch.trigger("hit");
    if (powerUp.id === "expand") {
      setPaddleMode("wide");
    } else if (powerUp.id === "laser") {
      setPaddleMode("laser");
    } else if (powerUp.id === "multi") {
      splitBalls();
    } else if (powerUp.id === "slow") {
      game.balls.forEach((ball) => setBallSpeed(ball, baseSpeed() * SLOW_FACTOR));
    }
  }

  function updateCapsule(deltaSeconds) {
    const capsule = game.capsule;
    if (!capsule) {
      return;
    }
    capsule.y += CAPSULE_SPEED * deltaSeconds;
    if (overlaps(capsule, paddle)) {
      game.capsule = null;
      applyPowerUp(capsule.powerUp);
    } else if (capsule.y > HEIGHT) {
      game.capsule = null;
    }
  }

  function fireLaser() {
    if (paddle.mode !== "laser" || game.laserCooldown > 0) {
      return;
    }
    game.laserCooldown = LASER_COOLDOWN_SECONDS;
    [paddle.x + 1, paddle.x + paddle.w - 2].forEach((x) => game.lasers.push({ x, y: paddle.y - LASER_HEIGHT, w: 1, h: LASER_HEIGHT }));
    sounds.laser();
  }

  function updateLasers(deltaSeconds) {
    game.laserCooldown = Math.max(0, game.laserCooldown - deltaSeconds);
    const flyingLasers = game.lasers.filter((laser) => {
      laser.y -= LASER_SPEED * deltaSeconds;
      if (laser.y + laser.h < FIELD_TOP) {
        return false;
      }
      const target = game.bricks.find((brick) => brick.isAlive && overlaps(laser, brick));
      if (target && game.state === "play") {
        damageBrick(target);
        return false;
      }
      return true;
    });
    if (game.state === "play") {
      game.lasers = flyingLasers;
    }
  }

  function updateBalls(deltaSeconds) {
    for (const ball of game.balls) {
      resolvePaddleOverlap(ball);
      moveBall(ball, deltaSeconds);
      if (game.state !== "play") {
        return;
      }
    }
    game.balls = game.balls.filter((ball) => ball.y < HEIGHT);
    if (game.balls.length === 0) {
      loseLife();
    }
  }

  function updatePlay(deltaSeconds) {
    updateBalls(deltaSeconds);
    if (game.state !== "play") {
      return;
    }
    updateLasers(deltaSeconds);
    if (game.state === "play") {
      updateCapsule(deltaSeconds);
    }
  }

  function movePaddle(delta) {
    paddle.x = clampPaddleX(paddle.x + delta);
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
    } else if (game.state === "serve") {
      launchBall();
    } else if (game.state === "play") {
      fireLaser();
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

  const input = createInput(document.querySelector(".game-stage"), {
    onInteraction: () => audio.unlock(),
    onDrag: (deltaX) => {
      if (CONTROLLABLE_STATES.has(game.state)) {
        movePaddle(deltaX * display.gestureScale() * DRAG_SENSITIVITY);
      }
    },
    onTap: (clientX, clientY) => {
      requestImmersive();
      handleAction(display.clientToBuffer(clientX, clientY));
    },
    onMenu: togglePause,
    isMenuZone: menuButton.containsClient,
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
    if (CONTROLLABLE_STATES.has(game.state)) {
      const keyboardDirection = (input.isKeyDown("ArrowRight", "KeyD") ? 1 : 0) - (input.isKeyDown("ArrowLeft", "KeyA") ? 1 : 0);
      movePaddle(keyboardDirection * KEYBOARD_PADDLE_SPEED * deltaSeconds);
    }
    if (game.state === "play") {
      updatePlay(deltaSeconds);
    } else if (game.state === "lost" && game.stateTime >= LOST_PAUSE_SECONDS) {
      if (game.lives > 0) {
        centerPaddle();
        setState("serve");
      } else {
        finishRun();
      }
    } else if (game.state === "clear" && game.stateTime >= CLEAR_PAUSE_SECONDS) {
      advanceLevel();
    }
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

  function levelLabel() {
    const level = `L${game.levelIndex + 1}`;
    return game.round > 1 ? `R${game.round} ${level}` : level;
  }

  function drawHud() {
    drawText(buffer.context, String(game.score), 2, 3, { color: COLORS.score });
    drawCenteredText(levelLabel(), 3, { color: COLORS.dim });
    const livesRight = menuButton.left - 5;
    for (let life = 0; life < game.lives; life++) {
      buffer.rect(livesRight - (life + 1) * 7 + 2, 5, 5, 2, COLORS.dim);
    }
  }

  function drawField() {
    buffer.rect(0, WALL_Y, WIDTH, 1, COLORS.dim);
    buffer.rect(0, FIELD_TOP, FIELD_LEFT, HEIGHT - FIELD_TOP, COLORS.faint);
    buffer.rect(FIELD_RIGHT, FIELD_TOP, WIDTH - FIELD_RIGHT, HEIGHT - FIELD_TOP, COLORS.faint);
  }

  function drawBrick(brick) {
    if (brick.isSolid) {
      buffer.rect(brick.x, brick.y, brick.w, brick.h, COLORS.dim);
      buffer.rect(brick.x + 1, brick.y + 1, brick.w - 2, brick.h - 2, "#000");
      return;
    }
    buffer.rect(brick.x, brick.y, brick.w, brick.h, BRICK_SHADES[brick.hp]);
  }

  function drawPaddle() {
    buffer.rect(paddle.x, paddle.y, paddle.w, paddle.h, COLORS.bright);
    if (paddle.mode === "laser") {
      buffer.rect(paddle.x + 1, paddle.y - 1, 1, 1, COLORS.bright);
      buffer.rect(paddle.x + paddle.w - 2, paddle.y - 1, 1, 1, COLORS.bright);
    }
  }

  function drawCapsule(capsule) {
    const { x, y, w, h } = capsule;
    buffer.rect(x, y, w, 1, COLORS.bright);
    buffer.rect(x, y + h - 1, w, 1, COLORS.bright);
    buffer.rect(x, y, 1, h, COLORS.bright);
    buffer.rect(x + w - 1, y, 1, h, COLORS.bright);
    drawText(buffer.context, capsule.powerUp.letter, x + 3, y + 1, { color: COLORS.bright });
  }

  function drawPlayObjects(scene) {
    if (scene === "serve") {
      const ball = servingBall();
      buffer.rect(ball.x, ball.y, ball.w, ball.h, COLORS.bright);
    }
    if (scene !== "play") {
      return;
    }
    game.balls.forEach((ball) => buffer.rect(ball.x, ball.y, ball.w, ball.h, COLORS.bright));
    game.lasers.forEach((laser) => buffer.rect(laser.x, laser.y, laser.w, laser.h, COLORS.bright));
    if (game.capsule) {
      drawCapsule(game.capsule);
    }
  }

  function drawVeil() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.veil);
  }

  function drawTitle() {
    drawVeil();
    drawCenteredText("BREAKOUT", 40, { scale: 3, color: COLORS.bright });
    if (isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO START" : "PRESS SPACE", 96, { color: COLORS.bright });
    }
    const hints = isTouchDevice ? ["DRAG: MOVE", "TAP: LAUNCH / FIRE", "II: PAUSE"] : ["A/D: MOVE", "SPACE: LAUNCH / FIRE", "ESC: PAUSE"];
    hints.forEach((hint, index) => drawCenteredText(hint, 118 + index * 9, { color: COLORS.dim }));
    drawCenteredText(`BEST ${records.best}`, 168, { color: COLORS.dim });
  }

  function drawStateHint(scene) {
    if (scene === "serve") {
      drawBannerText(game.round > 1 ? `ROUND ${game.round} LEVEL ${game.levelIndex + 1}` : `LEVEL ${game.levelIndex + 1}`, 110);
      if (isBlinkOn()) {
        drawBannerText(isTouchDevice ? "TAP TO LAUNCH" : "SPACE TO LAUNCH", 136);
      }
    } else if (scene === "clear") {
      drawBannerText("LEVEL CLEAR", 104);
      drawBannerText(`BONUS ${game.lastBonus}`, 116, COLORS.dim);
    } else if (scene === "lost" && game.lives > 0) {
      drawBannerText(`LIVES ${game.lives}`, 110, COLORS.dim);
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
    drawCenteredText(`BEST ${records.best}`, 168, { color: COLORS.faint });
  }

  function drawGameOver() {
    drawVeil();
    drawCenteredText("GAME OVER", 50, { scale: 2, color: COLORS.bright });
    drawCenteredText(String(game.score), 76, { scale: 2, color: COLORS.score });
    drawCenteredText(game.isNewBest ? "NEW BEST!" : `BEST ${records.best}`, 100, { color: game.isNewBest ? COLORS.bright : COLORS.dim });
    drawCenteredText(levelLabel(), 112, { color: COLORS.dim });
    if (game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS && isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO PLAY AGAIN" : "SPACE TO PLAY AGAIN", 150, { color: COLORS.bright });
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
    drawField();
    if (scene !== "title") {
      drawHud();
    }
    game.bricks.forEach((brick) => brick.isAlive && drawBrick(brick));
    drawPaddle();
    drawPlayObjects(scene);
    particles.draw(buffer.context);
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
      console.error("Breakout crashed", error);
      showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
    },
  });

  centerPaddle();
  loop.start();
  powerOn();
}

try {
  startGame();
} catch (error) {
  console.error("Unable to start Breakout", error);
  showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
}
