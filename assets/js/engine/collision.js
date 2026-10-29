export function overlaps(first, second) {
  return (
    first.x < second.x + second.w &&
    first.x + first.w > second.x &&
    first.y < second.y + second.h &&
    first.y + first.h > second.y
  );
}

function axisEntryExit(position, size, targetPosition, targetSize, delta) {
  if (delta === 0) {
    const isOverlapping = position < targetPosition + targetSize && position + size > targetPosition;
    return isOverlapping ? [-Infinity, Infinity] : [Infinity, -Infinity];
  }
  const nearDistance = delta > 0 ? targetPosition - (position + size) : targetPosition + targetSize - position;
  const farDistance = delta > 0 ? targetPosition + targetSize - position : targetPosition - (position + size);
  return [nearDistance / delta, farDistance / delta];
}

export function sweptAabb(box, deltaX, deltaY, target) {
  const [entryX, exitX] = axisEntryExit(box.x, box.w, target.x, target.w, deltaX);
  const [entryY, exitY] = axisEntryExit(box.y, box.h, target.y, target.h, deltaY);
  const entryTime = Math.max(entryX, entryY);
  const exitTime = Math.min(exitX, exitY);
  if (entryTime >= exitTime || entryTime < 0 || entryTime > 1) {
    return null;
  }
  if (entryX > entryY) {
    return { time: entryTime, normalX: deltaX > 0 ? -1 : 1, normalY: 0 };
  }
  return { time: entryTime, normalX: 0, normalY: deltaY > 0 ? -1 : 1 };
}
