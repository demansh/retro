const MAX_DEVICE_PIXEL_RATIO = 2;
const MAX_CANVAS_WIDTH = 2048;

export function createBuffer(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.imageSmoothingEnabled = false;

  function clear(color = "#000") {
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
  }

  function rect(x, y, rectWidth, rectHeight, color) {
    context.fillStyle = color;
    context.fillRect(Math.round(x), Math.round(y), Math.round(rectWidth), Math.round(rectHeight));
  }

  return { canvas, context, width, height, clear, rect };
}

export function createDisplay(canvas, width, height, onResize = () => {}) {
  const aspect = width / height;
  let cssWidth = 0;
  let cssHeight = 0;

  function resize() {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    cssWidth = Math.min(viewportWidth, viewportHeight * aspect);
    cssHeight = cssWidth / aspect;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
    const pixelWidth = Math.min(Math.round(cssWidth * pixelRatio), MAX_CANVAS_WIDTH);
    canvas.width = pixelWidth;
    canvas.height = Math.round(pixelWidth / aspect);
    onResize(canvas.width, canvas.height);
  }

  function clientToBuffer(clientX, clientY) {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((clientX - bounds.left) / bounds.width) * width,
      y: ((clientY - bounds.top) / bounds.height) * height,
    };
  }

  function cssToBufferScale() {
    return cssHeight > 0 ? height / cssHeight : 1;
  }

  function fittedWidth(viewportWidth, viewportHeight) {
    return Math.min(viewportWidth, viewportHeight * aspect);
  }

  function gestureScale() {
    if (!window.matchMedia("(pointer: coarse)").matches) {
      return cssToBufferScale();
    }
    const bestWidth = Math.max(fittedWidth(window.innerWidth, window.innerHeight), fittedWidth(window.innerHeight, window.innerWidth));
    return bestWidth > 0 ? width / bestWidth : 1;
  }

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);
  resize();

  return { canvas, resize, clientToBuffer, cssToBufferScale, gestureScale };
}
