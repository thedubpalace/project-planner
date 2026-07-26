// Shared right-angle elbow path builder for Gantt dependency connectors.
// Used by both Gantt.tsx (single project) and PortfolioGantt.tsx (grouped).

export function buildDependencyPath(x1: number, y1: number, x2: number, y2: number): string {
  // Center the bend between the two bars. Previously this was pinned close to
  // x2 (`max(x1+8, x2-8)` resolves to x2-8 whenever the gap exceeds 16px),
  // which crammed both corners into one compact hook next to the target bar
  // instead of a spread-out step — falls back to the old clamp only when the
  // bars are close enough that a true midpoint would sit under either bar.
  const midX = Math.max(x1 + 8, Math.min(x2 - 8, (x1 + x2) / 2));
  return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
}
