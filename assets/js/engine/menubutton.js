const ICON_RIGHT_MARGIN = 10;
const ICON_TOP = 3;
const BAR_WIDTH = 2;
const BAR_GAP = 1;
const BAR_HEIGHT = 5;
const ICON_WIDTH = BAR_WIDTH * 2 + BAR_GAP;
const MIN_HIT_HALF_CSS = 22;
const MIN_HIT_HALF_BUFFER = 6;

export function createMenuButton(display, bufferWidth) {
  const left = bufferWidth - ICON_RIGHT_MARGIN - ICON_WIDTH;
  const centerX = left + ICON_WIDTH / 2;
  const centerY = ICON_TOP + BAR_HEIGHT / 2;

  function containsClient(clientX, clientY) {
    const point = display.clientToBuffer(clientX, clientY);
    const hitHalf = Math.max(MIN_HIT_HALF_CSS * display.cssToBufferScale(), MIN_HIT_HALF_BUFFER);
    return Math.abs(point.x - centerX) <= hitHalf && Math.abs(point.y - centerY) <= hitHalf;
  }

  function draw(buffer, color) {
    buffer.rect(left, ICON_TOP, BAR_WIDTH, BAR_HEIGHT, color);
    buffer.rect(left + BAR_WIDTH + BAR_GAP, ICON_TOP, BAR_WIDTH, BAR_HEIGHT, color);
  }

  return { left, containsClient, draw };
}
