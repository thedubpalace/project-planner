// Shared right-angle double-elbow ("S/Z zigzag") path builder for Gantt
// dependency connectors. Used by both Gantt.tsx (single project) and
// PortfolioGantt.tsx (grouped).
//
// A single elbow (H-V-H) always reads as a hook/bracket, since both
// horizontal runs point the same direction regardless of where the bend
// sits. This instead jogs a short, fixed distance out of the predecessor
// AND a matching short jog into the successor, with a horizontal run at
// the vertical midpoint connecting the two — the same formula produces a
// proper alternating-direction zigzag whether the successor sits far to
// the right of the predecessor or starts at/near the same column.

export function buildDependencyPath(x1: number, y1: number, x2: number, y2: number): string {
  const jog = 8;
  const midX1 = x1 + jog;
  const midX2 = x2 - jog;
  const midY = (y1 + y2) / 2;
  return (
    `M ${x1} ${y1} L ${midX1} ${y1} L ${midX1} ${midY} ` +
    `L ${midX2} ${midY} L ${midX2} ${y2} L ${x2} ${y2}`
  );
}
