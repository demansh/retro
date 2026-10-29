const TAP_MAX_MS = 250;
const TAP_MAX_DISTANCE = 10;
const LONG_PRESS_MS = 500;
const EDGE_ZONE_PX = 48;
const EDGE_SWIPE_DISTANCE = 80;

export function createInput(element, { onDrag = () => {}, onTap = () => {}, onLongPress = () => {}, onEdgeSwipe = () => {}, onKey = () => {}, onInteraction = () => {} } = {}) {
  const pressedKeys = new Set();
  let gesture = null;

  function cancelLongPress() {
    if (gesture && gesture.longPressTimer) {
      window.clearTimeout(gesture.longPressTimer);
      gesture.longPressTimer = 0;
    }
  }

  function handlePointerDown(event) {
    onInteraction();
    if (gesture) {
      return;
    }
    event.preventDefault();
    element.setPointerCapture?.(event.pointerId);
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startTime: performance.now(),
      isFromEdge: event.clientX <= EDGE_ZONE_PX,
      hasMoved: false,
      isConsumed: false,
      longPressTimer: 0,
    };
    gesture.longPressTimer = window.setTimeout(() => {
      if (gesture && !gesture.hasMoved) {
        gesture.isConsumed = true;
        gesture.longPressTimer = 0;
        onLongPress();
      }
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    event.preventDefault();
    const deltaX = event.clientX - gesture.lastX;
    const deltaY = event.clientY - gesture.lastY;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const totalX = event.clientX - gesture.startX;
    const totalY = event.clientY - gesture.startY;
    if (!gesture.hasMoved && Math.hypot(totalX, totalY) > TAP_MAX_DISTANCE) {
      gesture.hasMoved = true;
      cancelLongPress();
    }
    if (gesture.isFromEdge && !gesture.isConsumed && totalX > EDGE_SWIPE_DISTANCE && totalX > Math.abs(totalY) * 2) {
      gesture.isConsumed = true;
      onEdgeSwipe();
      return;
    }
    if (!gesture.isConsumed) {
      onDrag(deltaX, deltaY);
    }
  }

  function handlePointerUp(event) {
    onInteraction();
    if (!gesture || event.pointerId !== gesture.pointerId) {
      return;
    }
    cancelLongPress();
    const duration = performance.now() - gesture.startTime;
    if (!gesture.isConsumed && !gesture.hasMoved && duration <= TAP_MAX_MS) {
      onTap(event.clientX, event.clientY);
    }
    gesture = null;
  }

  function handlePointerCancel(event) {
    if (gesture && event.pointerId === gesture.pointerId) {
      cancelLongPress();
      gesture = null;
    }
  }

  function handleKeyDown(event) {
    onInteraction();
    if (!pressedKeys.has(event.code)) {
      onKey(event.code);
    }
    pressedKeys.add(event.code);
    if (event.code.startsWith("Arrow") || event.code === "Space") {
      event.preventDefault();
    }
  }

  function handleKeyUp(event) {
    pressedKeys.delete(event.code);
  }

  function handleBlur() {
    pressedKeys.clear();
  }

  element.addEventListener("pointerdown", handlePointerDown);
  element.addEventListener("pointermove", handlePointerMove);
  element.addEventListener("pointerup", handlePointerUp);
  element.addEventListener("pointercancel", handlePointerCancel);
  element.addEventListener("contextmenu", (event) => event.preventDefault());
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("blur", handleBlur);

  return {
    isKeyDown: (...codes) => codes.some((code) => pressedKeys.has(code)),
  };
}
