import { createLoop } from "../../assets/js/engine/loop.js";
import { createBuffer, createDisplay } from "../../assets/js/engine/screen.js";
import { createCrt } from "../../assets/js/engine/crt.js";
import { createGlitch } from "../../assets/js/engine/glitch.js";
import { createInput } from "../../assets/js/engine/input.js";
import { overlaps, sweptAabb } from "../../assets/js/engine/collision.js";
import { createParticles } from "../../assets/js/engine/particles.js";
import { createAudio } from "../../assets/js/engine/audio.js";
import { createStore } from "../../assets/js/engine/storage.js";
import { createSettings, readPalette } from "../../assets/js/engine/settings.js";
import { drawText, measureText } from "../../assets/js/engine/pixelfont.js";

const WIDTH = 192;
const HEIGHT = 108;
const FIELD_TOP = 1;
const FIELD_BOTTOM = HEIGHT - 1;
const NET_X = WIDTH / 2 - 1;
const PADDLE_WIDTH = 2;
const PADDLE_HEIGHT = 16;
const PADDLE_MARGIN = 6;
const BALL_SIZE = 2;
const WINNING_SCORE = 11;
const SERVE_SPEED = 95;
const MAX_SPEED = 240;
const SPEEDUP_PER_HIT = 1.06;
const MAX_BOUNCE_ANGLE = Math.PI / 3;
const KEYBOARD_PADDLE_SPEED = 150;
const DRAG_SENSITIVITY = 1.15;
const CPU_SERVE_DELAY_SECONDS = 0.9;
const POINT_PAUSE_SECONDS = 1.1;
const GAME_OVER_INPUT_DELAY_SECONDS = 1;
const EXIT_FALLBACK_MS = 700;
const MAX_COLLISIONS_PER_STEP = 4;
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
const CONTROLLABLE_STATES = new Set(["title", "serve", "play", "point"]);
const COLORS = {
  bright: "#ffffff",
  score: "#d8d8d8",
  dim: "#808080",
  faint: "#505050",
  veil: "rgba(0, 0, 0, 0.78)",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const toCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const clampPaddleY = (y) => clamp(y, FIELD_TOP, FIELD_BOTTOM - PADDLE_HEIGHT);

function sanitizeRecords(raw) {
  return {
    wins: toCount(raw.wins),
    losses: toCount(raw.losses),
    currentStreak: toCount(raw.currentStreak),
    bestStreak: toCount(raw.bestStreak),
    longestRally: toCount(raw.longestRally),
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
    serve: () => audio.tone({ frequency: 330, duration: 0.05, volume: 0.1 }),
    paddle: (speed) => audio.tone({ frequency: 440 + (speed - SERVE_SPEED) * 1.5, duration: 0.06 }),
    wall: () => audio.tone({ frequency: 220, duration: 0.05, volume: 0.1 }),
    score: (isPlayerPoint) => {
      audio.noise({ duration: 0.35, volume: 0.18, highpass: 400 });
      audio.tone({ frequency: isPlayerPoint ? 660 : 180, slideTo: isPlayerPoint ? 990 : 90, duration: 0.3, volume: 0.12 });
    },
    victory: () => [523, 659, 784, 1047].forEach((frequency, index) => audio.tone({ frequency, duration: 0.14, delay: index * 0.12 })),
    defeat: () => [392, 330, 262, 196].forEach((frequency, index) => audio.tone({ frequency, duration: 0.18, delay: index * 0.16 })),
    select: () => audio.tone({ frequency: 880, duration: 0.04, volume: 0.08 }),
    pause: () => audio.noise({ duration: 0.12, volume: 0.08, highpass: 1500 }),
  };
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
  const particles = createParticles(320);
  const audio = createAudio();
  const sounds = createSounds(audio);
  const settings = createSettings();
  const recordsStore = createStore("pong", 1, { wins: 0, losses: 0, currentStreak: 0, bestStreak: 0, longestRally: 0 });
  let records = sanitizeRecords(recordsStore.load());

  const player = { x: PADDLE_MARGIN, y: clampPaddleY(HEIGHT / 2 - PADDLE_HEIGHT / 2), w: PADDLE_WIDTH, h: PADDLE_HEIGHT, direction: 1 };
  const cpu = { x: WIDTH - PADDLE_MARGIN - PADDLE_WIDTH, y: player.y, w: PADDLE_WIDTH, h: PADDLE_HEIGHT, direction: -1 };
  const ball = { x: 0, y: 0, w: BALL_SIZE, h: BALL_SIZE, vx: 0, vy: 0, speed: 0 };
  const colliders = [
    { kind: "wall", box: { x: -WIDTH, y: -HEIGHT, w: WIDTH * 3, h: HEIGHT + FIELD_TOP } },
    { kind: "wall", box: { x: -WIDTH, y: FIELD_BOTTOM, w: WIDTH * 3, h: HEIGHT } },
    { kind: "paddle", box: player },
    { kind: "paddle", box: cpu },
  ];
  const game = {
    state: "title",
    resumeState: "title",
    stateTime: 0,
    time: 0,
    isReady: false,
    isExiting: false,
    hasRequestedImmersive: false,
    score: { player: 0, cpu: 0 },
    server: "player",
    rally: 0,
    pointsPlayed: 0,
    pauseIndex: 0,
    pauseView: "main",
    winner: null,
  };
  const ai = { target: HEIGHT / 2, reactionTimer: 0, aimError: 0, wasApproaching: false };
  const performanceSample = { frames: 0, seconds: 0, isDone: false };

  function saveRecords() {
    recordsStore.save(records);
  }

  function setState(state) {
    game.state = state;
    game.stateTime = 0;
    if (state === "serve" && game.server === "cpu") {
      ai.target = FIELD_TOP + PADDLE_HEIGHT / 2 + Math.random() * (FIELD_BOTTOM - FIELD_TOP - PADDLE_HEIGHT);
    }
  }

  function sceneState() {
    return game.state === "paused" ? game.resumeState : game.state;
  }

  function startMatch() {
    game.score.player = 0;
    game.score.cpu = 0;
    game.pointsPlayed = 0;
    game.rally = 0;
    game.server = "player";
    game.winner = null;
    ai.wasApproaching = false;
    particles.clear();
    setState("serve");
  }

  function placeBallOnServer() {
    const paddle = game.server === "player" ? player : cpu;
    ball.x = paddle === player ? paddle.x + paddle.w + 1 : paddle.x - BALL_SIZE - 1;
    ball.y = paddle.y + paddle.h / 2 - BALL_SIZE / 2;
  }

  function launchBall() {
    const direction = game.server === "player" ? 1 : -1;
    const angle = (0.15 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1);
    ball.speed = SERVE_SPEED;
    ball.vx = direction * ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);
    game.rally = 0;
    sounds.serve();
    setState("play");
  }

  function deflect(paddle) {
    const offset = clamp((ball.y + BALL_SIZE / 2 - (paddle.y + paddle.h / 2)) / (paddle.h / 2), -1, 1);
    const angle = offset * MAX_BOUNCE_ANGLE;
    ball.speed = Math.min(ball.speed * SPEEDUP_PER_HIT, MAX_SPEED);
    ball.vx = paddle.direction * ball.speed * Math.cos(angle);
    ball.vy = ball.speed * Math.sin(angle);
    ball.x = paddle.direction > 0 ? paddle.x + paddle.w + 0.01 : paddle.x - ball.w - 0.01;
    game.rally += 1;
    glitch.trigger("hit");
    sounds.paddle(ball.speed);
    particles.emit(paddle.direction > 0 ? ball.x : ball.x + ball.w, ball.y + BALL_SIZE / 2, {
      count: 6,
      angle: Math.atan2(ball.vy, ball.vx),
      spread: 1.4,
      speed: [20, 60],
      lifetime: [0.12, 0.3],
      sizes: [1],
    });
  }

  function resolveCollision(hit, collider) {
    if (collider.kind === "wall") {
      ball.vy = hit.normalY * Math.abs(ball.vy);
      ball.y += hit.normalY * 0.01;
      sounds.wall();
      return;
    }
    if (hit.normalX !== 0) {
      deflect(collider.box);
      return;
    }
    ball.vy = hit.normalY * Math.max(Math.abs(ball.vy), ball.speed * 0.5);
    ball.y += hit.normalY * 0.01;
  }

  function moveBall(deltaSeconds) {
    let remaining = 1;
    for (let iteration = 0; iteration < MAX_COLLISIONS_PER_STEP && remaining > 0; iteration++) {
      const deltaX = ball.vx * deltaSeconds * remaining;
      const deltaY = ball.vy * deltaSeconds * remaining;
      let earliestHit = null;
      let earliestCollider = null;
      for (const collider of colliders) {
        const hit = sweptAabb(ball, deltaX, deltaY, collider.box);
        if (hit && (!earliestHit || hit.time < earliestHit.time)) {
          earliestHit = hit;
          earliestCollider = collider;
        }
      }
      if (!earliestHit) {
        ball.x += deltaX;
        ball.y += deltaY;
        return;
      }
      ball.x += deltaX * earliestHit.time;
      ball.y += deltaY * earliestHit.time;
      remaining *= 1 - earliestHit.time;
      resolveCollision(earliestHit, earliestCollider);
    }
  }

  function resolvePaddleOverlap(paddle) {
    if (!overlaps(ball, paddle)) {
      return;
    }
    const paddleCenterX = paddle.x + paddle.w / 2;
    const ballCenterX = ball.x + ball.w / 2;
    const isInFront = paddle.direction > 0 ? ballCenterX >= paddleCenterX : ballCenterX <= paddleCenterX;
    if (isInFront) {
      if (Math.sign(ball.vx) === -paddle.direction) {
        deflect(paddle);
      } else {
        ball.x = paddle.direction > 0 ? paddle.x + paddle.w : paddle.x - ball.w;
      }
      return;
    }
    const isAbove = ball.y + ball.h / 2 < paddle.y + paddle.h / 2;
    ball.y = clamp(isAbove ? paddle.y - ball.h : paddle.y + paddle.h, FIELD_TOP, FIELD_BOTTOM - ball.h);
  }

  function scorePoint(scorer) {
    game.score[scorer] += 1;
    game.pointsPlayed += 1;
    const isPlayerPoint = scorer === "player";
    particles.emit(isPlayerPoint ? WIDTH - 1 : 0, clamp(ball.y, FIELD_TOP, FIELD_BOTTOM), {
      count: 70,
      angle: isPlayerPoint ? Math.PI : 0,
      spread: Math.PI * 1.1,
      speed: [30, 130],
      lifetime: [0.4, 1.1],
      sizes: [1, 2, 2],
      fall: 60,
    });
    glitch.trigger("goal");
    sounds.score(isPlayerPoint);
    if (game.rally > records.longestRally) {
      records.longestRally = game.rally;
      saveRecords();
    }
    game.server = isPlayerPoint ? "cpu" : "player";
    setState("point");
  }

  function finishMatch() {
    game.winner = game.score.player >= WINNING_SCORE ? "player" : "cpu";
    if (game.winner === "player") {
      records.wins += 1;
      records.currentStreak += 1;
      records.bestStreak = Math.max(records.bestStreak, records.currentStreak);
      sounds.victory();
    } else {
      records.losses += 1;
      records.currentStreak = 0;
      sounds.defeat();
    }
    saveRecords();
    setState("over");
  }

  function predictBallY(targetX) {
    const travelSeconds = (targetX - (ball.x + ball.w)) / ball.vx;
    if (travelSeconds <= 0) {
      return ball.y;
    }
    const range = FIELD_BOTTOM - BALL_SIZE - FIELD_TOP;
    const period = range * 2;
    const unfolded = ball.y - FIELD_TOP + ball.vy * travelSeconds;
    const folded = ((unfolded % period) + period) % period;
    return FIELD_TOP + (folded <= range ? folded : period - folded);
  }

  function updateCpu(deltaSeconds) {
    const difficulty = clamp(0.3 + game.pointsPlayed * 0.035 + (game.score.player - game.score.cpu) * 0.04, 0, 1);
    const isApproaching = game.state === "play" && ball.vx > 0;
    if (isApproaching && !ai.wasApproaching) {
      ai.aimError = (Math.random() - 0.5) * lerp(30, 6, difficulty);
    }
    ai.wasApproaching = isApproaching;
    const isHoldingServe = game.state === "serve" && game.server === "cpu";
    ai.reactionTimer -= deltaSeconds;
    if (ai.reactionTimer <= 0 && !isHoldingServe) {
      ai.reactionTimer = lerp(0.22, 0.06, difficulty);
      ai.target = isApproaching ? predictBallY(cpu.x) + BALL_SIZE / 2 + ai.aimError : HEIGHT / 2;
    }
    const maxStep = lerp(65, 150, difficulty) * deltaSeconds;
    const delta = ai.target - (cpu.y + cpu.h / 2);
    if (Math.abs(delta) > 1) {
      cpu.y = clampPaddleY(cpu.y + clamp(delta, -maxStep, maxStep));
    }
  }

  function movePlayer(delta) {
    player.y = clampPaddleY(player.y + delta);
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
    if (settings.activate(item.id, step)) {
      sounds.select();
      return;
    }
    sounds.select();
    if (item.id === "continue") {
      resume();
    } else if (item.id === "restart") {
      startMatch();
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
      startMatch();
    } else if (game.state === "serve" && game.server === "player") {
      launchBall();
    } else if (game.state === "paused") {
      const index = point ? pauseItemAt(point) : game.pauseIndex;
      if (index >= 0) {
        game.pauseIndex = index;
        activatePauseItem(index);
      }
    } else if (game.state === "over" && game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS) {
      startMatch();
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
    root
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => window.screen.orientation?.lock?.("landscape"))
      .catch((error) => console.info("Fullscreen or orientation lock is unavailable", error));
  }

  const input = createInput(document.querySelector(".game-stage"), {
    onInteraction: () => audio.unlock(),
    onDrag: (deltaX, deltaY) => {
      if (CONTROLLABLE_STATES.has(game.state)) {
        movePlayer(deltaY * display.cssToBufferScale() * DRAG_SENSITIVITY);
      }
    },
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
    if (CONTROLLABLE_STATES.has(game.state)) {
      const keyboardDirection = (input.isKeyDown("ArrowDown", "KeyS") ? 1 : 0) - (input.isKeyDown("ArrowUp", "KeyW") ? 1 : 0);
      movePlayer(keyboardDirection * KEYBOARD_PADDLE_SPEED * deltaSeconds);
    }
    updateCpu(deltaSeconds);
    if (game.state === "serve") {
      placeBallOnServer();
      if (game.server === "cpu" && game.stateTime >= CPU_SERVE_DELAY_SECONDS) {
        launchBall();
      }
    } else if (game.state === "play") {
      resolvePaddleOverlap(player);
      resolvePaddleOverlap(cpu);
      moveBall(deltaSeconds);
      if (ball.x + ball.w < 0) {
        scorePoint("cpu");
      } else if (ball.x > WIDTH) {
        scorePoint("player");
      }
    } else if (game.state === "point" && game.stateTime >= POINT_PAUSE_SECONDS) {
      if (Math.max(game.score.player, game.score.cpu) >= WINNING_SCORE) {
        finishMatch();
      } else {
        setState("serve");
      }
    }
  }

  function isBlinkOn() {
    return Math.floor(game.time * 2.5) % 2 === 0;
  }

  function drawCenteredText(text, y, options) {
    drawText(buffer.context, text, WIDTH / 2, y, { align: "center", ...options });
  }

  function drawField() {
    buffer.rect(0, 0, WIDTH, 1, COLORS.dim);
    buffer.rect(0, HEIGHT - 1, WIDTH, 1, COLORS.dim);
    for (let y = FIELD_TOP + 2; y < FIELD_BOTTOM - 2; y += 8) {
      buffer.rect(NET_X, y, 2, 4, COLORS.faint);
    }
  }

  function drawScore() {
    drawText(buffer.context, String(game.score.player), NET_X - 9, 5, { scale: 3, color: COLORS.score, align: "right" });
    drawText(buffer.context, String(game.score.cpu), NET_X + 12, 5, { scale: 3, color: COLORS.score });
  }

  function drawVeil() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.veil);
  }

  function drawTitle() {
    drawVeil();
    drawCenteredText("PONG", 14, { scale: 5, color: COLORS.bright });
    if (isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO START" : "PRESS SPACE TO START", 54, { color: COLORS.bright });
    }
    drawCenteredText(isTouchDevice ? "DRAG: MOVE   HOLD: PAUSE" : "W/S: MOVE   ESC: PAUSE", 68, { color: COLORS.dim });
    drawCenteredText("SWIPE FROM LEFT EDGE: EXIT", 76, { color: COLORS.faint });
    drawCenteredText(`WINS ${records.wins}  STREAK ${records.bestStreak}  RALLY ${records.longestRally}`, 94, { color: COLORS.dim });
  }

  function drawServeHint() {
    if (game.state !== "serve" || game.server !== "player" || !isBlinkOn()) {
      return;
    }
    const text = isTouchDevice ? "TAP TO SERVE" : "SPACE TO SERVE";
    buffer.rect(WIDTH / 2 - 30, HEIGHT - 16, 60, 9, "#000");
    drawCenteredText(text, HEIGHT - 14, { color: COLORS.bright });
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
    drawCenteredText(`BEST STREAK ${records.bestStreak}   LONGEST RALLY ${records.longestRally}`, 94, { color: COLORS.faint });
  }

  function drawGameOver() {
    drawVeil();
    const isVictory = game.winner === "player";
    drawCenteredText(isVictory ? "YOU WIN" : "GAME OVER", 14, { scale: 3, color: COLORS.bright });
    drawCenteredText(`${game.score.player} - ${game.score.cpu}`, 36, { scale: 2, color: COLORS.score });
    drawCenteredText(`WINS ${records.wins}   LOSSES ${records.losses}`, 56, { color: COLORS.dim });
    drawCenteredText(`STREAK ${records.currentStreak}   BEST ${records.bestStreak}`, 64, { color: COLORS.dim });
    drawCenteredText(`LONGEST RALLY ${records.longestRally}`, 72, { color: COLORS.dim });
    if (game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS && isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO PLAY AGAIN" : "SPACE TO PLAY AGAIN", 90, { color: COLORS.bright });
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
      drawScore();
    }
    buffer.rect(player.x, player.y, player.w, player.h, COLORS.bright);
    buffer.rect(cpu.x, cpu.y, cpu.w, cpu.h, COLORS.bright);
    if (scene === "serve" || scene === "play") {
      buffer.rect(ball.x, ball.y, ball.w, ball.h, COLORS.bright);
    }
    particles.draw(buffer.context);
    if (game.state === "paused") {
      drawPauseMenu();
    } else if (scene === "title") {
      drawTitle();
    } else if (scene === "over") {
      drawGameOver();
    } else {
      drawServeHint();
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
      console.error("Pong crashed", error);
      showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
    },
  });

  loop.start();
  powerOn();
}

try {
  startGame();
} catch (error) {
  console.error("Unable to start Pong", error);
  showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
}
