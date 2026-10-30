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
const CAR_SCREEN_Y = 150;
const CAR_HALF_LENGTH = 3;
const CAR_HALF_WIDTH = 1;
const CAR_SAMPLE_STEP = 0.5;
const ROAD_POINT_SPACING = 64;
const STRAIGHT_POINTS = 4;
const ROAD_MARGIN = 4;
const HALF_WIDTH_START = 22;
const HALF_WIDTH_END = 14;
const SWING_START = 16;
const SWING_END = 44;
const SWING_SWITCH_CHANCE = 0.7;
const DIFFICULTY_DISTANCE = 12000;
const START_SPEED = 70;
const MAX_SPEED = 125;
const SPEED_RESPONSE = 1.5;
const DRIFT_SPEED_LOSS = 0.3;
const SLIP_FOR_FULL_LOSS = 0.8;
const TURN_RATE = 2.4;
const MAX_HEADING = 1.2;
const GRIP_SLOW = 6;
const GRIP_FAST = 2.6;
const DRIFT_SLIP = 0.18;
const DRIFT_GRACE_SECONDS = 0.3;
const DRIFT_SCORE_RATE = 0.5;
const NEAR_EDGE_DISTANCE = 4;
const NEAR_EDGE_FACTOR = 2;
const MULTIPLIER_STEP_SECONDS = 0.8;
const MAX_MULTIPLIER = 5;
const DISTANCE_SCORE_RATE = 0.1;
const DISTANCE_UNIT = 10;
const SKID_CAPACITY = 900;
const SQUEAL_INTERVAL_SECONDS = 0.09;
const DUST_INTERVAL_SECONDS = 0.06;
const BANNER_SECONDS = 1.1;
const CRASH_SECONDS = 1.1;
const CRASH_SPIN = 9;
const CRASH_FRICTION = 2.5;
const GAME_OVER_INPUT_DELAY_SECONDS = 1;
const EXIT_FALLBACK_MS = 700;
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
const CONTROLLABLE_STATES = new Set(["title", "play", "crash"]);
const COLORS = {
  bright: "#ffffff",
  score: "#d8d8d8",
  body: "#c0c0c0",
  dim: "#808080",
  skid: "#606060",
  faint: "#505050",
  gravel: "#404040",
  veil: "rgba(0, 0, 0, 0.78)",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const toCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const progressAt = (distance) => clamp(distance / DIFFICULTY_DISTANCE, 0, 1);
const halfWidthAt = (distance) => lerp(HALF_WIDTH_START, HALF_WIDTH_END, progressAt(distance));
const swingAt = (distance) => lerp(SWING_START, SWING_END, progressAt(distance));
const baseSpeedAt = (distance) => lerp(START_SPEED, MAX_SPEED, progressAt(distance));

function hashUnit(value) {
  const raw = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
}

function sanitizeRecords(raw) {
  return { best: toCount(raw.best), bestDrift: toCount(raw.bestDrift), runs: toCount(raw.runs) };
}

function showSystemMessage(text) {
  const message = document.createElement("p");
  message.className = "system-message glow";
  message.textContent = text;
  document.body.append(message);
}

function createSounds(audio) {
  return {
    start: () => audio.tone({ frequency: 330, slideTo: 660, duration: 0.18, volume: 0.1 }),
    squeal: (slip) => audio.noise({ duration: 0.07, volume: 0.02 + Math.min(slip, 1) * 0.03, highpass: 2400 }),
    multiplier: (multiplier) => audio.tone({ frequency: 520 + multiplier * 110, duration: 0.05, volume: 0.08 }),
    bank: (multiplier) => [660, 880].forEach((frequency, index) => audio.tone({ frequency: frequency + multiplier * 40, duration: 0.07, delay: index * 0.07, volume: 0.1 })),
    lost: () => audio.tone({ frequency: 220, slideTo: 80, duration: 0.25, volume: 0.1 }),
    crash: () => {
      audio.noise({ duration: 0.5, volume: 0.2, highpass: 300 });
      audio.tone({ frequency: 160, slideTo: 45, duration: 0.45, volume: 0.14 });
    },
    newBest: () => [523, 659, 784, 1047].forEach((frequency, index) => audio.tone({ frequency, duration: 0.12, delay: 0.3 + index * 0.1 })),
    select: () => audio.tone({ frequency: 880, duration: 0.04, volume: 0.08 }),
    pause: () => audio.noise({ duration: 0.12, volume: 0.08, highpass: 1500 }),
  };
}

function createRoad() {
  const points = [];
  let swingDirection = 1;

  function reset() {
    points.length = 0;
    swingDirection = Math.random() < 0.5 ? -1 : 1;
  }

  function nextPoint() {
    const index = points.length;
    if (index < STRAIGHT_POINTS) {
      return WIDTH / 2;
    }
    const distance = index * ROAD_POINT_SPACING;
    const halfWidth = halfWidthAt(distance);
    const minimum = halfWidth + ROAD_MARGIN;
    const maximum = WIDTH - halfWidth - ROAD_MARGIN;
    const target = points[index - 1] + swingDirection * swingAt(distance) * (0.55 + 0.45 * Math.random());
    if (target < minimum || target > maximum) {
      swingDirection *= -1;
    } else if (Math.random() < SWING_SWITCH_CHANCE) {
      swingDirection *= -1;
    }
    return clamp(target, minimum, maximum);
  }

  function ensurePoints(index) {
    while (points.length <= index) {
      points.push(nextPoint());
    }
  }

  function centerAt(distance) {
    if (distance <= 0) {
      return WIDTH / 2;
    }
    const position = distance / ROAD_POINT_SPACING;
    const index = Math.floor(position);
    ensurePoints(index + 2);
    return catmullRom(points[Math.max(0, index - 1)], points[index], points[index + 1], points[index + 2], position - index);
  }

  return { reset, centerAt };
}

function createSkidMarks(capacity) {
  const markX = new Float32Array(capacity);
  const markDistance = new Float32Array(capacity);
  let count = 0;
  let cursor = 0;

  function add(x, distance) {
    markX[cursor] = x;
    markDistance[cursor] = distance;
    cursor = (cursor + 1) % capacity;
    count = Math.min(count + 1, capacity);
  }

  function draw(buffer, cameraDistance, color) {
    buffer.context.fillStyle = color;
    for (let index = 0; index < count; index++) {
      const y = Math.round(CAR_SCREEN_Y - (markDistance[index] - cameraDistance));
      if (y >= 0 && y < HEIGHT) {
        buffer.context.fillRect(Math.round(markX[index]), y, 1, 1);
      }
    }
  }

  function clear() {
    count = 0;
    cursor = 0;
  }

  return { add, draw, clear };
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
  const particles = createParticles(256);
  const audio = createAudio();
  const sounds = createSounds(audio);
  const settings = createSettings();
  const road = createRoad();
  const skidMarks = createSkidMarks(SKID_CAPACITY);
  const recordsStore = createStore("drift", 1, { best: 0, bestDrift: 0, runs: 0 });
  let records = sanitizeRecords(recordsStore.load());

  const car = { x: WIDTH / 2, distance: 0, heading: 0, velocityAngle: 0, speed: 0, spin: 0 };
  const drift = { isActive: false, time: 0, grace: 0, points: 0, multiplier: 1, isNearEdge: false };
  const game = {
    state: "title",
    resumeState: "title",
    stateTime: 0,
    time: 0,
    isReady: false,
    isExiting: false,
    hasRequestedImmersive: false,
    bonus: 0,
    finalScore: 0,
    runBestDrift: 0,
    isNewBest: false,
    banner: { text: "", time: 0 },
    squealTimer: 0,
    dustTimer: 0,
    touch: null,
    pauseIndex: 0,
    pauseView: "main",
  };
  const performanceSample = { frames: 0, seconds: 0, isDone: false };

  function saveRecords() {
    recordsStore.save(records);
  }

  function setState(state) {
    game.state = state;
    game.stateTime = 0;
  }

  function sceneState() {
    return game.state === "paused" ? game.resumeState : game.state;
  }

  function currentScore() {
    return Math.floor(car.distance * DISTANCE_SCORE_RATE) + game.bonus;
  }

  function resetDrift() {
    drift.isActive = false;
    drift.time = 0;
    drift.grace = 0;
    drift.points = 0;
    drift.multiplier = 1;
    drift.isNearEdge = false;
  }

  function resetCar() {
    car.x = WIDTH / 2;
    car.distance = 0;
    car.heading = 0;
    car.velocityAngle = 0;
    car.speed = START_SPEED;
    car.spin = 0;
  }

  function startRun() {
    road.reset();
    skidMarks.clear();
    particles.clear();
    resetCar();
    resetDrift();
    game.bonus = 0;
    game.runBestDrift = 0;
    game.isNewBest = false;
    game.banner.time = 0;
    sounds.start();
    setState("play");
  }

  function showBanner(text) {
    game.banner.text = text;
    game.banner.time = BANNER_SECONDS;
  }

  function bankDrift() {
    const value = Math.round(drift.points * drift.multiplier);
    if (value > 0) {
      game.bonus += value;
      game.runBestDrift = Math.max(game.runBestDrift, value);
      showBanner(`+${value}`);
      sounds.bank(drift.multiplier);
      if (drift.multiplier >= 3) {
        glitch.trigger("tear");
      }
    }
    resetDrift();
  }

  function loseDrift() {
    if (drift.points >= 1) {
      showBanner("DRIFT LOST");
      sounds.lost();
    }
    resetDrift();
  }

  function forwardVector(angle) {
    return { x: Math.sin(angle), distance: Math.cos(angle) };
  }

  function rearWheels() {
    const forward = forwardVector(car.heading);
    const rearX = car.x - forward.x * CAR_HALF_LENGTH;
    const rearDistance = car.distance - forward.distance * CAR_HALF_LENGTH;
    return [-1, 1].map((side) => ({
      x: rearX + forward.distance * side * CAR_HALF_WIDTH,
      distance: rearDistance - forward.x * side * CAR_HALF_WIDTH,
    }));
  }

  function emitDriftEffects(deltaSeconds, slip) {
    const wheels = rearWheels();
    wheels.forEach((wheel) => skidMarks.add(wheel.x, wheel.distance));
    game.squealTimer -= deltaSeconds;
    if (game.squealTimer <= 0) {
      game.squealTimer = SQUEAL_INTERVAL_SECONDS;
      sounds.squeal(slip);
    }
    game.dustTimer -= deltaSeconds;
    if (game.dustTimer <= 0) {
      game.dustTimer = DUST_INTERVAL_SECONDS;
      const wheel = wheels[Math.random() < 0.5 ? 0 : 1];
      particles.emit(wheel.x, CAR_SCREEN_Y - (wheel.distance - car.distance), {
        count: 2,
        angle: Math.PI / 2 + car.velocityAngle,
        spread: 1.2,
        speed: [10, 30],
        lifetime: [0.15, 0.35],
        sizes: [1],
      });
    }
  }

  function updateDrift(deltaSeconds, slip, edgeDistance) {
    if (slip > DRIFT_SLIP) {
      drift.isActive = true;
      drift.grace = 0;
      drift.time += deltaSeconds;
      drift.isNearEdge = edgeDistance < NEAR_EDGE_DISTANCE;
      drift.points += slip * car.speed * deltaSeconds * DRIFT_SCORE_RATE * (drift.isNearEdge ? NEAR_EDGE_FACTOR : 1);
      const multiplier = Math.min(MAX_MULTIPLIER, 1 + Math.floor(drift.time / MULTIPLIER_STEP_SECONDS));
      if (multiplier > drift.multiplier) {
        drift.multiplier = multiplier;
        sounds.multiplier(multiplier);
      }
      emitDriftEffects(deltaSeconds, slip);
    } else if (drift.isActive) {
      drift.isNearEdge = false;
      drift.grace += deltaSeconds;
      if (drift.grace >= DRIFT_GRACE_SECONDS) {
        bankDrift();
      }
    }
  }

  function steeringInput() {
    const keyboardSteer = (input.isKeyDown("ArrowRight", "KeyD") ? 1 : 0) - (input.isKeyDown("ArrowLeft", "KeyA") ? 1 : 0);
    if (keyboardSteer !== 0 || !game.touch) {
      return keyboardSteer;
    }
    return display.clientToBuffer(game.touch.clientX, game.touch.clientY).x < WIDTH / 2 ? -1 : 1;
  }

  function moveCar(deltaSeconds, angle) {
    const forward = forwardVector(angle);
    car.x += forward.x * car.speed * deltaSeconds;
    car.distance += forward.distance * car.speed * deltaSeconds;
  }

  function updatePlay(deltaSeconds) {
    car.heading = clamp(car.heading + steeringInput() * TURN_RATE * deltaSeconds, -MAX_HEADING, MAX_HEADING);
    const speedRatio = clamp((car.speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1);
    const grip = lerp(GRIP_SLOW, GRIP_FAST, speedRatio);
    car.velocityAngle += (car.heading - car.velocityAngle) * Math.min(1, grip * deltaSeconds);
    const slip = Math.abs(car.heading - car.velocityAngle);
    const targetSpeed = baseSpeedAt(car.distance) * (1 - DRIFT_SPEED_LOSS * Math.min(1, slip / SLIP_FOR_FULL_LOSS));
    car.speed += (targetSpeed - car.speed) * Math.min(1, SPEED_RESPONSE * deltaSeconds);
    moveCar(deltaSeconds, car.velocityAngle);
    const edgeDistance = halfWidthAt(car.distance) - Math.abs(car.x - road.centerAt(car.distance));
    if (edgeDistance < CAR_HALF_WIDTH) {
      crash();
      return;
    }
    updateDrift(deltaSeconds, slip, edgeDistance);
  }

  function crash() {
    loseDrift();
    car.spin = (car.heading >= car.velocityAngle ? 1 : -1) * CRASH_SPIN;
    particles.emit(car.x, CAR_SCREEN_Y, {
      count: 60,
      spread: Math.PI * 2,
      speed: [20, 90],
      lifetime: [0.4, 1],
      sizes: [1, 1, 2],
    });
    glitch.trigger("goal");
    sounds.crash();
    setState("crash");
  }

  function updateCrash(deltaSeconds) {
    car.heading += car.spin * deltaSeconds;
    car.spin *= Math.max(0, 1 - CRASH_FRICTION * deltaSeconds);
    car.speed *= Math.max(0, 1 - CRASH_FRICTION * deltaSeconds);
    moveCar(deltaSeconds, car.velocityAngle);
    if (game.stateTime >= CRASH_SECONDS) {
      finishRun();
    }
  }

  function finishRun() {
    game.finalScore = currentScore();
    game.isNewBest = game.finalScore > records.best;
    records.best = Math.max(records.best, game.finalScore);
    records.bestDrift = Math.max(records.bestDrift, game.runBestDrift);
    records.runs += 1;
    saveRecords();
    if (game.isNewBest) {
      sounds.newBest();
    }
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
    onPress: (clientX, clientY) => {
      game.touch = { clientX, clientY };
    },
    onDrag: (deltaX, deltaY) => {
      if (game.touch) {
        game.touch.clientX += deltaX;
        game.touch.clientY += deltaY;
      }
    },
    onRelease: () => {
      game.touch = null;
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
    game.banner.time = Math.max(0, game.banner.time - deltaSeconds);
    particles.update(deltaSeconds);
    if (game.state === "play") {
      updatePlay(deltaSeconds);
    } else if (game.state === "crash") {
      updateCrash(deltaSeconds);
    }
  }

  function isBlinkOn() {
    return Math.floor(game.time * 2.5) % 2 === 0;
  }

  function drawCenteredText(text, y, options) {
    drawText(buffer.context, text, WIDTH / 2, y, { align: "center", ...options });
  }

  function drawGravel(rowDistance, left, right) {
    const gravelSeed = Math.floor(rowDistance);
    const roll = hashUnit(gravelSeed);
    if (roll > 0.16) {
      return;
    }
    const offset = 3 + hashUnit(gravelSeed + 0.5) * 24;
    buffer.rect(roll < 0.08 ? left - offset : right + offset, CAR_SCREEN_Y - (gravelSeed - car.distance), 1, 1, COLORS.gravel);
  }

  function drawRoad() {
    for (let y = 0; y < HEIGHT; y++) {
      const rowDistance = car.distance + (CAR_SCREEN_Y - y);
      const center = road.centerAt(rowDistance);
      const halfWidth = halfWidthAt(rowDistance);
      const left = Math.round(center - halfWidth);
      const right = Math.round(center + halfWidth);
      const kerbColor = Math.floor(rowDistance / 4) % 2 === 0 ? COLORS.bright : COLORS.dim;
      buffer.rect(left - 1, y, 1, 1, kerbColor);
      buffer.rect(right, y, 1, 1, kerbColor);
      if (Math.floor(rowDistance / 10) % 2 === 0) {
        buffer.rect(Math.round(center), y, 1, 1, COLORS.faint);
      }
      drawGravel(rowDistance, left, right);
    }
  }

  function drawCar() {
    if (game.state === "crash" && Math.floor(game.stateTime * 16) % 2 === 1) {
      return;
    }
    const forward = forwardVector(car.heading);
    const context = buffer.context;
    for (let along = -CAR_HALF_LENGTH; along <= CAR_HALF_LENGTH; along += CAR_SAMPLE_STEP) {
      context.fillStyle = along >= CAR_HALF_LENGTH - 1 ? COLORS.bright : along <= -CAR_HALF_LENGTH ? COLORS.dim : COLORS.body;
      for (let across = -CAR_HALF_WIDTH; across <= CAR_HALF_WIDTH; across += CAR_SAMPLE_STEP) {
        const x = car.x + forward.x * along + forward.distance * across;
        const y = CAR_SCREEN_Y - (forward.distance * along - forward.x * across);
        context.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
    }
  }

  function drawHud() {
    drawText(buffer.context, String(currentScore()), 3, 3, { color: COLORS.score });
    if (records.best > 0) {
      drawText(buffer.context, `HI ${records.best}`, menuButton.left - 5, 3, { color: COLORS.dim, align: "right" });
    }
    if (drift.isActive && drift.points >= 1) {
      const text = `X${drift.multiplier} ${Math.round(drift.points * drift.multiplier)}`;
      drawCenteredText(text, 20, { color: drift.isNearEdge && isBlinkOn() ? COLORS.dim : COLORS.bright });
    }
    if (game.banner.time > 0) {
      drawCenteredText(game.banner.text, 30, { scale: 2, color: COLORS.bright });
    }
  }

  function drawVeil() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.veil);
  }

  function drawTitle() {
    drawVeil();
    drawCenteredText("DRIFT", 40, { scale: 4, color: COLORS.bright });
    if (isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO START" : "PRESS SPACE", 96, { color: COLORS.bright });
    }
    const hints = isTouchDevice ? ["HOLD LEFT/RIGHT: STEER", "RELEASE: GO STRAIGHT", "II: PAUSE"] : ["LEFT/RIGHT: STEER", "RELEASE: GO STRAIGHT", "ESC: PAUSE"];
    hints.forEach((hint, index) => drawCenteredText(hint, 118 + index * 9, { color: COLORS.dim }));
    drawCenteredText(`BEST ${records.best}`, 160, { color: COLORS.dim });
    drawCenteredText(`BEST DRIFT ${records.bestDrift}`, 169, { color: COLORS.dim });
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
    drawCenteredText(`BEST ${records.best}   DRIFT ${records.bestDrift}`, 168, { color: COLORS.faint });
  }

  function drawGameOver() {
    drawVeil();
    drawCenteredText("CRASHED", 50, { scale: 2, color: COLORS.bright });
    drawCenteredText(String(game.finalScore), 76, { scale: 2, color: COLORS.score });
    drawCenteredText(game.isNewBest ? "NEW BEST!" : `BEST ${records.best}`, 100, { color: game.isNewBest ? COLORS.bright : COLORS.dim });
    drawCenteredText(`DIST ${Math.floor(car.distance / DISTANCE_UNIT)}`, 112, { color: COLORS.dim });
    drawCenteredText(`TOP DRIFT ${game.runBestDrift}`, 121, { color: COLORS.dim });
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
    drawRoad();
    skidMarks.draw(buffer, car.distance, COLORS.skid);
    drawCar();
    particles.draw(buffer.context);
    if (scene === "play" || scene === "crash") {
      drawHud();
    }
    if (game.state === "paused") {
      drawPauseMenu();
    } else if (scene === "title") {
      drawTitle();
    } else if (scene === "over") {
      drawGameOver();
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
      console.error("Drift crashed", error);
      showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
    },
  });

  resetCar();
  road.reset();
  loop.start();
  powerOn();
}

try {
  startGame();
} catch (error) {
  console.error("Unable to start Drift", error);
  showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
}
