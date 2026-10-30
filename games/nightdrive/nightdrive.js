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
import { SEGMENT_LENGTH, allowedLanes, createTrack } from "./track.js";

const WIDTH = 192;
const HEIGHT = 108;
const HORIZON_Y = 40;
const VERTICAL_SCALE = HEIGHT - HORIZON_Y;
const ROAD_WIDTH = 1000;
const CAMERA_HEIGHT = 1000;
const CAMERA_DEPTH = 1 / Math.tan((50 * Math.PI) / 180);
const PLAYER_Z = CAMERA_HEIGHT * CAMERA_DEPTH;
const DRAW_DISTANCE = 140;
const FOG_DRAW_DISTANCE = 55;
const FOG_DENSITY = 0.06;
const HAZE_LUM = 26;
const CURVE_VISUAL = 0.6;
const MAX_SPEED = SEGMENT_LENGTH * 60;
const CRUISE_SPEED = MAX_SPEED * 0.3;
const ACCELERATION = MAX_SPEED / 4.5;
const RELEASE_DECELERATION = MAX_SPEED / 2.5;
const OFFROAD_LIMIT = MAX_SPEED * 0.35;
const OFFROAD_DECELERATION = MAX_SPEED * 0.9;
const STEER_RATE = 2.4;
const STEER_RESPONSE = 8;
const CENTRIFUGAL = 0.6;
const MAX_PLAYER_X = 2.2;
const PLAYER_WIDTH = 0.27;
const CAR_LENGTH = 300;
const LANE_CHANGE_RATE = 0.7;
const NEAR_MISS_GAP = 0.2;
const NEAR_MISS_SECONDS = 1;
const CRASH_PENALTY_SECONDS = 2;
const HEAD_ON_PENALTY_SECONDS = 5;
const BARRIER_PENALTY_SECONDS = 3;
const CRASH_KNOCK = 0.3;
const TIME_DELTA_SECONDS = 1.2;
const INVULNERABLE_SECONDS = 1.2;
const START_SECONDS = 40;
const CHECKPOINT_BONUS = 32;
const CHECKPOINT_BONUS_MIN = 24;
const CHECKPOINT_BONUS_DECAY = 1;
const TIME_WARNING_SECONDS = 5;
const COUNTDOWN_SECONDS = 3;
const KMH_PER_SPEED = 220 / MAX_SPEED;
const STEER_RANGE = 22;
const ANNOUNCE_LEAD = 110;
const TRAFFIC_SPAWN_INTERVAL = 0.3;
const ONCOMING_LIMIT = 4;
const ENGINE_INTERVAL = 0.07;
const RUMBLE_INTERVAL = 0.08;
const SKY_WIDTH = 512;
const MOON_X = 140;
const GAME_OVER_INPUT_DELAY_SECONDS = 1;
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
const CONTROLLABLE_STATES = new Set(["title", "countdown", "play", "timeup"]);
const DRIVING_STATES = new Set(["countdown", "play", "timeup"]);
const ANNOUNCEMENTS = { twoway: "ONCOMING TRAFFIC", tunnel: "TUNNEL AHEAD", fog: "FOG AHEAD", roadworks: "ROADWORKS AHEAD" };
const CAR_TYPES = { car: { width: 0.27, height: 0.13 }, truck: { width: 0.33, height: 0.3 } };
const OUTLINE_MIN_WIDTH = 5;
const MOON_ROWS =[3, 5, 7, 7, 7, 5, 3];
const GRAYS = Array.from({ length: 256 }, (_, value) => `rgb(${value},${value},${value})`);
const COLORS = {
  bright: "#ffffff",
  dim: "#808080",
  faint: "#505050",
  title: "rgba(0, 0, 0, 0.6)",
  veil: "rgba(0, 0, 0, 0.78)",
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, amount) => from + (to - from) * amount;
const randomBetween = (min, max) => min + Math.random() * (max - min);
const pickRandom = (items) => items[Math.floor(Math.random() * items.length)];
const toCount = (value) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0);
const gray = (lum) => GRAYS[clamp(Math.round(lum), 0, 255)];
const isSameLane = (a, b) => Math.abs(a - b) < 0.01;
const formatKilometers = (meters) => (meters / 1000).toFixed(1);

function sanitizeRecords(raw) {
  return {
    bestDistance: toCount(raw.bestDistance),
    bestStage: toCount(raw.bestStage),
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
    engine: (ratio, isRevving) => audio.tone({ frequency: 50 + ratio * 120 + (isRevving ? 45 : 0), duration: ENGINE_INTERVAL + 0.01, type: "sawtooth", volume: 0.02 }),
    rumble: () => audio.noise({ duration: 0.06, volume: 0.05, highpass: 150 }),
    countdown: (isGo) => audio.tone({ frequency: isGo ? 880 : 440, duration: isGo ? 0.35 : 0.15, volume: 0.12 }),
    crash: () => {
      audio.noise({ duration: 0.5, volume: 0.22, highpass: 200 });
      audio.tone({ frequency: 160, slideTo: 50, duration: 0.4, volume: 0.12 });
    },
    cone: () => audio.tone({ frequency: 700, slideTo: 300, duration: 0.07, volume: 0.08 }),
    nearMiss: () => {
      audio.noise({ duration: 0.18, volume: 0.1, highpass: 2500 });
      audio.tone({ frequency: 990, slideTo: 1480, duration: 0.1, volume: 0.07 });
    },
    checkpoint: () => [659, 784, 988, 1319].forEach((frequency, index) => audio.tone({ frequency, duration: 0.1, delay: index * 0.08, volume: 0.1 })),
    warning: () => audio.tone({ frequency: 1200, duration: 0.06, volume: 0.08 }),
    announce: () => [880, 660].forEach((frequency, index) => audio.tone({ frequency, duration: 0.08, delay: index * 0.1, volume: 0.07 })),
    tunnel: () => audio.noise({ duration: 0.3, volume: 0.08, highpass: 600 }),
    timeUp: () => [523, 392, 330, 262].forEach((frequency, index) => audio.tone({ frequency, duration: 0.2, delay: index * 0.16 })),
    record: () => [523, 659, 784, 1047].forEach((frequency, index) => audio.tone({ frequency, duration: 0.14, delay: 0.7 + index * 0.12 })),
    select: () => audio.tone({ frequency: 880, duration: 0.04, volume: 0.08 }),
    pause: () => audio.noise({ duration: 0.12, volume: 0.08, highpass: 1500 }),
  };
}

