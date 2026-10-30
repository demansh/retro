export const SEGMENT_LENGTH = 200;

const HIGHWAY_LANES = [-2 / 3, 0, 2 / 3];
const TWO_WAY_LANES = [-0.5, 0.5];
const POST_SPACING = 8;
const CHEVRON_SPACING = 6;
const CHEVRON_MIN_CURVE = 3;
const RIB_SPACING = 3;
const LAMP_SPACING = 6;
const CONE_SPACING = 3;
const CONE_TAPER = 12;
const BARRIER_START = 14;
const BARRIER_SPACING = 45;
const SIGN_LEAD = 40;
const INTRO_LENGTH = 90;
const CHECKPOINT_RUNWAY = 30;
const FEATURE_KINDS = ["twoway", "tunnel", "fog", "roadworks"];

const randomBetween = (min, max) => min + Math.random() * (max - min);
const randomInt = (min, max) => Math.floor(randomBetween(min, max + 1));
const randomSign = () => (Math.random() < 0.5 ? -1 : 1);
const easeIn = (from, to, amount) => from + (to - from) * amount * amount;
const easeOut = (from, to, amount) => from + (to - from) * (1 - (1 - amount) * (1 - amount));
const easeInOut = (from, to, amount) => from + (to - from) * (0.5 - Math.cos(amount * Math.PI) / 2);
const lerp = (from, to, amount) => from + (to - from) * amount;

function createFeature(kind) {
  return {
    kind,
    lanes: kind === "twoway" ? TWO_WAY_LANES : HIGHWAY_LANES,
    isTwoWay: kind === "twoway",
    isTunnel: kind === "tunnel",
    isFoggy: kind === "fog",
    closedLane: kind === "roadworks" ? (Math.random() < 0.5 ? 0 : 2) : -1,
  };
}

function createProjection() {
  return { x: 0, y: 0, w: 0 };
}

export function allowedLanes(segment, direction) {
  if (segment.isTwoWay) {
    return direction > 0 ? [segment.lanes[1]] : [segment.lanes[0]];
  }
  if (direction < 0) {
    return [];
  }
  return segment.lanes.filter((_, index) => index !== segment.closedLane);
}

