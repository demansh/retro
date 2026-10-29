const SHADES = ["#404040", "#808080", "#c0c0c0", "#ffffff"];

export function createParticles(capacity = 256) {
  const positionX = new Float32Array(capacity);
  const positionY = new Float32Array(capacity);
  const velocityX = new Float32Array(capacity);
  const velocityY = new Float32Array(capacity);
  const gravity = new Float32Array(capacity);
  const life = new Float32Array(capacity);
  const maxLife = new Float32Array(capacity);
  const size = new Uint8Array(capacity);
  let cursor = 0;

  function emit(x, y, { count = 20, angle = 0, spread = Math.PI * 2, speed = [20, 80], lifetime = [0.3, 0.8], sizes = [1, 2], fall = 0 } = {}) {
    for (let emitted = 0; emitted < count; emitted++) {
      const index = cursor;
      cursor = (cursor + 1) % capacity;
      const direction = angle + (Math.random() - 0.5) * spread;
      const velocity = speed[0] + Math.random() * (speed[1] - speed[0]);
      positionX[index] = x;
      positionY[index] = y;
      velocityX[index] = Math.cos(direction) * velocity;
      velocityY[index] = Math.sin(direction) * velocity;
      gravity[index] = fall;
      maxLife[index] = lifetime[0] + Math.random() * (lifetime[1] - lifetime[0]);
      life[index] = maxLife[index];
      size[index] = sizes[Math.floor(Math.random() * sizes.length)];
    }
  }

  function update(deltaSeconds) {
    for (let index = 0; index < capacity; index++) {
      if (life[index] <= 0) {
        continue;
      }
      life[index] -= deltaSeconds;
      velocityY[index] += gravity[index] * deltaSeconds;
      positionX[index] += velocityX[index] * deltaSeconds;
      positionY[index] += velocityY[index] * deltaSeconds;
    }
  }

  function draw(context) {
    for (let index = 0; index < capacity; index++) {
      if (life[index] <= 0) {
        continue;
      }
      const shadeIndex = Math.min(SHADES.length - 1, Math.floor((life[index] / maxLife[index]) * SHADES.length));
      context.fillStyle = SHADES[shadeIndex];
      context.fillRect(Math.round(positionX[index]), Math.round(positionY[index]), size[index], size[index]);
    }
  }

  function clear() {
    life.fill(0);
  }

  return { emit, update, draw, clear };
}
