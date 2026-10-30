const TAP_MAX_MS = 250;
const TAP_MAX_DISTANCE = 10;
const LONG_PRESS_MS = 500;

export function createInput(element, { onDrag = () => {}, onTap = () => {}, onLongPress = () => {}, onKey = () => {}, onInteraction = () => {}, onMenu = () => {}, isMenuZone = () => false, onPress = () => {}, onRelease = () => {}, onKeyUp = () => {} } = {}) {
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
      isMenu: isMenuZone(event.clientX, event.clientY),
      hasMoved: false,
      isConsumed: false,
      longPressTimer: 0,
    };
    if (gesture.isMenu) {
      return;
    }
    onPress(event.clientX, event.clientY);
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
    if (gesture.isMenu) {
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
    if (gesture.isMenu) {
      if (!gesture.hasMoved) {
        onMenu();
      }
    } else {
      onRelease(event.clientX, event.clientY, false);
      if (!gesture.isConsumed && !gesture.hasMoved && duration <= TAP_MAX_MS) {
        onTap(event.clientX, event.clientY);
      }
    }
    gesture = null;
  }

  function handlePointerCancel(event) {
    if (gesture && event.pointerId === gesture.pointerId) {
      cancelLongPress();
      if (!gesture.isMenu) {
        onRelease(event.clientX, event.clientY, true);
      }
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
    if (pressedKeys.delete(event.code)) {
      onKeyUp(event.code);
    }
  }

  function handleBlur() {
    const releasedKeys = [...pressedKeys];
    pressedKeys.clear();
    releasedKeys.forEach((code) => onKeyUp(code));
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
