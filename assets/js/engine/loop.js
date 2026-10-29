const MAX_FRAME_SECONDS = 0.25;

export function createLoop({ update, render, onError = (error) => console.error(error), step = 1 / 60 }) {
  let frameId = 0;
  let lastTime = 0;
  let accumulator = 0;
  let isRunning = false;
  let isSuspended = false;

  function frame(now) {
    try {
      const frameSeconds = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
      lastTime = now;
      accumulator += frameSeconds;
      while (accumulator >= step) {
        update(step);
        accumulator -= step;
      }
      render(frameSeconds);
      frameId = requestAnimationFrame(frame);
    } catch (error) {
      stop();
      onError(error);
    }
  }

  function start() {
    if (isRunning) {
      return;
    }
    isRunning = true;
    lastTime = performance.now();
    accumulator = 0;
    frameId = requestAnimationFrame(frame);
  }

  function stop() {
    isRunning = false;
    cancelAnimationFrame(frameId);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && isRunning) {
      isSuspended = true;
      stop();
    } else if (!document.hidden && isSuspended) {
      isSuspended = false;
      start();
    }
  });

  return { start, stop };
}
