// Shared rounded-elbow SVG path builder for Gantt dependency connectors.
// Used by both Gantt.tsx (single project) and PortfolioGantt.tsx (grouped).

export function buildDependencyPath(x1: number, y1: number, x2: number, y2: number, midX: number): string {
  const dir = y2 >= y1 ? 1 : -1;
  const r = Math.max(2, Math.min(8, midX - x1, x2 - midX, Math.abs(y2 - y1) / 2));

  if (r < 2.5 || y1 === y2) {
    return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
  }

  return (
    `M ${x1} ${y1} ` +
    `H ${midX - r} Q ${midX} ${y1} ${midX} ${y1 + dir * r} ` +
    `V ${y2 - dir * r} Q ${midX} ${y2} ${midX + r} ${y2} ` +
    `H ${x2}`
  );
}