function createSky() {
  const stars = Array.from({ length: 48 }, () => ({
    x: Math.random() * SKY_WIDTH,
    y: Math.random() * (HORIZON_Y - 10),
    lum: randomBetween(60, 200),
    phase: Math.random() * Math.PI * 2,
  }));
  const ridge = Array.from({ length: SKY_WIDTH }, (_, x) => {
    const angle = (x / SKY_WIDTH) * Math.PI * 2;
    return Math.max(1, Math.round(7 + 4 * Math.sin(angle * 3) + 3 * Math.sin(angle * 7 + 1) + 2 * Math.sin(angle * 13 + 2)));
  });
  const windows = Array.from({ length: 16 }, () => {
    const x = Math.floor(Math.random() * SKY_WIDTH);
    return { x, y: HORIZON_Y - Math.floor(Math.random() * ridge[x]), phase: Math.random() * Math.PI * 2 };
  });
  return { stars, ridge, windows };
}

function createPlayer() {
  return { x: 0, speed: 0, steer: 0, invulnerable: 0, isOffroad: false, isBraking: false, bounce: 0 };
}

function createRace() {
  return {
    position: 0,
    timeLeft: START_SECONDS,
    stage: 0,
    nearMisses: 0,
    lastPassedIndex: Math.floor(PLAYER_Z / SEGMENT_LENGTH),
    nextSectionIndex: 0,
    fogLevel: 0,
    skyOffset: 0,
    spawnTimer: 0,
    engineTimer: 0,
    rumbleTimer: 0,
    countdownStep: -1,
    warnedSecond: 0,
    isInTunnel: false,
    isRecord: false,
    distance: 0,
    message: { text: "", timer: 0, scale: 1 },
    timeDelta: { text: "", timer: 0 },
  };
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
  const recordsStore = createStore("nightdrive", 1, { bestDistance: 0, bestStage: 0, runs: 0 });
  let records = sanitizeRecords(recordsStore.load());

  const sky = createSky();
  const player = createPlayer();
  const cars = [];
  const carBuckets = Array.from({ length: DRAW_DISTANCE }, () => []);
  const screenPoint = { x: 0, y: 0, unit: 0 };
  const controls = { isHolding: false, offsetX: 0 };
  let track = createTrack();
  let race = createRace();
  let drawDistance = DRAW_DISTANCE;
  const game = {
    state: "title",
    resumeState: "title",
    stateTime: 0,
    time: 0,
    isReady: false,
    isExiting: false,
    hasRequestedImmersive: false,
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

  function setMessage(text, seconds = 1.4, scale = 1) {
    race.message.text = text;
    race.message.timer = seconds;
    race.message.scale = scale;
  }

  function changeTime(seconds) {
    race.timeLeft = Math.max(0, race.timeLeft + seconds);
    race.timeDelta.text = seconds > 0 ? `+${seconds}` : `-${-seconds}`;
    race.timeDelta.timer = TIME_DELTA_SECONDS;
  }

  function playerZ() {
    return race.position + PLAYER_Z;
  }

  function playerScreenY() {
    return HEIGHT - 2 - player.bounce;
  }

  function startRace() {
    track = createTrack();
    race = createRace();
    Object.assign(player, createPlayer());
    cars.length = 0;
    particles.clear();
    track.ensure(DRAW_DISTANCE * 2);
    for (let segmentsAhead = 30; segmentsAhead < DRAW_DISTANCE; segmentsAhead += 25) {
      spawnCar(1, race.position + segmentsAhead * SEGMENT_LENGTH);
    }
    setState("countdown");
  }

  function finishRace() {
    race.distance = Math.floor(race.position / SEGMENT_LENGTH);
    race.isRecord = race.distance > records.bestDistance;
    records.bestDistance = Math.max(records.bestDistance, race.distance);
    records.bestStage = Math.max(records.bestStage, race.stage);
    records.runs += 1;
    recordsStore.save(records);
    if (race.isRecord) {
      sounds.record();
    }
    setState("over");
  }

  function isGasPressed() {
    return controls.isHolding || input.isKeyDown("ArrowUp", "KeyW");
  }

  function steerTarget() {
    const keyboardSteer = (input.isKeyDown("ArrowRight", "KeyD") ? 1 : 0) - (input.isKeyDown("ArrowLeft", "KeyA") ? 1 : 0);
    if (keyboardSteer !== 0) {
      return keyboardSteer;
    }
    return controls.isHolding ? controls.offsetX / STEER_RANGE : 0;
  }

  function applyThrottle(deltaSeconds, canAccelerate) {
    const isGas = canAccelerate && isGasPressed();
    if (isGas) {
      player.speed += ACCELERATION * deltaSeconds;
    } else {
      player.speed -= RELEASE_DECELERATION * deltaSeconds;
    }
    if (player.isOffroad && player.speed > OFFROAD_LIMIT) {
      player.speed = Math.max(OFFROAD_LIMIT, player.speed - OFFROAD_DECELERATION * deltaSeconds);
    }
    player.speed = clamp(player.speed, 0, MAX_SPEED);
    player.isBraking = !isGas;
  }

  function updatePlayer(deltaSeconds, canAccelerate) {
    const segment = track.segmentAt(playerZ());
    const speedRatio = player.speed / MAX_SPEED;
    player.steer += clamp(steerTarget() - player.steer, -STEER_RESPONSE * deltaSeconds, STEER_RESPONSE * deltaSeconds);
    player.x += player.steer * STEER_RATE * deltaSeconds * Math.min(1, speedRatio * 1.6);
    player.x -= CENTRIFUGAL * speedRatio * speedRatio * segment.curve * deltaSeconds;
    player.x = clamp(player.x, -MAX_PLAYER_X, MAX_PLAYER_X);
    player.isOffroad = Math.abs(player.x) > 1;
    player.invulnerable = Math.max(0, player.invulnerable - deltaSeconds);
    applyThrottle(deltaSeconds, canAccelerate);
    player.bounce = player.isOffroad && player.speed > 0 && Math.random() < 0.5 ? 1 : 0;
    race.position += player.speed * deltaSeconds;
    emitDrivingParticles();
  }

  function emitDrivingParticles() {
    const baseY = playerScreenY();
    if (player.isOffroad && player.speed > 0 && Math.random() < 0.6) {
      particles.emit(WIDTH / 2 + pickRandom([-12, 11]), baseY - 1, { count: 1, angle: -Math.PI / 2, spread: 1.6, speed: [15, 40], lifetime: [0.15, 0.35], sizes: [1], fall: 120 });
    }
  }

  function cruise(deltaSeconds) {
    player.speed = CRUISE_SPEED;
    player.x = 0;
    player.steer = 0;
    race.position += player.speed * deltaSeconds;
  }

  function isLaneFree(lane, z, direction, ignoredCar) {
    return !cars.some((car) => car !== ignoredCar && car.direction === direction && Math.abs(car.x - lane) < 0.3 && Math.abs(car.z - z) < SEGMENT_LENGTH * 7);
  }

  function spawnCar(direction, z) {
    const segment = track.segmentAt(z);
    const lanes = allowedLanes(segment, direction);
    if (lanes.length === 0) {
      return;
    }
    const lane = pickRandom(lanes);
    if (!isLaneFree(lane, z, direction, null)) {
      return;
    }
    const type = direction > 0 && Math.random() < 0.2 ? "truck" : "car";
    const speedRange = direction > 0 ? [0.3, 0.55 + Math.min(race.stage * 0.03, 0.15)] : [0.35, 0.55];
    const speed = MAX_SPEED * randomBetween(...speedRange) * (type === "truck" ? 0.85 : 1);
    cars.push({
      z,
      x: lane,
      targetX: lane,
      pendingX: null,
      signalTimer: 0,
      laneTimer: randomBetween(2, 7),
      speed,
      desiredSpeed: speed,
      direction,
      type,
      isPassed: false,
      wasHit: false,
      isGone: false,
      previousRelative: z - playerZ(),
    });
  }

  function spawnTraffic(deltaSeconds) {
    race.spawnTimer -= deltaSeconds;
    if (race.spawnTimer > 0) {
      return;
    }
    race.spawnTimer = TRAFFIC_SPAWN_INTERVAL;
    const sameDirectionCount = cars.filter((car) => car.direction > 0).length;
    if (sameDirectionCount < Math.min(5 + race.stage * 1.5, 14)) {
      spawnCar(1, race.position + randomBetween(0.85, 0.98) * DRAW_DISTANCE * SEGMENT_LENGTH);
    }
    const farZ = race.position + (DRAW_DISTANCE - 4) * SEGMENT_LENGTH;
    const oncomingCount = cars.length - sameDirectionCount;
    if (oncomingCount < ONCOMING_LIMIT && track.segmentAt(farZ).isTwoWay && Math.random() < 0.45) {
      spawnCar(-1, farZ);
    }
  }

  function scheduleLaneChange(car, lane, delay) {
    if (isSameLane(car.pendingX ?? car.targetX, lane)) {
      return;
    }
    car.pendingX = lane;
    car.signalTimer = delay;
  }

  function nearestLane(lanes, x) {
    return lanes.reduce((best, lane) => (Math.abs(lane - x) < Math.abs(best - x) ? lane : best), lanes[0]);
  }

  function steerCar(car, deltaSeconds) {
    const lookZ = Math.max(0, car.z + car.direction * SEGMENT_LENGTH * 25);
    const lanes = allowedLanes(track.segmentAt(lookZ), car.direction);
    if (lanes.length > 0 && !lanes.some((lane) => isSameLane(lane, car.pendingX ?? car.targetX))) {
      scheduleLaneChange(car, nearestLane(lanes, car.x), 0.5);
    }
    car.laneTimer -= deltaSeconds;
    if (car.laneTimer <= 0 && car.pendingX === null) {
      car.laneTimer = randomBetween(3, 8);
      const neighbours = lanes.filter((lane) => !isSameLane(lane, car.targetX) && Math.abs(lane - car.targetX) < 0.8);
      const lane = neighbours.length > 0 && Math.random() < 0.6 ? pickRandom(neighbours) : null;
      if (lane !== null && isLaneFree(lane, car.z, car.direction, car)) {
        scheduleLaneChange(car, lane, 0.9);
      }
    }
    if (car.pendingX !== null) {
      car.signalTimer -= deltaSeconds;
      if (car.signalTimer <= 0) {
        car.targetX = car.pendingX;
        car.pendingX = null;
      }
    }
    car.x += clamp(car.targetX - car.x, -LANE_CHANGE_RATE * deltaSeconds, LANE_CHANGE_RATE * deltaSeconds);
  }

  function followTraffic(car) {
    car.speed = car.desiredSpeed;
    for (const other of cars) {
      const gap = (other.z - car.z) * car.direction;
      if (other !== car && other.direction === car.direction && gap > 0 && gap < SEGMENT_LENGTH * 5 && Math.abs(other.x - car.x) < 0.3) {
        car.speed = Math.min(car.speed, other.speed);
      }
    }
  }

  function updateTraffic(deltaSeconds) {
    spawnTraffic(deltaSeconds);
    for (const car of cars) {
      followTraffic(car);
      car.z += car.speed * car.direction * deltaSeconds;
      steerCar(car, deltaSeconds);
      if (car.direction < 0 && !track.segmentAt(car.z).isTwoWay) {
        car.isGone = true;
      }
    }
    const nearLimit = race.position - SEGMENT_LENGTH * 2;
    const farLimit = race.position + (DRAW_DISTANCE + 60) * SEGMENT_LENGTH;
    for (let index = cars.length - 1; index >= 0; index--) {
      const car = cars[index];
      if (car.isGone || car.z < nearLimit || car.z > farLimit) {
        cars.splice(index, 1);
      }
    }
  }

  function emitCrash(x, count) {
    particles.emit(x, playerScreenY() - 8, { count, angle: -Math.PI / 2, spread: Math.PI * 1.4, speed: [30, 110], lifetime: [0.3, 0.9], sizes: [1, 2, 2], fall: 140 });
  }

  function knockAwayFrom(obstacleX) {
    const side = player.x >= obstacleX ? 1 : -1;
    player.x = clamp(player.x + side * CRASH_KNOCK, -MAX_PLAYER_X, MAX_PLAYER_X);
    player.steer = 0;
  }

  function penalize(text, seconds) {
    player.invulnerable = INVULNERABLE_SECONDS;
    glitch.trigger("goal");
    sounds.crash();
    changeTime(-seconds);
    setMessage(`${text} -${seconds} SEC`, 1.4, 2);
  }

  function crash(car) {
    car.wasHit = true;
    if (car.direction < 0) {
      player.speed = MAX_SPEED * 0.05;
      car.isGone = true;
      emitCrash(WIDTH / 2, 60);
      penalize("HEAD-ON", HEAD_ON_PENALTY_SECONDS);
      return;
    }
    player.speed = Math.min(player.speed, car.speed) * 0.6;
    emitCrash(WIDTH / 2 + (car.x - player.x) * 96, 36);
    knockAwayFrom(car.x);
    penalize("CRASH", CRASH_PENALTY_SECONDS);
  }

  function nearMiss() {
    race.nearMisses += 1;
    changeTime(NEAR_MISS_SECONDS);
    sounds.nearMiss();
    setMessage(`CLOSE! +${NEAR_MISS_SECONDS}`, 0.9);
  }

  function checkTraffic() {
    const currentZ = playerZ();
    for (const car of cars) {
      const relative = car.z - currentZ;
      const lateral = Math.abs(car.x - player.x);
      const halfWidths = (PLAYER_WIDTH + CAR_TYPES[car.type].width) / 2;
      if (!car.wasHit && player.invulnerable <= 0 && Math.abs(relative) < CAR_LENGTH && lateral < halfWidths * 0.85) {
        crash(car);
      } else if (!car.isPassed && car.previousRelative > 0 && relative <= 0) {
        car.isPassed = true;
        if (!car.wasHit && lateral < halfWidths + NEAR_MISS_GAP) {
          nearMiss();
        }
      }
      car.previousRelative = relative;
    }
  }

  function hitCone(cone) {
    cone.isHit = true;
    player.speed *= 0.88;
    glitch.trigger("hit");
    sounds.cone();
    particles.emit(WIDTH / 2 + (cone.x - player.x) * 96, playerScreenY() - 6, { count: 10, angle: -Math.PI / 2, spread: 1.6, speed: [30, 80], lifetime: [0.3, 0.6], sizes: [1, 2], fall: 160 });
  }

  function hitBarrier(barrier) {
    barrier.isHit = true;
    player.speed *= 0.35;
    emitCrash(WIDTH / 2 + (barrier.x - player.x) * 96, 40);
    knockAwayFrom(barrier.x);
    penalize("BARRIER", BARRIER_PENALTY_SECONDS);
  }

  function checkObstacles(segment) {
    for (const sprite of segment.sprites) {
      if (sprite.isHit !== false) {
        continue;
      }
      const lateral = Math.abs(sprite.x - player.x);
      if (sprite.kind === "cone" && lateral < PLAYER_WIDTH / 2 + 0.04) {
        hitCone(sprite);
      } else if (sprite.kind === "barrier" && lateral < PLAYER_WIDTH / 2 + 0.22) {
        hitBarrier(sprite);
      }
    }
  }

  function reachCheckpoint() {
    race.stage += 1;
    const bonus = Math.max(CHECKPOINT_BONUS_MIN, CHECKPOINT_BONUS - (race.stage - 1) * CHECKPOINT_BONUS_DECAY);
    changeTime(bonus);
    glitch.trigger("hit");
    sounds.checkpoint();
    setMessage(`CHECKPOINT +${bonus}`, 2, 1);
  }

  function passSegments() {
    const playerIndex = Math.floor(playerZ() / SEGMENT_LENGTH);
    track.ensure(playerIndex + 1);
    for (let index = race.lastPassedIndex + 1; index <= playerIndex; index++) {
      const segment = track.segments[index];
      checkObstacles(segment);
      if (segment.isCheckpoint) {
        reachCheckpoint();
      }
    }
    race.lastPassedIndex = Math.max(race.lastPassedIndex, playerIndex);
  }

  function announceSections() {
    const playerIndex = Math.floor(playerZ() / SEGMENT_LENGTH);
    while (race.nextSectionIndex < track.sections.length) {
      const section = track.sections[race.nextSectionIndex];
      if (section.startIndex > playerIndex + ANNOUNCE_LEAD) {
        return;
      }
      race.nextSectionIndex += 1;
      if (ANNOUNCEMENTS[section.kind] && section.endIndex > playerIndex) {
        setMessage(ANNOUNCEMENTS[section.kind], 2);
        sounds.announce();
      }
    }
  }

  function updateClock(deltaSeconds) {
    race.timeLeft = Math.max(0, race.timeLeft - deltaSeconds);
    const second = Math.ceil(race.timeLeft);
    if (second <= TIME_WARNING_SECONDS && second > 0 && second !== race.warnedSecond) {
      race.warnedSecond = second;
      sounds.warning();
    }
    if (race.timeLeft <= 0) {
      sounds.timeUp();
      glitch.trigger("goal");
      setMessage("TIME UP", 3, 2);
      setState("timeup");
    }
  }

  function updateCountdown() {
    const step = Math.floor(game.stateTime);
    if (step !== race.countdownStep && step < COUNTDOWN_SECONDS) {
      race.countdownStep = step;
      sounds.countdown(false);
    }
    if (game.stateTime >= COUNTDOWN_SECONDS) {
      sounds.countdown(true);
      setMessage("GO!", 0.8, 3);
      setState("play");
    }
  }

  function updateEnvironment(deltaSeconds) {
    const playerSegment = track.segmentAt(playerZ());
    const fogTarget = track.segmentAt(playerZ() + SEGMENT_LENGTH * 15).isFoggy ? 1 : 0;
    race.fogLevel += clamp(fogTarget - race.fogLevel, -deltaSeconds * 0.7, deltaSeconds * 0.7);
    race.skyOffset += playerSegment.curve * (player.speed / MAX_SPEED) * deltaSeconds * 12;
    const isInTunnel = track.segmentAt(race.position).isTunnel;
    if (isInTunnel !== race.isInTunnel && DRIVING_STATES.has(game.state)) {
      glitch.trigger("tear");
      sounds.tunnel();
    }
    race.isInTunnel = isInTunnel;
    drawDistance = Math.round(lerp(DRAW_DISTANCE, FOG_DRAW_DISTANCE, race.fogLevel));
    race.message.timer = Math.max(0, race.message.timer - deltaSeconds);
    race.timeDelta.timer = Math.max(0, race.timeDelta.timer - deltaSeconds);
  }

  function updateSounds(deltaSeconds) {
    if (!DRIVING_STATES.has(game.state)) {
      return;
    }
    race.engineTimer -= deltaSeconds;
    if (race.engineTimer <= 0) {
      race.engineTimer = ENGINE_INTERVAL;
      sounds.engine(player.speed / MAX_SPEED, game.state === "countdown" && isGasPressed());
    }
    race.rumbleTimer -= deltaSeconds;
    if (player.isOffroad && player.speed > 0 && race.rumbleTimer <= 0) {
      race.rumbleTimer = RUMBLE_INTERVAL;
      sounds.rumble();
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
    if (game.state === "title") {
      cruise(deltaSeconds);
    } else if (game.state === "countdown") {
      updateCountdown();
    } else if (game.state === "play") {
      updatePlayer(deltaSeconds, true);
      updateTraffic(deltaSeconds);
      checkTraffic();
      passSegments();
      announceSections();
      updateClock(deltaSeconds);
    } else if (game.state === "timeup") {
      updatePlayer(deltaSeconds, false);
      updateTraffic(deltaSeconds);
      checkTraffic();
      passSegments();
      if ((player.speed <= 0 && game.stateTime > 1.2) || game.stateTime > 4) {
        finishRace();
      }
    }
    updateEnvironment(deltaSeconds);
    updateSounds(deltaSeconds);
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
      startRace();
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
      startRace();
    } else if (game.state === "paused") {
      const index = point ? pauseItemAt(point) : game.pauseIndex;
      if (index >= 0) {
        game.pauseIndex = index;
        activatePauseItem(index);
      }
    } else if (game.state === "over" && game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS) {
      startRace();
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

  function releaseControls() {
    controls.isHolding = false;
    controls.offsetX = 0;
  }

  const input = createInput(document.querySelector(".game-stage"), {
    onInteraction: () => audio.unlock(),
    onPress: () => {
      controls.isHolding = true;
      controls.offsetX = 0;
    },
    onRelease: releaseControls,
    onDrag: (deltaX) => {
      controls.offsetX = clamp(controls.offsetX + deltaX * display.gestureScale(), -STEER_RANGE, STEER_RANGE);
    },
    onTap: (clientX, clientY) => {
      requestImmersive();
      handleAction(display.clientToBuffer(clientX, clientY));
    },
    onMenu: togglePause,
    isMenuZone: menuButton.containsClient,
    onKey: handleKey,
  });

  function fogged(lum, depth) {
    if (race.fogLevel <= 0) {
      return lum;
    }
    const visibility = Math.exp(-depth * FOG_DENSITY * race.fogLevel);
    return lum * visibility + HAZE_LUM * race.fogLevel * (1 - visibility);
  }

  function spriteRect(x, y, width, height, lum, clip) {
    const bottom = Math.min(y + height, clip);
    if (bottom <= y || lum < 1) {
      return;
    }
    buffer.rect(x, y, width, bottom - y, gray(lum));
  }

  function outlineRect(x, y, width, height, clip) {
    const bottom = Math.min(y + height + 1, clip);
    if (width < OUTLINE_MIN_WIDTH || bottom <= y - 1) {
      return;
    }
    buffer.rect(x - 1, y - 1, width + 2, bottom - y + 1, "#000");
  }

  function drawSky() {
    if (race.isInTunnel) {
      return;
    }
    const clarity = 1 - race.fogLevel;
    const wrap = (x) => ((x % SKY_WIDTH) + SKY_WIDTH) % SKY_WIDTH;
    for (const star of sky.stars) {
      const x = wrap(star.x - race.skyOffset * 0.3);
      if (x < WIDTH) {
        buffer.rect(x, star.y, 1, 1, gray(star.lum * clarity * (0.75 + 0.25 * Math.sin(game.time * 3 + star.phase))));
      }
    }
    const moonX = wrap(MOON_X - race.skyOffset * 0.3);
    MOON_ROWS.forEach((rowWidth, row) => buffer.rect(moonX - rowWidth / 2, 6 + row, rowWidth, 1, gray(210 * clarity)));
    const ridgeOffset = Math.floor(race.skyOffset);
    const ridgeColor = gray(fogged(16, 60));
    for (let x = 0; x < WIDTH; x++) {
      const height = sky.ridge[wrap(x + ridgeOffset)];
      buffer.rect(x, HORIZON_Y - height, 1, height, ridgeColor);
    }
    for (const light of sky.windows) {
      const x = wrap(light.x - ridgeOffset);
      if (x < WIDTH) {
        buffer.rect(x, light.y, 1, 1, gray((90 + 50 * Math.sin(game.time * 2 + light.phase)) * clarity));
      }
    }
    if (race.fogLevel > 0) {
      buffer.rect(0, HORIZON_Y - 10, WIDTH, 30, gray(HAZE_LUM * race.fogLevel * 0.8));
    }
  }

  function project(point, worldX, worldY, depthZ) {
    const scale = CAMERA_DEPTH / depthZ;
    point.x = WIDTH / 2 + scale * worldX * (WIDTH / 2);
    point.y = HORIZON_Y - scale * worldY * VERTICAL_SCALE;
    point.w = scale * ROAD_WIDTH * (WIDTH / 2);
  }

  function segmentPalette(segment, depth) {
    const headlight = Math.exp(-depth / 9);
    const isStripe = Math.floor(segment.index / 3) % 2 === 0;
    const ground = segment.isTunnel ? 12 + 20 * headlight + (isStripe ? 4 : 0) : isStripe ? 6 : 2;
    return {
      ground: gray(fogged(ground, depth)),
      road: gray(fogged(10 + 24 * headlight + (isStripe ? 3 : 0), depth)),
      beam: gray(fogged(22 + 40 * Math.exp(-depth / 7) + (isStripe ? 3 : 0), depth)),
      edge: gray(fogged(60 + 150 * Math.exp(-depth / 35), depth)),
      lane: gray(fogged(50 + 150 * Math.exp(-depth / 28), depth)),
      isDash: Math.floor(segment.index / 4) % 2 === 0,
    };
  }

  function drawLaneLines(segment, palette, centerX, halfWidth, row, lineWidth) {
    if (segment.isTwoWay) {
      buffer.rect(centerX - lineWidth * 1.5, row, lineWidth, 1, palette.lane);
      buffer.rect(centerX + lineWidth * 0.5, row, lineWidth, 1, palette.lane);
      return;
    }
    for (const boundary of [-1 / 3, 1 / 3]) {
      const isClosedBoundary = segment.closedLane >= 0 && Math.sign(boundary) === Math.sign(segment.lanes[segment.closedLane]);
      if (palette.isDash || isClosedBoundary) {
        buffer.rect(centerX + boundary * halfWidth - lineWidth / 2, row, lineWidth, 1, palette.lane);
      }
    }
  }

  function drawSegment(segment, depth, clipBottom) {
    const { p1, p2 } = segment;
    const top = Math.max(0, Math.ceil(p2.y));
    const bottom = Math.min(HEIGHT, Math.ceil(p1.y), Math.ceil(clipBottom));
    if (bottom <= top) {
      return;
    }
    const palette = segmentPalette(segment, depth);
    for (let row = top; row < bottom; row++) {
      const amount = (row + 0.5 - p2.y) / (p1.y - p2.y);
      const centerX = lerp(p2.x, p1.x, amount);
      const halfWidth = lerp(p2.w, p1.w, amount);
      const lineWidth = Math.max(1, halfWidth * 0.035);
      buffer.rect(0, row, WIDTH, 1, palette.ground);
      buffer.rect(centerX - halfWidth, row, halfWidth * 2, 1, palette.road);
      const beamLeft = Math.max(centerX - halfWidth, WIDTH / 2 - halfWidth * 0.55);
      const beamRight = Math.min(centerX + halfWidth, WIDTH / 2 + halfWidth * 0.55);
      if (beamRight > beamLeft) {
        buffer.rect(beamLeft, row, beamRight - beamLeft, 1, palette.beam);
      }
      buffer.rect(centerX - halfWidth, row, lineWidth, 1, palette.edge);
      buffer.rect(centerX + halfWidth - lineWidth, row, lineWidth, 1, palette.edge);
      drawLaneLines(segment, palette, centerX, halfWidth, row, lineWidth);
    }
  }

  function drawRoad() {
    const baseIndex = Math.floor(race.position / SEGMENT_LENGTH);
    track.ensure(baseIndex + DRAW_DISTANCE + 1);
    const baseSegment = track.segments[baseIndex];
    const basePercent = (race.position % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const playerSegment = track.segmentAt(playerZ());
    const playerY = lerp(playerSegment.y1, playerSegment.y2, (playerZ() % SEGMENT_LENGTH) / SEGMENT_LENGTH);
    const cameraY = playerY + CAMERA_HEIGHT;
    const cameraX = player.x * ROAD_WIDTH;
    let curveX = 0;
    let curveDelta = -baseSegment.curve * CURVE_VISUAL * basePercent;
    let maxY = HEIGHT;
    for (let depth = 0; depth < drawDistance; depth++) {
      const segment = track.segments[baseIndex + depth];
      const nearZ = segment.index * SEGMENT_LENGTH - race.position;
      segment.clip = maxY;
      segment.depth = depth;
      segment.isProjected = nearZ > CAMERA_DEPTH;
      if (segment.isProjected) {
        project(segment.p1, curveX - cameraX, segment.y1 - cameraY, nearZ);
        project(segment.p2, curveX + curveDelta - cameraX, segment.y2 - cameraY, nearZ + SEGMENT_LENGTH);
      }
      curveX += curveDelta;
      curveDelta += segment.curve * CURVE_VISUAL;
      if (!segment.isProjected || segment.p2.y >= segment.p1.y || segment.p2.y >= maxY) {
        continue;
      }
      drawSegment(segment, depth, maxY);
      maxY = Math.min(maxY, segment.p2.y);
    }
    return baseIndex;
  }

  function locate(segment, fraction, x) {
    const { p1, p2 } = segment;
    screenPoint.unit = lerp(p1.w, p2.w, fraction);
    screenPoint.x = lerp(p1.x, p2.x, fraction) + screenPoint.unit * x;
    screenPoint.y = lerp(p1.y, p2.y, fraction);
    return screenPoint;
  }

  function isBlinkOn(rate = 2.5) {
    return Math.floor(game.time * rate) % 2 === 0;
  }

  function drawPost(point, depth, clip) {
    const { x, y, unit } = point;
    const width = Math.max(1, unit * 0.03);
    const height = unit * 0.22;
    spriteRect(x - width / 2, y - height, width, height, fogged(20 + 50 * Math.exp(-depth / 10), depth), clip);
    const reflector = Math.max(1, unit * 0.04);
    spriteRect(x - reflector / 2, y - height, reflector, reflector, fogged(90 + 160 * Math.exp(-depth / 30), depth), clip);
  }

  function drawChevron(point, depth, clip, sprite) {
    const { x, y, unit } = point;
    const width = Math.max(2, unit * 0.24);
    const height = Math.max(1, unit * 0.16);
    const top = y - unit * 0.3;
    spriteRect(x - 0.5, top, 1, y - top, fogged(20, depth), clip);
    spriteRect(x - width / 2, top, width, height, fogged(40 + 150 * Math.exp(-depth / 30), depth), clip);
    if (height >= 6 && top + height <= clip) {
      const scale = Math.max(1, Math.floor(height / 6));
      drawText(buffer.context, sprite.direction > 0 ? ">" : "<", x, top + (height - 5 * scale) / 2, { scale, color: "#000", align: "center" });
    }
  }

  function drawSign(point, depth, clip) {
    const { x, y, unit } = point;
    const size = Math.max(2, unit * 0.2);
    const top = y - unit * 0.36;
    spriteRect(x - 0.5, top, 1, y - top, fogged(20, depth), clip);
    spriteRect(x - size / 2, top, size, size, fogged(isBlinkOn(4) ? 230 : 120, depth), clip);
    if (size >= 7 && top + size <= clip) {
      const scale = Math.max(1, Math.floor(size / 7));
      drawText(buffer.context, "!", x, top + (size - 5 * scale) / 2, { scale, color: "#000", align: "center" });
    }
  }

  function drawCone(point, depth, clip, sprite) {
    const { x, y, unit } = point;
    const width = Math.max(1, unit * 0.06);
    const height = Math.max(1, unit * 0.08);
    const lum = fogged(60 + 150 * Math.exp(-depth / 20), depth);
    spriteRect(x - width / 2, y - height / 2, width, height / 2, lum, clip);
    spriteRect(x - width / 4, y - height, width / 2, height / 2, lum * 0.8, clip);
    if (sprite.hasLamp && isBlinkOn(5)) {
      spriteRect(x - 0.5, y - height - 1, 1, 1, fogged(255, depth), clip);
    }
  }

  function drawBarrier(point, depth, clip) {
    const { x, y, unit } = point;
    const width = Math.max(3, unit * 0.5);
    const height = Math.max(1, unit * 0.1);
    const top = y - unit * 0.16;
    const legLum = fogged(30, depth);
    spriteRect(x - width / 2, top, 1, y - top, legLum, clip);
    spriteRect(x + width / 2 - 1, top, 1, y - top, legLum, clip);
    for (let stripe = 0; stripe < 4; stripe++) {
      spriteRect(x - width / 2 + (stripe * width) / 4, top, width / 4, height, fogged(stripe % 2 === 0 ? 210 : 40, depth), clip);
    }
    const lamp = Math.max(1, unit * 0.04);
    const isLeftLit = isBlinkOn(3);
    spriteRect(x - width / 2, top - lamp, lamp, lamp, fogged(isLeftLit ? 255 : 50, depth), clip);
    spriteRect(x + width / 2 - lamp, top - lamp, lamp, lamp, fogged(isLeftLit ? 50 : 255, depth), clip);
  }

  function drawRib(point, depth, clip) {
    const { x, y, unit } = point;
    const halfSpan = unit * 1.15;
    const top = y - unit * 0.95;
    const lineWidth = Math.max(1, unit * 0.03);
    const lum = fogged(14 + 45 * Math.exp(-depth / 12), depth);
    spriteRect(x - halfSpan, top, lineWidth, y - top, lum, clip);
    spriteRect(x + halfSpan - lineWidth, top, lineWidth, y - top, lum, clip);
    spriteRect(x - halfSpan, top, halfSpan * 2, lineWidth, lum, clip);
  }

  function drawLamp(point, depth, clip) {
    const { x, y, unit } = point;
    const width = Math.max(1, unit * 0.14);
    const height = Math.max(1, unit * 0.025);
    spriteRect(x - width / 2, y - unit * 0.9, width, height, fogged(230, depth), clip);
  }

  function drawPortal(point, depth, clip) {
    const { x, y, unit } = point;
    const halfSpan = unit * 1.15;
    const top = y - unit * 0.95;
    const face = fogged(18, depth);
    const summit = y - unit * 2.2;
    const shoulder = y - unit * 1.5;
    spriteRect(x - unit * 2.4, summit, unit * 4.8, top - summit, face, clip);
    spriteRect(x - unit * 4.5, shoulder, unit * 2.1, y - shoulder, face, clip);
    spriteRect(x + unit * 2.4, shoulder, unit * 2.1, y - shoulder, face, clip);
    spriteRect(x - unit * 2.4, top, unit * 2.4 - halfSpan, y - top, face, clip);
    spriteRect(x + halfSpan, top, unit * 2.4 - halfSpan, y - top, face, clip);
    const lineWidth = Math.max(1, unit * 0.04);
    const frame = fogged(70, depth);
    spriteRect(x - halfSpan - lineWidth, top - lineWidth, halfSpan * 2 + lineWidth * 2, lineWidth, frame, clip);
    spriteRect(x - halfSpan - lineWidth, top, lineWidth, y - top, frame, clip);
    spriteRect(x + halfSpan, top, lineWidth, y - top, frame, clip);
  }

  function drawGantry(point, depth, clip) {
    const { x, y, unit } = point;
    const halfSpan = unit * 1.3;
    const top = y - unit * 1.0;
    const beamHeight = Math.max(1, unit * 0.16);
    const postWidth = Math.max(1, unit * 0.05);
    const postLum = fogged(50 + 60 * Math.exp(-depth / 15), depth);
    spriteRect(x - halfSpan, top, postWidth, y - top, postLum, clip);
    spriteRect(x + halfSpan - postWidth, top, postWidth, y - top, postLum, clip);
    spriteRect(x - halfSpan, top, halfSpan * 2, beamHeight, fogged(190, depth), clip);
    const lightCount = 6;
    for (let light = 0; light < lightCount; light++) {
      const isLit = (light + Math.floor(game.time * 6)) % 2 === 0;
      const lightX = x - halfSpan + ((light + 0.5) * halfSpan * 2) / lightCount;
      spriteRect(lightX, top + beamHeight, Math.max(1, unit * 0.03), Math.max(1, unit * 0.03), fogged(isLit ? 255 : 60, depth), clip);
    }
    const textScale = Math.floor(Math.min(beamHeight / 6, (halfSpan * 2) / 44));
    if (textScale >= 1 && top + beamHeight <= clip) {
      drawText(buffer.context, "CHECKPOINT", x, top + (beamHeight - 5 * textScale) / 2, { scale: textScale, color: "#000", align: "center" });
    }
  }

  const SPRITE_PAINTERS = {
    post: drawPost,
    chevron: drawChevron,
    sign: drawSign,
    cone: drawCone,
    barrier: drawBarrier,
    rib: drawRib,
    lamp: drawLamp,
    portal: drawPortal,
    gantry: drawGantry,
  };

  function drawRearCar(car, point, depth, clip) {
    const { x, y, unit } = point;
    const type = CAR_TYPES[car.type];
    const width = Math.max(2, type.width * unit);
    const height = Math.max(1, type.height * unit);
    const body = fogged(110 + 70 * Math.exp(-depth / 25), depth);
    const lightWidth = Math.max(1, width * 0.18);
    const lightHeight = Math.max(1, height * (car.type === "truck" ? 0.1 : 0.18));
    let lightY = y - height * 0.5;
    if (car.type === "truck") {
      outlineRect(x - width / 2, y - height, width, height, clip);
      spriteRect(x - width / 2, y - height, width, height, body, clip);
      spriteRect(x - width * 0.4, y - height * 0.85, width * 0.8, height * 0.5, body * 0.7, clip);
      const marker = Math.max(1, width * 0.06);
      spriteRect(x - width / 2, y - height, marker, marker, fogged(255, depth), clip);
      spriteRect(x + width / 2 - marker, y - height, marker, marker, fogged(255, depth), clip);
      lightY = y - height * 0.25;
    } else {
      outlineRect(x - width / 2, y - height * 0.65, width, height * 0.65, clip);
      outlineRect(x - width * 0.33, y - height, width * 0.66, height * 0.35, clip);
      spriteRect(x - width / 2, y - height * 0.65, width, height * 0.65, body, clip);
      spriteRect(x - width * 0.33, y - height, width * 0.66, height * 0.35, body * 0.75, clip);
      spriteRect(x - width * 0.26, y - height * 0.9, width * 0.52, height * 0.2, fogged(25, depth), clip);
    }
    spriteRect(x - width / 2, lightY, width, lightHeight, fogged(30, depth), clip);
    const tail = fogged(car.speed < car.desiredSpeed ? 255 : 200, depth);
    spriteRect(x - width / 2, lightY, lightWidth, lightHeight, tail, clip);
    spriteRect(x + width / 2 - lightWidth, lightY, lightWidth, lightHeight, tail, clip);
    if (car.pendingX !== null && isBlinkOn(6)) {
      const side = car.pendingX > car.x ? 1 : -1;
      spriteRect(x + side * (width / 2) - (side > 0 ? 0 : lightWidth), lightY - lightHeight, lightWidth, lightHeight, fogged(255, depth), clip);
    }
  }

  function drawOncomingCar(point, depth, clip) {
    const { x, y, unit } = point;
    const width = Math.max(2, CAR_TYPES.car.width * unit);
    const height = Math.max(1, CAR_TYPES.car.height * unit);
    const body = fogged(90 + 60 * Math.exp(-depth / 25), depth);
    spriteRect(x - width * 0.6, y, width * 1.2, Math.max(1, height * 0.8), fogged(40, depth), clip);
    spriteRect(x - width * 0.65, y - height * 0.6, width * 1.3, height * 0.5, fogged(55, depth), clip);
    outlineRect(x - width / 2, y - height * 0.65, width, height * 0.65, clip);
    outlineRect(x - width * 0.33, y - height, width * 0.66, height * 0.35, clip);
    spriteRect(x - width / 2, y - height * 0.65, width, height * 0.65, body, clip);
    spriteRect(x - width * 0.33, y - height, width * 0.66, height * 0.35, body * 0.75, clip);
    spriteRect(x - width * 0.26, y - height * 0.9, width * 0.52, height * 0.2, fogged(25, depth), clip);
    const lightWidth = Math.max(1, width * 0.22);
    const lightHeight = Math.max(1, height * 0.2);
    spriteRect(x - width / 2 + width * 0.04, y - height * 0.45, lightWidth, lightHeight, fogged(255, depth * 0.5), clip);
    spriteRect(x + width / 2 - width * 0.04 - lightWidth, y - height * 0.45, lightWidth, lightHeight, fogged(255, depth * 0.5), clip);
  }

  function drawCar(car, segment, depth) {
    const fraction = (car.z % SEGMENT_LENGTH) / SEGMENT_LENGTH;
    const point = locate(segment, fraction, car.x);
    if (car.direction > 0) {
      drawRearCar(car, point, depth, segment.clip);
    } else {
      drawOncomingCar(point, depth, segment.clip);
    }
  }

  function fillCarBuckets(baseIndex) {
    carBuckets.forEach((bucket) => {
      bucket.length = 0;
    });
    for (const car of cars) {
      const depth = Math.floor(car.z / SEGMENT_LENGTH) - baseIndex;
      if (depth > 0 && depth < drawDistance) {
        carBuckets[depth].push(car);
      }
    }
  }

  function drawSprites(baseIndex) {
    fillCarBuckets(baseIndex);
    for (let depth = drawDistance - 1; depth > 0; depth--) {
      const segment = track.segments[baseIndex + depth];
      if (!segment.isProjected) {
        continue;
      }
      for (const sprite of segment.sprites) {
        if (!sprite.isHit) {
          SPRITE_PAINTERS[sprite.kind](locate(segment, 0, sprite.x), depth, segment.clip, sprite);
        }
      }
      for (const car of carBuckets[depth]) {
        drawCar(car, segment, depth);
      }
    }
  }

  function drawPlayer() {
    if (player.invulnerable > 0 && isBlinkOn(10)) {
      return;
    }
    const centerX = Math.round(WIDTH / 2);
    const baseY = playerScreenY();
    const lean = Math.round(player.steer);
    buffer.rect(centerX - 14, baseY - 4, 28, 5, "#000");
    buffer.rect(centerX - 13, baseY - 10, 26, 9, "#000");
    buffer.rect(centerX - 9 + lean, baseY - 14, 18, 6, "#000");
    buffer.rect(centerX - 13, baseY - 3, 4, 3, gray(40));
    buffer.rect(centerX + 9, baseY - 3, 4, 3, gray(40));
    buffer.rect(centerX - 12, baseY - 9, 24, 7, gray(160));
    buffer.rect(centerX - 8 + lean, baseY - 13, 16, 4, gray(120));
    buffer.rect(centerX - 7 + lean, baseY - 12, 14, 2, gray(20));
    buffer.rect(centerX - 12, baseY - 8, 24, 3, gray(30));
    const tail = gray(player.isBraking ? 255 : 170);
    const tailHeight = player.isBraking ? 3 : 2;
    buffer.rect(centerX - 12, baseY - 8, 5, tailHeight, tail);
    buffer.rect(centerX + 7, baseY - 8, 5, tailHeight, tail);
    buffer.rect(centerX - 3, baseY - 4, 6, 2, gray(230));
  }

  function drawCenteredText(text, y, options) {
    drawText(buffer.context, text, WIDTH / 2, y, { align: "center", ...options });
  }

  function drawTimeDelta(x) {
    const { text, timer } = race.timeDelta;
    if (timer <= 0 || text === "") {
      return;
    }
    const isPenalty = text.startsWith("-");
    if (!isPenalty || isBlinkOn(8)) {
      drawText(buffer.context, text, x, 5, { scale: 2, color: isPenalty ? COLORS.bright : COLORS.dim });
    }
  }

  function drawHud() {
    const seconds = Math.ceil(race.timeLeft);
    const timerText = String(seconds);
    const isLow = seconds <= TIME_WARNING_SECONDS;
    if (!isLow || isBlinkOn(4)) {
      drawText(buffer.context, timerText, 4, 3, { scale: 3, color: COLORS.bright });
    }
    drawTimeDelta(8 + measureText(timerText, 3));
    const meters = Math.floor(race.position / SEGMENT_LENGTH);
    drawCenteredText(`${formatKilometers(meters)} KM`, 3, { color: COLORS.bright });
    drawCenteredText(`STAGE ${race.stage + 1}`, 10, { color: COLORS.faint });
    const speedText = String(Math.round(player.speed * KMH_PER_SPEED));
    drawText(buffer.context, speedText, 4, HEIGHT - 12, { scale: 2, color: COLORS.bright });
    drawText(buffer.context, "KMH", 6 + measureText(speedText, 2), HEIGHT - 8, { color: COLORS.dim });
  }

  function drawMessage() {
    const { text, timer, scale } = race.message;
    if (timer <= 0 || text === "") {
      return;
    }
    const y = scale >= 3 ? 26 : 24;
    const width = measureText(text, scale);
    buffer.rect(WIDTH / 2 - width / 2 - 2, y - 2, width + 4, 5 * scale + 4, "#000");
    drawCenteredText(text, y, { scale, color: COLORS.bright });
  }

  function drawCountdown() {
    const label = String(COUNTDOWN_SECONDS - Math.floor(game.stateTime));
    drawCenteredText(label, 24, { scale: 5, color: COLORS.bright });
    if (isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "HOLD TO REV" : "HOLD UP TO REV", 56, { color: COLORS.dim });
    }
  }

  function drawTitle() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.title);
    drawCenteredText("NIGHT DRIVE", 12, { scale: 3, color: COLORS.bright });
    drawCenteredText("REACH EACH CHECKPOINT IN TIME", 34, { color: COLORS.dim });
    if (isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO START" : "PRESS SPACE TO START", 50, { color: COLORS.bright });
    }
    drawCenteredText(isTouchDevice ? "HOLD: GAS   DRAG: STEER" : "UP: GAS   LEFT/RIGHT: STEER", 66, { color: COLORS.dim });
    drawCenteredText(isTouchDevice ? "II: PAUSE" : "ESC: PAUSE", 74, { color: COLORS.dim });
    drawCenteredText(`CLOSE PASS +${NEAR_MISS_SECONDS} SEC   CRASH -${CRASH_PENALTY_SECONDS} SEC`, 84, { color: COLORS.bright });
    drawCenteredText(`BEST ${formatKilometers(records.bestDistance)} KM   STAGE ${records.bestStage}`, 94, { color: COLORS.dim });
  }

  function drawPauseMenu() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.veil);
    drawCenteredText(game.pauseView === "settings" ? "SETTINGS" : "PAUSED", 18, { scale: 2, color: COLORS.bright });
    currentPauseItems().forEach((item, index) => {
      const isSelected = index === game.pauseIndex;
      const y = PAUSE_MENU_TOP + index * PAUSE_ITEM_SPACING;
      drawCenteredText(item.label, y, { color: isSelected ? COLORS.bright : COLORS.dim });
      if (isSelected) {
        drawText(buffer.context, ">", Math.floor(WIDTH / 2 - measureText(item.label) / 2) - 8, y, { color: COLORS.bright });
      }
    });
    drawCenteredText(`BEST ${formatKilometers(records.bestDistance)} KM   STAGE ${records.bestStage}`, 96, { color: COLORS.faint });
  }

  function drawGameOver() {
    buffer.rect(0, 0, WIDTH, HEIGHT, COLORS.veil);
    drawCenteredText("TIME UP", 12, { scale: 3, color: COLORS.bright });
    drawCenteredText(`${formatKilometers(race.distance)} KM`, 34, { scale: 2, color: COLORS.bright });
    drawCenteredText(`CHECKPOINTS ${race.stage}   CLOSE CALLS ${race.nearMisses}`, 52, { color: COLORS.dim });
    if (race.isRecord) {
      if (isBlinkOn(4)) {
        drawCenteredText("NEW RECORD!", 62, { color: COLORS.bright });
      }
    } else {
      drawCenteredText(`BEST ${formatKilometers(records.bestDistance)} KM`, 62, { color: COLORS.dim });
    }
    if (game.stateTime >= GAME_OVER_INPUT_DELAY_SECONDS && isBlinkOn()) {
      drawCenteredText(isTouchDevice ? "TAP TO DRIVE AGAIN" : "SPACE TO DRIVE AGAIN", 86, { color: COLORS.bright });
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
    drawSky();
    const baseIndex = drawRoad();
    drawSprites(baseIndex);
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
    } else if (scene === "countdown") {
      drawCountdown();
    } else {
      drawMessage();
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
      console.error("Night Drive crashed", error);
      showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
    },
  });

  loop.start();
  powerOn();
}

try {
  startGame();
} catch (error) {
  console.error("Unable to start Night Drive", error);
  showSystemMessage("SYSTEM FAILURE :: RELOAD PAGE");
}
