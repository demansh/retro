const TEAR_INTERVAL_SECONDS = [5, 15];

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function createGlitch({ width, height, reducedMotion = false }) {
  const strength = reducedMotion ? 0.3 : 1;
  const tear = { remaining: 0, y: 0, height: 0, offset: 0 };
  const shake = { remaining: 0, amplitude: 0, x: 0, y: 0 };
  const storm = { remaining: 0, duration: 0 };
  let flash = 0;
  let roll = 0;
  let rollSpeed = 0;
  let nextTearIn = randomBetween(...TEAR_INTERVAL_SECONDS);

  function startTear(minOffset, maxOffset, duration) {
    tear.remaining = duration;
    tear.y = Math.random();
    tear.height = randomBetween(0.02, 0.12);
    tear.offset = randomBetween(minOffset, maxOffset) * (Math.random() < 0.5 ? -1 : 1) * strength;
  }

  function startShake(amplitude, duration) {
    shake.amplitude = Math.max(shake.amplitude, reducedMotion ? 0 : amplitude);
    shake.remaining = Math.max(shake.remaining, duration);
  }

  function trigger(kind) {
    if (kind === "tear") {
      startTear(0.01, 0.04, randomBetween(0.05, 0.1));
    } else if (kind === "hit") {
      startShake(1, 0.1);
      flash = Math.max(flash, 0.12 * strength);
    } else if (kind === "goal") {
      storm.remaining = 0.35;
      storm.duration = 0.35;
      rollSpeed = reducedMotion ? 0 : randomBetween(1.5, 3) * (Math.random() < 0.5 ? -1 : 1);
      startShake(3, 0.3);
      flash = Math.max(flash, 0.5 * strength);
    }
  }

  function update(deltaSeconds) {
    nextTearIn -= deltaSeconds;
    if (nextTearIn <= 0) {
      trigger("tear");
      nextTearIn = randomBetween(...TEAR_INTERVAL_SECONDS);
    }
    tear.remaining = Math.max(0, tear.remaining - deltaSeconds);
    shake.remaining = Math.max(0, shake.remaining - deltaSeconds);
    if (shake.remaining > 0) {
      shake.x = Math.round(randomBetween(-1, 1) * shake.amplitude);
      shake.y = Math.round(randomBetween(-1, 1) * shake.amplitude);
    } else {
      shake.amplitude = 0;
      shake.x = 0;
      shake.y = 0;
    }
    storm.remaining = Math.max(0, storm.remaining - deltaSeconds);
    if (storm.remaining > 0) {
      roll += rollSpeed * deltaSeconds;
      if (Math.random() < 0.5) {
        startTear(0.02, 0.08, 0.05);
      }
    } else {
      roll = 0;
    }
    flash = Math.max(0, flash - deltaSeconds * 2.5);
  }

  function uniforms() {
    const stormLevel = storm.duration > 0 ? storm.remaining / storm.duration : 0;
    const isTearing = tear.remaining > 0;
    return {
      shakeX: shake.x / width,
      shakeY: shake.y / height,
      bandY: isTearing ? tear.y : -1,
      bandHeight: isTearing ? tear.height : 0,
      bandOffset: isTearing ? tear.offset : 0,
      jitter: stormLevel * 0.02 * strength,
      split: stormLevel * 0.012 * strength,
      roll: roll - Math.floor(roll),
      flash,
      flicker: 0.975 + Math.random() * 0.025,
    };
  }

  return { trigger, update, uniforms };
}
