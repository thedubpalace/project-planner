// Shared right-angle double-elbow ("S/Z zigzag") path builder for Gantt
// dependency connectors. Used by both Gantt.tsx (single project) and
// PortfolioGantt.tsx (grouped).
//
// A single elbow (H-V-H) always reads as a hook/bracket, since both
// horizontal runs point the same direction regardless of where the bend
// sits. This instead jogs a short, fixed distance out of the predecessor,
// drops to the vertical midpoint, then travels to the successor's column
// (right for the common wide-gap case, left when the successor starts at
// or near the predecessor's end column) before dropping in — the same
// formula produces a proper alternating-direction zigzag in both cases.

export function buildDependencyPath(x1: number, y1: number, x2: number, y2: number): string {
  const jog = 8;
  const midX = x1 + jog;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}