export function createTrack() {
  const segments = [];
  const sections = [];
  let stage = 0;

  const maxCurve = () => Math.min(2.5 + stage * 0.5, 5.5);
  const maxHill = () => Math.min(1500 + stage * 400, 4000);

  function lastY() {
    return segments.length > 0 ? segments[segments.length - 1].y2 : 0;
  }

  function addSegment(curve, y, feature) {
    segments.push({
      index: segments.length,
      curve,
      y1: lastY(),
      y2: y,
      lanes: feature.lanes,
      isTwoWay: feature.isTwoWay,
      isTunnel: feature.isTunnel,
      isFoggy: feature.isFoggy,
      closedLane: feature.closedLane,
      isCheckpoint: false,
      sprites: [],
      p1: createProjection(),
      p2: createProjection(),
      clip: 0,
      depth: 0,
      isProjected: false,
    });
  }

  function addPiece(length, curve, hill, feature) {
    const enter = Math.floor(length * 0.25);
    const leave = enter;
    const hold = length - enter - leave;
    const startY = lastY();
    const endY = startY + hill;
    for (let step = 0; step < enter; step++) {
      addSegment(easeIn(0, curve, step / enter), easeInOut(startY, endY, step / length), feature);
    }
    for (let step = 0; step < hold; step++) {
      addSegment(curve, easeInOut(startY, endY, (enter + step) / length), feature);
    }
    for (let step = 0; step < leave; step++) {
      addSegment(easeOut(curve, 0, step / leave), easeInOut(startY, endY, (enter + hold + step) / length), feature);
    }
  }

  function addSprite(index, sprite) {
    segments[index]?.sprites.push(sprite);
  }

  function decorateRoadside(index, segment) {
    if (index % POST_SPACING === 0) {
      addSprite(index, { kind: "post", x: -1.25 });
      addSprite(index, { kind: "post", x: 1.25 });
    }
    if (Math.abs(segment.curve) >= CHEVRON_MIN_CURVE && index % CHEVRON_SPACING === 0) {
      const direction = Math.sign(segment.curve);
      addSprite(index, { kind: "chevron", x: -1.4 * direction, direction });
    }
  }

  function decorateTunnel(index, offset) {
    if (offset === 0) {
      addSprite(index, { kind: "portal", x: 0 });
    }
    if (offset % RIB_SPACING === 0) {
      addSprite(index, { kind: "rib", x: 0 });
    }
    if (offset % LAMP_SPACING === 0) {
      addSprite(index, { kind: "lamp", x: 0 });
    }
  }

  function decorateRoadworks(index, offset, length, feature) {
    const laneX = feature.lanes[feature.closedLane];
    const lineX = laneX > 0 ? 1 / 3 : -1 / 3;
    const edgeX = laneX > 0 ? 1 : -1;
    const distanceToEnd = length - 1 - offset;
    const taper = Math.min(offset, distanceToEnd) / CONE_TAPER;
    if (offset % CONE_SPACING === 0) {
      addSprite(index, { kind: "cone", x: lerp(edgeX, lineX, Math.min(1, taper)), hasLamp: offset % (CONE_SPACING * 4) === 0, isHit: false });
    }
    if (offset >= BARRIER_START && distanceToEnd >= BARRIER_START && (offset - BARRIER_START) % BARRIER_SPACING === 0) {
      addSprite(index, { kind: "barrier", x: laneX, isHit: false });
    }
  }

  function decorate(section, feature) {
    const length = section.endIndex - section.startIndex + 1;
    if (feature.kind !== "plain") {
      addSprite(section.startIndex - SIGN_LEAD, { kind: "sign", x: 1.45 });
    }
    for (let index = section.startIndex; index <= section.endIndex; index++) {
      const offset = index - section.startIndex;
      if (feature.isTunnel) {
        decorateTunnel(index, offset);
      } else {
        decorateRoadside(index, segments[index]);
      }
      if (feature.closedLane >= 0) {
        decorateRoadworks(index, offset, length, feature);
      }
    }
  }

  function addSection(kind, length, { isStraight = false } = {}) {
    const feature = createFeature(kind);
    const startIndex = segments.length;
    let remaining = length;
    while (remaining > 0) {
      const pieceLength = Math.min(remaining, randomInt(40, 110));
      const curve = isStraight || Math.random() < 0.25 ? 0 : randomSign() * randomBetween(1, maxCurve());
      const hill = isStraight || feature.isTunnel || Math.random() < 0.4 ? 0 : randomSign() * randomBetween(600, maxHill());
      addPiece(pieceLength, curve, hill, feature);
      remaining -= pieceLength;
    }
    const section = { kind, startIndex, endIndex: segments.length - 1, isAnnounced: false };
    sections.push(section);
    decorate(section, feature);
  }

  function pickFeature(previousKind) {
    const candidates = FEATURE_KINDS.filter((kind) => kind !== previousKind && (kind !== "fog" || stage > 0));
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function addCheckpoint() {
    addSection("plain", CHECKPOINT_RUNWAY, { isStraight: true });
    const index = segments.length - Math.floor(CHECKPOINT_RUNWAY / 2);
    segments[index].isCheckpoint = true;
    addSprite(index, { kind: "gantry", x: 0 });
  }

  function addStage() {
    const startLength = segments.length;
    const targetLength = Math.min(1200 + stage * 80, 1800);
    if (stage === 0) {
      addSection("plain", INTRO_LENGTH, { isStraight: true });
    }
    let previousKind = "plain";
    while (segments.length - startLength < targetLength) {
      const kind = pickFeature(previousKind);
      addSection(kind, randomInt(160, 300));
      addSection("plain", randomInt(60, 140));
      previousKind = kind;
    }
    addCheckpoint();
    stage += 1;
  }

  function ensure(segmentCount) {
    while (segments.length < segmentCount) {
      addStage();
    }
  }

  function segmentAt(z) {
    const index = Math.max(0, Math.floor(z / SEGMENT_LENGTH));
    ensure(index + 1);
    return segments[index];
  }

  return { segments, sections, ensure, segmentAt };
}
