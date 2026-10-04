export interface TouchStartPoint {
  x: number;
  y: number;
}

export function isRightEdgeBackSwipe(start: TouchStartPoint, end: TouchStartPoint, viewportWidth: number): boolean {
  return start.x >= viewportWidth - 44
    && start.x - end.x >= 80
    && Math.abs(start.y - end.y) < 70;
}
